const timeDisplay = document.getElementById("timeDisplay");
const timerTitle = document.getElementById("timerTitle");
const taskInput = document.getElementById("taskInput");
const minutesInput = document.getElementById("minutesInput");
const secondsInput = document.getElementById("secondsInput");
const setButton = document.getElementById("setButton");
const startPauseButton = document.getElementById("startPauseButton");
const resetButton = document.getElementById("resetButton");
const alarmButton = document.getElementById("alarmButton");
const stopAlarmButton = document.getElementById("stopAlarmButton");
const selectAudioButton = document.getElementById("selectAudioButton");
const clearAudioButton = document.getElementById("clearAudioButton");
const registeredAudioName = document.getElementById("registeredAudioName");
const browserAudioInput = document.getElementById("browserAudioInput");
const volumeInput = document.getElementById("volumeInput");
const volumeValue = document.getElementById("volumeValue");
const memoInput = document.getElementById("memoInput");
const statusText = document.getElementById("statusText");
const pinButton = document.getElementById("pinButton");
const minimizeButton = document.getElementById("minimizeButton");
const closeButton = document.getElementById("closeButton");
const timerTabButton = document.getElementById("timerTabButton");
const memoTabButton = document.getElementById("memoTabButton");
const timerPanel = document.getElementById("timerPanel");
const memoPanel = document.getElementById("memoPanel");
const desktopApi = window.pomodoroWindow || null;
const bundledAudio = {
  name: "タイマー終了にゃん.mp3",
  path: "内蔵音源",
  url: "アラーム音(SUNO作成)/タイマー終了にゃん.mp3",
  bundled: true
};

let totalSeconds = 25 * 60;
let remainingSeconds = totalSeconds;
let running = false;
let endAt = 0;
let tickIntervalId = 0;
let audioContext;
let alarmId = "catVoice";
let melodyTimerId = 0;
let melodyLooping = false;
let activeAudioNodes = [];
let registeredAudio = desktopApi ? null : bundledAudio;
let registeredAudioPlayer = null;
let alarmVolume = 1;
let activeTab = "timer";
const masterVolume = 2;
const catAlarmMessage = "タイマー終了のお知らせだにゃ。一旦深呼吸して気持ちをリセットしよう";

function clamp(value, min, max) {
  const number = Number.parseInt(value, 10);
  if (Number.isNaN(number)) return min;
  return Math.min(Math.max(number, min), max);
}

function formatTime(seconds) {
  const safeSeconds = Math.max(0, Math.ceil(seconds));
  const minutes = Math.floor(safeSeconds / 60);
  const rest = safeSeconds % 60;
  return `${minutes}:${String(rest).padStart(2, "0")}`;
}

function render() {
  timeDisplay.textContent = formatTime(remainingSeconds);
  startPauseButton.textContent = running ? "一時停止" : "開始";
  stopAlarmButton.disabled = !melodyLooping && !registeredAudioPlayer;
  clearAudioButton.disabled = !registeredAudio || registeredAudio.bundled;
  registeredAudioName.textContent = registeredAudio
    ? `${registeredAudio.bundled ? "内蔵: " : ""}${registeredAudio.name}`
    : "未登録: ネコ音声で通知";
  registeredAudioName.title = registeredAudio ? registeredAudio.path : "";
  volumeInput.value = Math.round(alarmVolume * 100);
  volumeValue.textContent = `${Math.round(alarmVolume * 100)}%`;
  if (!desktopApi) statusText.textContent = "Web表示";
  timerTabButton.classList.toggle("active", activeTab === "timer");
  memoTabButton.classList.toggle("active", activeTab === "memo");
  timerTabButton.setAttribute("aria-selected", String(activeTab === "timer"));
  memoTabButton.setAttribute("aria-selected", String(activeTab === "memo"));
  timerPanel.hidden = activeTab !== "timer";
  memoPanel.hidden = activeTab !== "memo";
  document.body.classList.toggle("finished", remainingSeconds <= 0 && !running);
}

function saveState() {
  localStorage.setItem(
    "pomodoroState",
    JSON.stringify({
      title: timerTitle.value,
      taskName: taskInput.value,
      memo: memoInput.value,
      alarmId,
      registeredAudio,
      alarmVolume,
      totalSeconds,
      remainingSeconds,
      running,
      endAt,
      activeTab
    })
  );
}

function loadState() {
  const raw = localStorage.getItem("pomodoroState");
  if (!raw) return;

  try {
    const state = JSON.parse(raw);
    timerTitle.value = state.title || "ポモドーロ終了まで";
    taskInput.value = state.taskName || "";
    memoInput.value = state.memo || "";
    alarmId = state.alarmId || "catVoice";
    registeredAudio = getLoadableAudio(state.registeredAudio);
    alarmVolume = Number.isFinite(Number(state.alarmVolume)) ? Math.min(Math.max(Number(state.alarmVolume), 0), 1) : 1;
    activeTab = state.activeTab === "memo" ? "memo" : "timer";
    totalSeconds = Math.max(1, Number(state.totalSeconds) || 25 * 60);
    running = Boolean(state.running && Number(state.endAt) > Date.now());
    endAt = running ? Number(state.endAt) : 0;
    remainingSeconds = running
      ? Math.max(0, (endAt - Date.now()) / 1000)
      : Math.max(0, Number(state.remainingSeconds) || totalSeconds);
    minutesInput.value = Math.floor(totalSeconds / 60);
    secondsInput.value = totalSeconds % 60;
  } catch {
    localStorage.removeItem("pomodoroState");
  }
}

function getLoadableAudio(audio) {
  if (!audio?.url) return desktopApi ? null : bundledAudio;
  if (!desktopApi && audio.url.startsWith("file:")) return bundledAudio;
  if (!desktopApi && audio.sessionOnly) return bundledAudio;
  return audio;
}

function setActiveTab(nextTab) {
  activeTab = nextTab === "memo" ? "memo" : "timer";
  saveState();
  render();
}

function setFromInputs() {
  stopAlarm();
  stopTimerTicker();
  const minutes = clamp(minutesInput.value, 0, 999);
  const seconds = clamp(secondsInput.value, 0, 59);
  totalSeconds = Math.max(1, minutes * 60 + seconds);
  remainingSeconds = totalSeconds;
  running = false;
  minutesInput.value = Math.floor(totalSeconds / 60);
  secondsInput.value = totalSeconds % 60;
  saveState();
  render();
}

function stopTimerTicker() {
  window.clearInterval(tickIntervalId);
  tickIntervalId = 0;
}

function updateRemainingFromClock() {
  if (!running) return;
  remainingSeconds = Math.max(0, (endAt - Date.now()) / 1000);

  if (remainingSeconds <= 0) {
    stopTimerTicker();
    finishTimer();
    return;
  }

  render();
}

function startTimerTicker() {
  stopTimerTicker();
  updateRemainingFromClock();
  tickIntervalId = window.setInterval(updateRemainingFromClock, 250);
}

function ensureAudioContext() {
  if (!audioContext) {
    audioContext = new AudioContext();
  }
  if (audioContext.state === "suspended") {
    audioContext.resume();
  }
  return audioContext;
}

function makeOscillatorTone({
  startOffset = 0,
  frequency = 440,
  endFrequency = frequency,
  duration = 0.25,
  type = "sine",
  volume = 0.26,
  filterFrequency = 2200
}) {
  const context = ensureAudioContext();
  const start = context.currentTime + startOffset;
  const oscillator = context.createOscillator();
  const gain = context.createGain();
  const filter = context.createBiquadFilter();

  oscillator.type = type;
  oscillator.frequency.setValueAtTime(frequency, start);
  oscillator.frequency.exponentialRampToValueAtTime(Math.max(1, endFrequency), start + duration);
  filter.type = "lowpass";
  filter.frequency.setValueAtTime(filterFrequency, start);

  gain.gain.setValueAtTime(0.0001, start);
  gain.gain.exponentialRampToValueAtTime(Math.min(volume * masterVolume * alarmVolume, 0.86), start + 0.025);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);

  oscillator.connect(filter);
  filter.connect(gain);
  gain.connect(context.destination);

  oscillator.start(start);
  oscillator.stop(start + duration);
  activeAudioNodes.push(oscillator);
  oscillator.addEventListener("ended", () => {
    activeAudioNodes = activeAudioNodes.filter((node) => node !== oscillator);
  });
}

function playNoiseBurst(startOffset, duration, volume, filterFrequency) {
  const context = ensureAudioContext();
  const sampleCount = Math.floor(context.sampleRate * duration);
  const buffer = context.createBuffer(1, sampleCount, context.sampleRate);
  const data = buffer.getChannelData(0);
  for (let index = 0; index < sampleCount; index += 1) {
    data[index] = (Math.random() * 2 - 1) * (1 - index / sampleCount);
  }

  const start = context.currentTime + startOffset;
  const source = context.createBufferSource();
  const gain = context.createGain();
  const filter = context.createBiquadFilter();
  source.buffer = buffer;
  filter.type = "bandpass";
  filter.frequency.setValueAtTime(filterFrequency, start);
  gain.gain.setValueAtTime(Math.min(volume * masterVolume * alarmVolume, 0.86), start);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
  source.connect(filter);
  filter.connect(gain);
  gain.connect(context.destination);
  source.start(start);
  source.stop(start + duration);
  activeAudioNodes.push(source);
  source.addEventListener("ended", () => {
    activeAudioNodes = activeAudioNodes.filter((node) => node !== source);
  });
}

function playHoot(startOffset, baseFrequency) {
  makeOscillatorTone({
    startOffset,
    frequency: baseFrequency * 1.08,
    endFrequency: baseFrequency,
    duration: 0.72,
    type: "sine",
    volume: 0.36,
    filterFrequency: 820
  });
  makeOscillatorTone({
    startOffset,
    frequency: baseFrequency * 0.5,
    endFrequency: baseFrequency * 0.48,
    duration: 0.72,
    type: "triangle",
    volume: 0.14,
    filterFrequency: 620
  });
}

function playNotes(notes, offset = 0) {
  notes.forEach((note) => {
    makeOscillatorTone({
      startOffset: offset + note.at,
      frequency: note.frequency,
      endFrequency: note.endFrequency || note.frequency * 0.998,
      duration: note.duration,
      type: note.type || "sine",
      volume: note.volume || 0.16,
      filterFrequency: note.filterFrequency || 3600
    });
  });
}

const melodyPatterns = {
  jpopSpark: {
    length: 5.2,
    play: () => {
      playNotes([
        { at: 0, frequency: 659, duration: 0.28, type: "triangle", volume: 0.18 },
        { at: 0.32, frequency: 784, duration: 0.28, type: "triangle", volume: 0.18 },
        { at: 0.64, frequency: 988, duration: 0.42, type: "sine", volume: 0.18 },
        { at: 1.2, frequency: 880, duration: 0.28, type: "triangle", volume: 0.17 },
        { at: 1.52, frequency: 784, duration: 0.28, type: "triangle", volume: 0.17 },
        { at: 1.84, frequency: 988, duration: 0.5, type: "sine", volume: 0.18 },
        { at: 2.52, frequency: 1175, duration: 0.34, type: "sine", volume: 0.17 },
        { at: 2.9, frequency: 1319, duration: 0.34, type: "sine", volume: 0.17 },
        { at: 3.28, frequency: 988, duration: 0.42, type: "triangle", volume: 0.16 },
        { at: 3.9, frequency: 880, duration: 0.38, type: "triangle", volume: 0.16 },
        { at: 4.34, frequency: 784, duration: 0.62, type: "sine", volume: 0.17 }
      ]);
      [0, 1.2, 2.52, 3.9].forEach((at) => {
        makeOscillatorTone({ startOffset: at, frequency: 330, duration: 0.42, type: "triangle", volume: 0.08, filterFrequency: 1400 });
      });
    }
  },
  jpopSunny: {
    length: 5.6,
    play: () => {
      playNotes([
        { at: 0, frequency: 587, duration: 0.34, type: "sine", volume: 0.17 },
        { at: 0.42, frequency: 740, duration: 0.34, type: "sine", volume: 0.17 },
        { at: 0.84, frequency: 880, duration: 0.34, type: "sine", volume: 0.17 },
        { at: 1.26, frequency: 988, duration: 0.56, type: "triangle", volume: 0.18 },
        { at: 2.04, frequency: 880, duration: 0.3, type: "sine", volume: 0.16 },
        { at: 2.4, frequency: 740, duration: 0.3, type: "sine", volume: 0.16 },
        { at: 2.76, frequency: 659, duration: 0.52, type: "triangle", volume: 0.17 },
        { at: 3.52, frequency: 740, duration: 0.34, type: "sine", volume: 0.16 },
        { at: 3.94, frequency: 880, duration: 0.34, type: "sine", volume: 0.16 },
        { at: 4.36, frequency: 1175, duration: 0.78, type: "triangle", volume: 0.18 }
      ]);
    }
  },
  cityPopDrive: {
    length: 6.2,
    play: () => {
      playNotes([
        { at: 0, frequency: 494, duration: 0.42, type: "triangle", volume: 0.15 },
        { at: 0.52, frequency: 659, duration: 0.32, type: "sine", volume: 0.16 },
        { at: 0.9, frequency: 740, duration: 0.54, type: "sine", volume: 0.16 },
        { at: 1.64, frequency: 831, duration: 0.32, type: "triangle", volume: 0.15 },
        { at: 2.02, frequency: 740, duration: 0.34, type: "sine", volume: 0.15 },
        { at: 2.48, frequency: 988, duration: 0.58, type: "sine", volume: 0.17 },
        { at: 3.36, frequency: 880, duration: 0.36, type: "triangle", volume: 0.15 },
        { at: 3.8, frequency: 740, duration: 0.42, type: "sine", volume: 0.15 },
        { at: 4.36, frequency: 659, duration: 0.34, type: "triangle", volume: 0.15 },
        { at: 4.84, frequency: 740, duration: 0.86, type: "sine", volume: 0.17 }
      ]);
      [0, 1.64, 3.36, 4.84].forEach((at) => {
        makeOscillatorTone({ startOffset: at, frequency: 247, duration: 0.72, type: "sine", volume: 0.06, filterFrequency: 1000 });
      });
    }
  },
  jazzSwing: {
    length: 5.8,
    play: () => {
      playNotes([
        { at: 0, frequency: 392, duration: 0.3, type: "triangle", volume: 0.16 },
        { at: 0.38, frequency: 494, duration: 0.46, type: "triangle", volume: 0.16 },
        { at: 0.96, frequency: 587, duration: 0.28, type: "sine", volume: 0.15 },
        { at: 1.32, frequency: 698, duration: 0.5, type: "sine", volume: 0.16 },
        { at: 2.08, frequency: 659, duration: 0.3, type: "triangle", volume: 0.15 },
        { at: 2.46, frequency: 587, duration: 0.42, type: "triangle", volume: 0.15 },
        { at: 3.12, frequency: 494, duration: 0.34, type: "sine", volume: 0.16 },
        { at: 3.56, frequency: 523, duration: 0.36, type: "sine", volume: 0.16 },
        { at: 4.06, frequency: 587, duration: 0.32, type: "triangle", volume: 0.15 },
        { at: 4.48, frequency: 784, duration: 0.7, type: "sine", volume: 0.17 }
      ]);
      [0, 1.32, 3.12, 4.48].forEach((at) => {
        makeOscillatorTone({ startOffset: at, frequency: 196, duration: 0.24, type: "triangle", volume: 0.07, filterFrequency: 1100 });
      });
    }
  },
  jazzCafe: {
    length: 6,
    play: () => {
      playNotes([
        { at: 0, frequency: 523, duration: 0.52, type: "sine", volume: 0.14 },
        { at: 0.68, frequency: 659, duration: 0.42, type: "sine", volume: 0.14 },
        { at: 1.22, frequency: 784, duration: 0.72, type: "triangle", volume: 0.15 },
        { at: 2.18, frequency: 698, duration: 0.4, type: "sine", volume: 0.14 },
        { at: 2.72, frequency: 587, duration: 0.58, type: "sine", volume: 0.14 },
        { at: 3.52, frequency: 659, duration: 0.42, type: "triangle", volume: 0.15 },
        { at: 4.08, frequency: 831, duration: 0.5, type: "sine", volume: 0.14 },
        { at: 4.72, frequency: 784, duration: 0.76, type: "sine", volume: 0.15 }
      ]);
    }
  },
  bossaMorning: {
    length: 6.4,
    play: () => {
      playNotes([
        { at: 0, frequency: 440, duration: 0.45, type: "triangle", volume: 0.14 },
        { at: 0.58, frequency: 554, duration: 0.34, type: "sine", volume: 0.14 },
        { at: 1.02, frequency: 659, duration: 0.62, type: "sine", volume: 0.15 },
        { at: 1.9, frequency: 622, duration: 0.36, type: "triangle", volume: 0.14 },
        { at: 2.38, frequency: 554, duration: 0.46, type: "sine", volume: 0.14 },
        { at: 3.08, frequency: 494, duration: 0.4, type: "triangle", volume: 0.14 },
        { at: 3.64, frequency: 587, duration: 0.46, type: "sine", volume: 0.14 },
        { at: 4.24, frequency: 740, duration: 0.6, type: "sine", volume: 0.15 },
        { at: 5.12, frequency: 659, duration: 0.74, type: "triangle", volume: 0.15 }
      ]);
      [0, 1.9, 3.08, 5.12].forEach((at) => {
        makeOscillatorTone({ startOffset: at, frequency: 220, duration: 0.36, type: "triangle", volume: 0.055, filterFrequency: 900 });
      });
    }
  },
  funkPop: {
    length: 4.8,
    play: () => {
      playNotes([
        { at: 0, frequency: 392, duration: 0.18, type: "square", volume: 0.09, filterFrequency: 1700 },
        { at: 0.22, frequency: 523, duration: 0.2, type: "triangle", volume: 0.15 },
        { at: 0.54, frequency: 659, duration: 0.2, type: "triangle", volume: 0.15 },
        { at: 0.86, frequency: 784, duration: 0.34, type: "sine", volume: 0.16 },
        { at: 1.48, frequency: 659, duration: 0.2, type: "triangle", volume: 0.15 },
        { at: 1.78, frequency: 784, duration: 0.2, type: "triangle", volume: 0.15 },
        { at: 2.08, frequency: 988, duration: 0.4, type: "sine", volume: 0.17 },
        { at: 2.86, frequency: 880, duration: 0.18, type: "triangle", volume: 0.15 },
        { at: 3.12, frequency: 784, duration: 0.18, type: "triangle", volume: 0.15 },
        { at: 3.46, frequency: 659, duration: 0.56, type: "sine", volume: 0.16 }
      ]);
      [0, 0.86, 2.08, 3.46].forEach((at) => {
        makeOscillatorTone({ startOffset: at, frequency: 196, duration: 0.16, type: "square", volume: 0.065, filterFrequency: 900 });
      });
    }
  },
  pianoPop: {
    length: 5.4,
    play: () => {
      playNotes([
        { at: 0, frequency: 523, duration: 0.48, type: "sine", volume: 0.16 },
        { at: 0.54, frequency: 659, duration: 0.48, type: "sine", volume: 0.16 },
        { at: 1.08, frequency: 784, duration: 0.64, type: "sine", volume: 0.17 },
        { at: 1.92, frequency: 659, duration: 0.34, type: "triangle", volume: 0.15 },
        { at: 2.32, frequency: 587, duration: 0.44, type: "sine", volume: 0.15 },
        { at: 2.94, frequency: 659, duration: 0.48, type: "sine", volume: 0.16 },
        { at: 3.52, frequency: 784, duration: 0.38, type: "triangle", volume: 0.15 },
        { at: 3.98, frequency: 988, duration: 0.82, type: "sine", volume: 0.17 }
      ]);
      [0, 1.92, 2.94].forEach((at) => {
        makeOscillatorTone({ startOffset: at, frequency: 262, duration: 0.54, type: "sine", volume: 0.06, filterFrequency: 1200 });
      });
    }
  },
  synthParade: {
    length: 5,
    play: () => {
      playNotes([
        { at: 0, frequency: 784, duration: 0.24, type: "sawtooth", volume: 0.12, filterFrequency: 3000 },
        { at: 0.3, frequency: 988, duration: 0.24, type: "triangle", volume: 0.16 },
        { at: 0.6, frequency: 1175, duration: 0.36, type: "sine", volume: 0.17 },
        { at: 1.14, frequency: 988, duration: 0.24, type: "triangle", volume: 0.16 },
        { at: 1.44, frequency: 1319, duration: 0.44, type: "sine", volume: 0.17 },
        { at: 2.16, frequency: 1175, duration: 0.24, type: "triangle", volume: 0.16 },
        { at: 2.46, frequency: 988, duration: 0.24, type: "triangle", volume: 0.16 },
        { at: 2.76, frequency: 784, duration: 0.5, type: "sine", volume: 0.16 },
        { at: 3.54, frequency: 988, duration: 0.3, type: "triangle", volume: 0.16 },
        { at: 3.9, frequency: 1175, duration: 0.72, type: "sine", volume: 0.17 }
      ]);
      [0, 1.44, 2.76, 3.9].forEach((at) => {
        makeOscillatorTone({ startOffset: at, frequency: 392, duration: 0.24, type: "square", volume: 0.045, filterFrequency: 1600 });
      });
    }
  },
  brassSmile: {
    length: 5.6,
    play: () => {
      playNotes([
        { at: 0, frequency: 523, duration: 0.36, type: "sawtooth", volume: 0.12, filterFrequency: 2200 },
        { at: 0.44, frequency: 659, duration: 0.36, type: "sawtooth", volume: 0.12, filterFrequency: 2200 },
        { at: 0.88, frequency: 784, duration: 0.52, type: "sawtooth", volume: 0.13, filterFrequency: 2400 },
        { at: 1.68, frequency: 698, duration: 0.34, type: "triangle", volume: 0.15 },
        { at: 2.1, frequency: 784, duration: 0.34, type: "sawtooth", volume: 0.12, filterFrequency: 2400 },
        { at: 2.52, frequency: 988, duration: 0.62, type: "sawtooth", volume: 0.13, filterFrequency: 2600 },
        { at: 3.48, frequency: 880, duration: 0.3, type: "triangle", volume: 0.15 },
        { at: 3.86, frequency: 784, duration: 0.34, type: "triangle", volume: 0.15 },
        { at: 4.32, frequency: 659, duration: 0.74, type: "sawtooth", volume: 0.13, filterFrequency: 2200 }
      ]);
      [0.88, 2.52, 4.32].forEach((at) => {
        makeOscillatorTone({ startOffset: at, frequency: 392, duration: 0.5, type: "triangle", volume: 0.075, filterFrequency: 1600 });
      });
    }
  }
};

function midiToFrequency(note) {
  return 440 * 2 ** ((note - 69) / 12);
}

function playChord(startOffset, midiNotes, duration, volume = 0.055, type = "triangle") {
  midiNotes.forEach((note, index) => {
    makeOscillatorTone({
      startOffset: startOffset + index * 0.018,
      frequency: midiToFrequency(note),
      endFrequency: midiToFrequency(note) * 0.996,
      duration,
      type,
      volume,
      filterFrequency: 2600
    });
  });
}

function playKick(startOffset, volume = 0.1) {
  makeOscillatorTone({
    startOffset,
    frequency: 115,
    endFrequency: 48,
    duration: 0.18,
    type: "sine",
    volume,
    filterFrequency: 700
  });
}

function playSnare(startOffset, volume = 0.04) {
  playNoiseBurst(startOffset, 0.11, volume, 1800);
  makeOscillatorTone({
    startOffset,
    frequency: 190,
    endFrequency: 150,
    duration: 0.08,
    type: "triangle",
    volume: volume * 0.85,
    filterFrequency: 900
  });
}

function playHat(startOffset, volume = 0.018) {
  playNoiseBurst(startOffset, 0.045, volume, 5200);
}

function playCrash(startOffset, volume = 0.042) {
  playNoiseBurst(startOffset, 0.38, volume, 6200);
}

function playTom(startOffset, midi = 43, volume = 0.07) {
  makeOscillatorTone({
    startOffset,
    frequency: midiToFrequency(midi),
    endFrequency: midiToFrequency(midi - 7),
    duration: 0.22,
    type: "triangle",
    volume,
    filterFrequency: 900
  });
}

function playArpeggio(chords, beat, style) {
  if (!style) return;
  const bar = beat * 4;
  const settings = {
    sparkle: { step: 0.5, duration: 0.22, type: "triangle", volume: 0.045, octave: 12 },
    city: { step: 0.5, duration: 0.34, type: "sine", volume: 0.035, octave: 12 },
    edm: { step: 0.25, duration: 0.12, type: "sawtooth", volume: 0.04, octave: 12 },
    bossa: { step: 0.75, duration: 0.28, type: "triangle", volume: 0.03, octave: 0 },
    piano: { step: 1, duration: 0.45, type: "sine", volume: 0.04, octave: 0 },
    brass: { step: 2, duration: 0.35, type: "sawtooth", volume: 0.045, octave: 12 }
  }[style];
  if (!settings) return;

  chords.forEach((chord, barIndex) => {
    const notes = [...chord.notes].sort((a, b) => a - b);
    for (let stepIndex = 0; stepIndex * settings.step < 4; stepIndex += 1) {
      const midi = notes[stepIndex % notes.length] + settings.octave;
      makeOscillatorTone({
        startOffset: barIndex * bar + stepIndex * settings.step * beat,
        frequency: midiToFrequency(midi),
        duration: settings.duration * beat,
        type: settings.type,
        volume: settings.volume,
        filterFrequency: style === "edm" ? 5200 : 3600
      });
    }
  });
}

function playDrumPattern(drum, totalBeats, beat) {
  for (let beatIndex = 0; beatIndex < totalBeats; beatIndex += 1) {
    const at = beatIndex * beat;
    const inBar = beatIndex % 4;

    if (drum === "edm") {
      playKick(at, 0.13);
      if (inBar === 2) playSnare(at, 0.05);
      playHat(at + beat * 0.5, 0.028);
      if (beatIndex % 16 === 0) playCrash(at, 0.045);
      continue;
    }

    if (drum === "rock") {
      if (inBar === 0 || inBar === 2 || inBar === 3) playKick(at, 0.12);
      if (inBar === 1 || inBar === 3) playSnare(at, 0.055);
      playHat(at, 0.025);
      playHat(at + beat * 0.5, 0.022);
      if (beatIndex % 16 === 12) playTom(at + beat * 0.5, 45, 0.075);
      if (beatIndex % 16 === 0) playCrash(at, 0.05);
      continue;
    }

    if (drum === "funk") {
      if (inBar === 0 || inBar === 2) playKick(at, 0.105);
      if (inBar === 1) playKick(at + beat * 0.55, 0.075);
      if (inBar === 2) playSnare(at, 0.047);
      if (inBar === 3) playSnare(at + beat * 0.35, 0.028);
      playHat(at, 0.021);
      playHat(at + beat * 0.5, 0.018);
      continue;
    }

    if (drum === "swing") {
      if (inBar === 0) playKick(at, 0.065);
      if (inBar === 2) playSnare(at, 0.033);
      playHat(at, 0.018);
      playHat(at + beat * 0.66, 0.015);
      continue;
    }

    if (drum === "brush") {
      if (inBar === 0) playKick(at, 0.045);
      if (inBar === 2) playSnare(at, 0.022);
      playNoiseBurst(at + beat * 0.25, 0.16, 0.012, 3200);
      continue;
    }

    if (drum === "bossa") {
      if (inBar === 0 || inBar === 2) playKick(at, 0.055);
      playHat(at + beat * 0.45, 0.014);
      if (inBar === 1 || inBar === 3) playSnare(at + beat * 0.25, 0.018);
      continue;
    }

    if (drum === "ballad") {
      if (inBar === 0) playKick(at, 0.06);
      if (inBar === 2) playSnare(at, 0.026);
      playHat(at, 0.011);
      continue;
    }

    if (inBar === 0) playKick(at);
    if (inBar === 2) playSnare(at);
    playHat(at);
    playHat(at + beat * 0.5);
  }
}

function playSong({
  bpm,
  chords,
  lead,
  bass,
  leadType = "sine",
  chordType = "triangle",
  drum = "pop",
  arp = null,
  chordVolume = 0.05,
  bassVolume = 0.07,
  leadVolume = 0.12
}) {
  const beat = 60 / bpm;
  const bar = beat * 4;

  chords.forEach((chord, index) => {
    const at = index * bar;
    playChord(at, chord.notes, bar * 0.94, chord.volume || chordVolume, chordType);
    makeOscillatorTone({
      startOffset: at,
      frequency: midiToFrequency(chord.root),
      endFrequency: midiToFrequency(chord.root) * 0.995,
      duration: bar * 0.9,
      type: "sine",
      volume: chord.rootVolume || chordVolume,
      filterFrequency: 900
    });
  });

  bass.forEach((note) => {
    makeOscillatorTone({
      startOffset: note.at * beat,
      frequency: midiToFrequency(note.midi),
      endFrequency: midiToFrequency(note.midi) * 0.99,
      duration: note.len * beat,
      type: note.type || "triangle",
      volume: note.volume || bassVolume,
      filterFrequency: 1200
    });
  });

  lead.forEach((note) => {
    makeOscillatorTone({
      startOffset: note.at * beat,
      frequency: midiToFrequency(note.midi),
      endFrequency: midiToFrequency(note.to || note.midi) * 0.999,
      duration: note.len * beat,
      type: note.type || leadType,
      volume: note.volume || leadVolume,
      filterFrequency: note.filterFrequency || 4200
    });
  });

  const totalBeats = chords.length * 4;
  playArpeggio(chords, beat, arp);
  playDrumPattern(drum, totalBeats, beat);

  return totalBeats * beat;
}

function makeBass(roots, beatOffsets = [0, 1.5, 2.5, 3.25]) {
  return roots.flatMap((root, barIndex) =>
    beatOffsets.map((offset, index) => ({
      at: barIndex * 4 + offset,
      midi: root + (index === 2 ? 7 : 0),
      len: index === 0 ? 0.9 : 0.42
    }))
  );
}

function makePattern(config) {
  return {
    length: (config.chords.length * 4 * 60) / config.bpm,
    play: () => playSong(config)
  };
}

const songPatterns = {
  jpopSpark: makePattern({
    bpm: 132,
    chords: [
      { root: 48, notes: [60, 64, 67, 71] },
      { root: 43, notes: [59, 62, 67, 71] },
      { root: 45, notes: [57, 60, 64, 69] },
      { root: 40, notes: [55, 59, 62, 67] },
      { root: 48, notes: [60, 64, 67, 72] },
      { root: 43, notes: [59, 62, 67, 74] },
      { root: 45, notes: [60, 64, 69, 76] },
      { root: 47, notes: [59, 62, 66, 74] }
    ],
    bass: makeBass([36, 31, 33, 28, 36, 31, 33, 35]),
    lead: [
      { at: 0, midi: 72, len: 1.2 }, { at: 1.25, midi: 76, len: 0.55 }, { at: 1.9, midi: 79, len: 1.0 },
      { at: 3.1, midi: 76, len: 0.8 }, { at: 4, midi: 74, len: 0.7 }, { at: 4.85, midi: 76, len: 0.5 },
      { at: 5.5, midi: 79, len: 1.2 }, { at: 7.05, midi: 81, len: 0.8 }, { at: 8, midi: 79, len: 1.1 },
      { at: 9.3, midi: 76, len: 0.6 }, { at: 10, midi: 74, len: 0.6 }, { at: 10.7, midi: 72, len: 1.1 },
      { at: 12, midi: 71, len: 0.65 }, { at: 12.8, midi: 72, len: 0.6 }, { at: 13.55, midi: 74, len: 0.55 },
      { at: 14.2, midi: 76, len: 0.55 }, { at: 14.9, midi: 79, len: 1.25 }, { at: 16.5, midi: 84, len: 1.4 },
      { at: 18.15, midi: 81, len: 0.75 }, { at: 19, midi: 79, len: 1.2 }, { at: 20.45, midi: 76, len: 0.75 },
      { at: 21.3, midi: 79, len: 0.85 }, { at: 22.35, midi: 81, len: 1.1 }, { at: 24, midi: 79, len: 0.75 },
      { at: 24.9, midi: 76, len: 0.65 }, { at: 25.7, midi: 74, len: 0.65 }, { at: 26.55, midi: 72, len: 0.75 },
      { at: 27.5, midi: 71, len: 0.55 }, { at: 28.15, midi: 72, len: 0.55 }, { at: 28.85, midi: 74, len: 0.6 },
      { at: 29.6, midi: 76, len: 1.8 }
    ],
    leadType: "triangle",
    drum: "pop",
    arp: "sparkle",
    leadVolume: 0.13
  }),
  jpopSunny: makePattern({
    bpm: 118,
    chords: [
      { root: 45, notes: [57, 61, 64, 69] }, { root: 40, notes: [55, 59, 64, 67] },
      { root: 42, notes: [54, 57, 61, 66] }, { root: 47, notes: [59, 62, 66, 71] },
      { root: 45, notes: [57, 61, 64, 72] }, { root: 40, notes: [55, 59, 64, 71] },
      { root: 42, notes: [57, 61, 66, 73] }, { root: 44, notes: [56, 59, 64, 68] }
    ],
    bass: makeBass([33, 28, 30, 35, 33, 28, 30, 32]),
    lead: [
      { at: 0, midi: 73, len: 1.0 }, { at: 1.1, midi: 76, len: 0.7 }, { at: 2, midi: 78, len: 1.4 },
      { at: 4, midi: 76, len: 0.8 }, { at: 4.95, midi: 73, len: 0.7 }, { at: 5.8, midi: 71, len: 1.2 },
      { at: 7.25, midi: 73, len: 0.6 }, { at: 8, midi: 76, len: 1.1 }, { at: 9.25, midi: 78, len: 0.75 },
      { at: 10.15, midi: 81, len: 1.1 }, { at: 11.5, midi: 78, len: 0.75 }, { at: 12.35, midi: 76, len: 0.8 },
      { at: 13.3, midi: 73, len: 0.7 }, { at: 14.15, midi: 71, len: 0.7 }, { at: 15, midi: 69, len: 1.1 },
      { at: 16.3, midi: 73, len: 0.8 }, { at: 17.25, midi: 76, len: 0.7 }, { at: 18.1, midi: 81, len: 1.5 },
      { at: 20, midi: 78, len: 0.9 }, { at: 21, midi: 76, len: 0.7 }, { at: 21.85, midi: 73, len: 0.85 },
      { at: 23, midi: 76, len: 0.75 }, { at: 24, midi: 78, len: 1.1 }, { at: 25.3, midi: 81, len: 0.8 },
      { at: 26.25, midi: 83, len: 1.2 }, { at: 28, midi: 81, len: 0.8 }, { at: 29, midi: 78, len: 0.7 },
      { at: 29.85, midi: 76, len: 1.7 }
    ],
    leadType: "sine",
    chordType: "sine",
    drum: "pop",
    arp: "sparkle",
    leadVolume: 0.12
  }),
  cityPopDrive: makePattern({
    bpm: 104,
    chords: [
      { root: 49, notes: [61, 65, 68, 72] }, { root: 44, notes: [59, 63, 68, 71] },
      { root: 46, notes: [58, 61, 65, 70] }, { root: 42, notes: [57, 61, 66, 69] },
      { root: 49, notes: [61, 65, 68, 75] }, { root: 44, notes: [59, 63, 68, 75] },
      { root: 46, notes: [61, 65, 70, 73] }, { root: 48, notes: [60, 64, 67, 71] }
    ],
    bass: makeBass([37, 32, 34, 30, 37, 32, 34, 36], [0, 1, 2.4, 3.2]),
    lead: [
      { at: 0, midi: 80, len: 1.4 }, { at: 1.6, midi: 77, len: 0.8 }, { at: 2.55, midi: 75, len: 1.1 },
      { at: 4, midi: 73, len: 0.75 }, { at: 4.9, midi: 75, len: 0.65 }, { at: 5.72, midi: 77, len: 1.35 },
      { at: 7.3, midi: 80, len: 0.65 }, { at: 8, midi: 82, len: 1.2 }, { at: 9.45, midi: 80, len: 0.8 },
      { at: 10.4, midi: 77, len: 1.15 }, { at: 12, midi: 75, len: 0.9 }, { at: 13.05, midi: 73, len: 0.75 },
      { at: 14, midi: 72, len: 1.4 }, { at: 16.2, midi: 77, len: 1.2 }, { at: 17.65, midi: 80, len: 1.0 },
      { at: 18.9, midi: 84, len: 1.35 }, { at: 20.7, midi: 82, len: 0.75 }, { at: 21.6, midi: 80, len: 0.9 },
      { at: 22.8, midi: 77, len: 1.0 }, { at: 24, midi: 75, len: 0.75 }, { at: 24.85, midi: 77, len: 0.75 },
      { at: 25.8, midi: 80, len: 1.1 }, { at: 27.2, midi: 82, len: 0.8 }, { at: 28.2, midi: 80, len: 0.85 },
      { at: 29.25, midi: 77, len: 1.8 }
    ],
    leadType: "sine",
    chordType: "sine",
    drum: "funk",
    arp: "city",
    bassVolume: 0.08
  }),
  jazzSwing: makePattern({
    bpm: 140,
    chords: [
      { root: 48, notes: [60, 64, 67, 70] }, { root: 45, notes: [57, 60, 64, 67] },
      { root: 50, notes: [62, 65, 69, 72] }, { root: 47, notes: [59, 63, 66, 69] },
      { root: 48, notes: [60, 64, 67, 71] }, { root: 45, notes: [60, 64, 69, 72] },
      { root: 50, notes: [62, 65, 69, 74] }, { root: 47, notes: [59, 62, 66, 71] }
    ],
    bass: makeBass([36, 33, 38, 35, 36, 33, 38, 35], [0, 1, 2, 3]),
    lead: [
      { at: 0, midi: 72, len: 0.75 }, { at: 0.9, midi: 76, len: 0.5 }, { at: 1.55, midi: 79, len: 0.9 },
      { at: 2.75, midi: 82, len: 0.65 }, { at: 3.55, midi: 79, len: 0.55 }, { at: 4.25, midi: 76, len: 0.85 },
      { at: 5.35, midi: 74, len: 0.7 }, { at: 6.25, midi: 72, len: 0.9 }, { at: 7.4, midi: 71, len: 0.55 },
      { at: 8.15, midi: 72, len: 0.75 }, { at: 9.05, midi: 76, len: 0.55 }, { at: 9.78, midi: 81, len: 0.95 },
      { at: 11, midi: 79, len: 0.65 }, { at: 11.85, midi: 76, len: 0.75 }, { at: 12.9, midi: 74, len: 0.6 },
      { at: 13.65, midi: 72, len: 0.7 }, { at: 14.55, midi: 71, len: 0.6 }, { at: 15.3, midi: 69, len: 0.8 },
      { at: 16.25, midi: 72, len: 0.9 }, { at: 17.4, midi: 76, len: 0.55 }, { at: 18.1, midi: 79, len: 0.95 },
      { at: 19.3, midi: 84, len: 0.8 }, { at: 20.35, midi: 82, len: 0.6 }, { at: 21.15, midi: 79, len: 0.85 },
      { at: 22.25, midi: 76, len: 0.75 }, { at: 23.2, midi: 74, len: 0.8 }, { at: 24.3, midi: 72, len: 0.6 },
      { at: 25.05, midi: 74, len: 0.55 }, { at: 25.8, midi: 76, len: 0.7 }, { at: 26.72, midi: 79, len: 0.75 },
      { at: 27.7, midi: 81, len: 0.65 }, { at: 28.55, midi: 79, len: 1.6 }
    ],
    leadType: "triangle",
    drum: "swing",
    chordVolume: 0.045,
    bassVolume: 0.075
  }),
  jazzCafe: makePattern({
    bpm: 88,
    chords: [
      { root: 50, notes: [62, 65, 69, 72] }, { root: 47, notes: [59, 62, 65, 69] },
      { root: 45, notes: [57, 60, 64, 67] }, { root: 48, notes: [60, 64, 67, 71] },
      { root: 50, notes: [62, 65, 69, 74] }, { root: 47, notes: [59, 62, 65, 72] },
      { root: 45, notes: [60, 64, 69, 72] }, { root: 48, notes: [60, 64, 67, 72] }
    ],
    bass: makeBass([38, 35, 33, 36, 38, 35, 33, 36], [0, 1.25, 2, 3.2]),
    lead: [
      { at: 0, midi: 74, len: 1.15 }, { at: 1.35, midi: 77, len: 0.7 }, { at: 2.2, midi: 81, len: 1.35 },
      { at: 4.05, midi: 79, len: 0.85 }, { at: 5.1, midi: 77, len: 0.7 }, { at: 6, midi: 74, len: 1.2 },
      { at: 8.2, midi: 72, len: 0.95 }, { at: 9.35, midi: 74, len: 0.85 }, { at: 10.4, midi: 76, len: 1.3 },
      { at: 12.2, midi: 79, len: 0.95 }, { at: 13.35, midi: 81, len: 0.8 }, { at: 14.35, midi: 79, len: 1.1 },
      { at: 16.25, midi: 77, len: 1.1 }, { at: 17.6, midi: 74, len: 0.8 }, { at: 18.55, midi: 72, len: 1.2 },
      { at: 20.2, midi: 74, len: 0.8 }, { at: 21.15, midi: 76, len: 0.75 }, { at: 22.05, midi: 79, len: 1.15 },
      { at: 24.2, midi: 81, len: 1.0 }, { at: 25.4, midi: 79, len: 0.85 }, { at: 26.45, midi: 77, len: 0.95 },
      { at: 27.75, midi: 74, len: 0.8 }, { at: 28.75, midi: 72, len: 1.8 }
    ],
    leadType: "sine",
    chordType: "sine",
    drum: "brush",
    leadVolume: 0.105,
    chordVolume: 0.04
  }),
  bossaMorning: makePattern({
    bpm: 100,
    chords: [
      { root: 45, notes: [57, 61, 64, 69] }, { root: 52, notes: [59, 64, 68, 71] },
      { root: 50, notes: [62, 65, 69, 74] }, { root: 47, notes: [59, 62, 66, 71] },
      { root: 45, notes: [57, 61, 64, 72] }, { root: 52, notes: [59, 64, 68, 76] },
      { root: 50, notes: [62, 65, 69, 77] }, { root: 47, notes: [59, 62, 66, 74] }
    ],
    bass: makeBass([33, 40, 38, 35, 33, 40, 38, 35], [0, 1.5, 2.25, 3.1]),
    lead: [
      { at: 0, midi: 73, len: 1.0 }, { at: 1.2, midi: 76, len: 0.9 }, { at: 2.3, midi: 78, len: 0.85 },
      { at: 3.35, midi: 76, len: 0.55 }, { at: 4.05, midi: 73, len: 0.85 }, { at: 5.1, midi: 71, len: 0.8 },
      { at: 6.05, midi: 69, len: 1.15 }, { at: 8.2, midi: 71, len: 0.9 }, { at: 9.3, midi: 73, len: 0.8 },
      { at: 10.3, midi: 76, len: 1.15 }, { at: 12.05, midi: 78, len: 0.8 }, { at: 13.05, midi: 76, len: 0.75 },
      { at: 14, midi: 73, len: 1.1 }, { at: 16.2, midi: 76, len: 1.0 }, { at: 17.45, midi: 78, len: 0.75 },
      { at: 18.4, midi: 81, len: 1.2 }, { at: 20.2, midi: 80, len: 0.8 }, { at: 21.2, midi: 78, len: 0.9 },
      { at: 22.35, midi: 76, len: 1.0 }, { at: 24.1, midi: 73, len: 0.85 }, { at: 25.15, midi: 71, len: 0.8 },
      { at: 26.1, midi: 69, len: 0.9 }, { at: 27.25, midi: 71, len: 0.75 }, { at: 28.15, midi: 73, len: 1.7 }
    ],
    leadType: "sine",
    drum: "bossa",
    arp: "bossa",
    chordVolume: 0.04,
    bassVolume: 0.06
  }),
  funkPop: makePattern({
    bpm: 122,
    chords: [
      { root: 43, notes: [55, 59, 62, 67] }, { root: 46, notes: [58, 62, 65, 70] },
      { root: 48, notes: [60, 64, 67, 72] }, { root: 50, notes: [62, 65, 69, 74] },
      { root: 43, notes: [55, 59, 62, 71] }, { root: 46, notes: [58, 62, 65, 72] },
      { root: 48, notes: [60, 64, 67, 76] }, { root: 50, notes: [62, 65, 69, 77] }
    ],
    bass: makeBass([31, 34, 36, 38, 31, 34, 36, 38], [0, 0.75, 1.5, 2.75, 3.25]),
    lead: [
      { at: 0, midi: 67, len: 0.55 }, { at: 0.7, midi: 71, len: 0.45 }, { at: 1.35, midi: 74, len: 0.6 },
      { at: 2.15, midi: 77, len: 0.75 }, { at: 3.2, midi: 74, len: 0.55 }, { at: 4, midi: 70, len: 0.5 },
      { at: 4.65, midi: 74, len: 0.5 }, { at: 5.35, midi: 77, len: 0.8 }, { at: 6.55, midi: 79, len: 0.75 },
      { at: 8, midi: 72, len: 0.65 }, { at: 8.85, midi: 76, len: 0.5 }, { at: 9.55, midi: 79, len: 0.9 },
      { at: 10.85, midi: 81, len: 0.65 }, { at: 11.75, midi: 79, len: 0.6 }, { at: 12.55, midi: 77, len: 0.55 },
      { at: 13.3, midi: 74, len: 0.55 }, { at: 14.1, midi: 72, len: 0.8 }, { at: 16, midi: 71, len: 0.75 },
      { at: 17, midi: 74, len: 0.55 }, { at: 17.75, midi: 77, len: 0.9 }, { at: 19, midi: 79, len: 0.7 },
      { at: 20, midi: 81, len: 0.65 }, { at: 20.85, midi: 79, len: 0.55 }, { at: 21.55, midi: 77, len: 0.7 },
      { at: 22.55, midi: 74, len: 0.65 }, { at: 23.4, midi: 72, len: 0.75 }, { at: 24.6, midi: 74, len: 0.55 },
      { at: 25.35, midi: 77, len: 0.7 }, { at: 26.3, midi: 79, len: 0.8 }, { at: 27.45, midi: 81, len: 0.75 },
      { at: 28.5, midi: 79, len: 1.5 }
    ],
    leadType: "sawtooth",
    drum: "funk",
    arp: "city",
    bassVolume: 0.09,
    leadVolume: 0.13
  }),
  pianoPop: makePattern({
    bpm: 84,
    chords: [
      { root: 48, notes: [60, 64, 67, 72] }, { root: 55, notes: [59, 62, 67, 71] },
      { root: 45, notes: [57, 60, 64, 69] }, { root: 53, notes: [57, 60, 65, 69] },
      { root: 48, notes: [60, 64, 67, 76] }, { root: 55, notes: [59, 62, 67, 74] },
      { root: 45, notes: [60, 64, 69, 72] }, { root: 47, notes: [59, 62, 66, 71] }
    ],
    bass: makeBass([36, 43, 33, 41, 36, 43, 33, 35], [0, 2]),
    lead: [
      { at: 0, midi: 72, len: 1.55 }, { at: 1.85, midi: 76, len: 0.95 }, { at: 3.05, midi: 79, len: 1.55 },
      { at: 5, midi: 76, len: 1.1 }, { at: 6.3, midi: 74, len: 1.0 }, { at: 8, midi: 72, len: 1.25 },
      { at: 9.5, midi: 74, len: 0.85 }, { at: 10.55, midi: 76, len: 1.25 }, { at: 12.2, midi: 79, len: 1.0 },
      { at: 13.45, midi: 81, len: 0.85 }, { at: 14.55, midi: 79, len: 1.1 }, { at: 16.2, midi: 76, len: 1.45 },
      { at: 18, midi: 79, len: 0.95 }, { at: 19.2, midi: 84, len: 1.35 }, { at: 21, midi: 81, len: 0.95 },
      { at: 22.2, midi: 79, len: 1.25 }, { at: 24.1, midi: 76, len: 0.95 }, { at: 25.25, midi: 74, len: 0.9 },
      { at: 26.35, midi: 72, len: 1.0 }, { at: 27.6, midi: 71, len: 0.8 }, { at: 28.55, midi: 72, len: 2.1 }
    ],
    leadType: "sine",
    chordType: "sine",
    drum: "ballad",
    arp: "piano",
    leadVolume: 0.105,
    chordVolume: 0.045
  }),
  synthParade: makePattern({
    bpm: 150,
    chords: [
      { root: 50, notes: [62, 66, 69, 74] }, { root: 45, notes: [57, 61, 64, 69] },
      { root: 47, notes: [59, 62, 66, 71] }, { root: 43, notes: [55, 59, 62, 67] },
      { root: 50, notes: [62, 66, 69, 78] }, { root: 45, notes: [61, 64, 69, 73] },
      { root: 47, notes: [62, 66, 71, 74] }, { root: 49, notes: [61, 64, 68, 73] }
    ],
    bass: makeBass([38, 33, 35, 31, 38, 33, 35, 37]),
    lead: [
      { at: 0, midi: 74, len: 0.85 }, { at: 1, midi: 78, len: 0.7 }, { at: 1.85, midi: 81, len: 1.0 },
      { at: 3.1, midi: 83, len: 0.75 }, { at: 4, midi: 81, len: 0.65 }, { at: 4.8, midi: 78, len: 0.7 },
      { at: 5.65, midi: 74, len: 1.1 }, { at: 7, midi: 76, len: 0.7 }, { at: 8, midi: 78, len: 0.85 },
      { at: 9.05, midi: 81, len: 0.7 }, { at: 9.9, midi: 85, len: 1.0 }, { at: 11.15, midi: 83, len: 0.8 },
      { at: 12.15, midi: 81, len: 0.7 }, { at: 13, midi: 78, len: 0.75 }, { at: 13.95, midi: 76, len: 1.0 },
      { at: 16.1, midi: 81, len: 0.95 }, { at: 17.25, midi: 83, len: 0.75 }, { at: 18.2, midi: 86, len: 1.15 },
      { at: 19.65, midi: 85, len: 0.75 }, { at: 20.55, midi: 83, len: 0.85 }, { at: 21.65, midi: 81, len: 0.75 },
      { at: 22.6, midi: 78, len: 1.0 }, { at: 24, midi: 76, len: 0.7 }, { at: 24.85, midi: 78, len: 0.65 },
      { at: 25.65, midi: 81, len: 0.85 }, { at: 26.7, midi: 83, len: 0.8 }, { at: 27.7, midi: 81, len: 0.75 },
      { at: 28.65, midi: 78, len: 1.8 }
    ],
    leadType: "sawtooth",
    chordType: "sawtooth",
    drum: "edm",
    arp: "edm",
    bassVolume: 0.095,
    leadVolume: 0.145,
    chordVolume: 0.045
  }),
  brassSmile: makePattern({
    bpm: 138,
    chords: [
      { root: 48, notes: [60, 64, 67, 72] }, { root: 50, notes: [62, 65, 69, 74] },
      { root: 52, notes: [64, 68, 71, 76] }, { root: 55, notes: [67, 71, 74, 79] },
      { root: 48, notes: [60, 64, 67, 76] }, { root: 50, notes: [62, 65, 69, 77] },
      { root: 52, notes: [64, 68, 71, 79] }, { root: 47, notes: [59, 62, 66, 74] }
    ],
    bass: makeBass([36, 38, 40, 43, 36, 38, 40, 35], [0, 1, 2.5, 3.1]),
    lead: [
      { at: 0, midi: 72, len: 0.75 }, { at: 0.9, midi: 76, len: 0.65 }, { at: 1.75, midi: 79, len: 1.1 },
      { at: 3.15, midi: 84, len: 0.75 }, { at: 4.05, midi: 83, len: 0.7 }, { at: 4.9, midi: 81, len: 0.7 },
      { at: 5.75, midi: 79, len: 1.1 }, { at: 7.15, midi: 76, len: 0.75 }, { at: 8, midi: 79, len: 0.9 },
      { at: 9.1, midi: 83, len: 0.65 }, { at: 9.95, midi: 86, len: 1.1 }, { at: 11.35, midi: 84, len: 0.75 },
      { at: 12.25, midi: 83, len: 0.7 }, { at: 13.1, midi: 81, len: 0.7 }, { at: 13.95, midi: 79, len: 1.05 },
      { at: 16.1, midi: 84, len: 0.9 }, { at: 17.2, midi: 86, len: 0.75 }, { at: 18.15, midi: 88, len: 1.1 },
      { at: 19.55, midi: 86, len: 0.8 }, { at: 20.55, midi: 84, len: 0.8 }, { at: 21.55, midi: 83, len: 0.85 },
      { at: 22.65, midi: 81, len: 1.0 }, { at: 24.15, midi: 79, len: 0.75 }, { at: 25.05, midi: 81, len: 0.7 },
      { at: 25.9, midi: 83, len: 0.85 }, { at: 27, midi: 84, len: 0.8 }, { at: 28, midi: 83, len: 0.75 },
      { at: 28.9, midi: 79, len: 1.7 }
    ],
    leadType: "sawtooth",
    drum: "rock",
    arp: "brass",
    bassVolume: 0.085,
    leadVolume: 0.14,
    chordVolume: 0.06
  })
};

function beatTime(bpm, beat) {
  return (60 / bpm) * beat;
}

function playBeatNote(bpm, note, defaults = {}) {
  const midi = note.midi;
  makeOscillatorTone({
    startOffset: beatTime(bpm, note.at),
    frequency: midiToFrequency(midi),
    endFrequency: midiToFrequency(note.to || midi) * (note.endRatio || 0.999),
    duration: beatTime(bpm, note.len || defaults.len || 0.5),
    type: note.type || defaults.type || "sine",
    volume: note.volume || defaults.volume || 0.1,
    filterFrequency: note.filterFrequency || defaults.filterFrequency || 3600
  });
}

function playBeatNotes(bpm, notes, defaults = {}) {
  notes.forEach((note) => playBeatNote(bpm, note, defaults));
}

function playBeatChord(bpm, at, notes, len, options = {}) {
  notes.forEach((midi, index) => {
    playBeatNote(
      bpm,
      {
        at: at + (options.roll || 0) * index,
        midi,
        len,
        type: options.type || "triangle",
        volume: options.volume || 0.04,
        filterFrequency: options.filterFrequency || 2600
      }
    );
  });
}

function beatKick(bpm, at, volume) {
  playKick(beatTime(bpm, at), volume);
}

function beatSnare(bpm, at, volume) {
  playSnare(beatTime(bpm, at), volume);
}

function beatHat(bpm, at, volume) {
  playHat(beatTime(bpm, at), volume);
}

function beatCrash(bpm, at, volume) {
  playCrash(beatTime(bpm, at), volume);
}

function beatTom(bpm, at, midi, volume) {
  playTom(beatTime(bpm, at), midi, volume);
}

function playFourOnFloor(bpm, bars, heavy = false) {
  for (let bar = 0; bar < bars; bar += 1) {
    const base = bar * 4;
    [0, 1, 2, 3].forEach((step) => beatKick(bpm, base + step, heavy ? 0.14 : 0.1));
    [1, 3].forEach((step) => beatSnare(bpm, base + step, heavy ? 0.052 : 0.04));
    for (let step = 0; step < 4; step += 0.5) {
      beatHat(bpm, base + step + 0.5, heavy ? 0.03 : 0.02);
    }
    if (bar % 4 === 0) beatCrash(bpm, base, heavy ? 0.055 : 0.04);
  }
}

function playPopBackbeat(bpm, bars) {
  for (let bar = 0; bar < bars; bar += 1) {
    const base = bar * 4;
    beatKick(bpm, base, 0.105);
    beatKick(bpm, base + 2.65, 0.075);
    beatSnare(bpm, base + 2, 0.048);
    for (let step = 0; step < 4; step += 0.5) beatHat(bpm, base + step, 0.017);
    if (bar % 4 === 0) beatCrash(bpm, base, 0.038);
  }
}

function playRockBackbeat(bpm, bars) {
  for (let bar = 0; bar < bars; bar += 1) {
    const base = bar * 4;
    [0, 0.75, 2.5, 3.25].forEach((step) => beatKick(bpm, base + step, 0.13));
    [1, 3].forEach((step) => beatSnare(bpm, base + step, 0.06));
    for (let step = 0; step < 4; step += 0.5) beatHat(bpm, base + step, 0.026);
    if (bar % 4 === 3) {
      beatTom(bpm, base + 3.35, 45, 0.08);
      beatTom(bpm, base + 3.68, 40, 0.085);
    }
    if (bar % 4 === 0) beatCrash(bpm, base, 0.055);
  }
}

function playSwingRide(bpm, bars) {
  for (let bar = 0; bar < bars; bar += 1) {
    const base = bar * 4;
    beatKick(bpm, base, 0.055);
    beatSnare(bpm, base + 2, 0.03);
    for (let step = 0; step < 4; step += 1) {
      beatHat(bpm, base + step, 0.018);
      beatHat(bpm, base + step + 0.66, 0.015);
    }
  }
}

function playBrushGroove(bpm, bars) {
  for (let bar = 0; bar < bars; bar += 1) {
    const base = bar * 4;
    beatKick(bpm, base, 0.038);
    beatSnare(bpm, base + 2, 0.02);
    [0.25, 1.25, 2.25, 3.25].forEach((step) => {
      playNoiseBurst(beatTime(bpm, base + step), beatTime(bpm, 0.42), 0.01, 2800);
    });
  }
}

function playBossaGroove(bpm, bars) {
  for (let bar = 0; bar < bars; bar += 1) {
    const base = bar * 4;
    [0, 2].forEach((step) => beatKick(bpm, base + step, 0.052));
    [0.5, 1.5, 2.5, 3.5].forEach((step) => beatHat(bpm, base + step, 0.013));
    [1.25, 2.75, 3.35].forEach((step) => beatSnare(bpm, base + step, 0.018));
  }
}

function playFunkDrums(bpm, bars) {
  for (let bar = 0; bar < bars; bar += 1) {
    const base = bar * 4;
    [0, 1.5, 2.75].forEach((step) => beatKick(bpm, base + step, 0.1));
    [2, 3.35].forEach((step) => beatSnare(bpm, base + step, step === 2 ? 0.045 : 0.026));
    for (let step = 0; step < 4; step += 0.25) {
      if (step % 1 !== 0.75) beatHat(bpm, base + step, 0.014);
    }
  }
}

function playBalladPulse(bpm, bars) {
  for (let bar = 0; bar < bars; bar += 1) {
    const base = bar * 4;
    beatKick(bpm, base, 0.045);
    beatSnare(bpm, base + 2.5, 0.018);
    [0, 1, 2, 3].forEach((step) => beatHat(bpm, base + step, 0.008));
  }
}

function pattern(lengthBeats, bpm, play) {
  return {
    length: beatTime(bpm, lengthBeats),
    play: () => play(bpm)
  };
}

const distinctSongPatterns = {
  catVoice: {
    length: 9.5,
    play: () => playCatNotice()
  },
  jpopSpark: pattern(32, 146, (bpm) => {
    playPopBackbeat(bpm, 8);
    [
      [0, [64, 68, 71, 76]], [4, [61, 64, 68, 73]], [8, [66, 69, 73, 78]], [12, [59, 63, 66, 71]],
      [16, [64, 68, 71, 80]], [20, [61, 64, 68, 76]], [24, [66, 69, 73, 81]], [28, [63, 66, 70, 75]]
    ].forEach(([at, notes]) => playBeatChord(bpm, at, notes, 3.65, { type: "triangle", volume: 0.042, roll: 0.03 }));
    playBeatNotes(bpm, [
      { at: 0, midi: 40, len: 0.6 }, { at: 1, midi: 47, len: 0.35 }, { at: 2, midi: 52, len: 0.35 }, { at: 3.25, midi: 47, len: 0.35 },
      { at: 4, midi: 37, len: 0.6 }, { at: 5.2, midi: 44, len: 0.35 }, { at: 6.15, midi: 49, len: 0.35 }, { at: 7.2, midi: 44, len: 0.35 },
      { at: 8, midi: 42, len: 0.6 }, { at: 9, midi: 49, len: 0.35 }, { at: 10, midi: 54, len: 0.35 }, { at: 11.2, midi: 49, len: 0.35 },
      { at: 12, midi: 35, len: 0.7 }, { at: 13.3, midi: 42, len: 0.35 }, { at: 14.4, midi: 47, len: 0.35 },
      { at: 16, midi: 40, len: 0.6 }, { at: 17, midi: 47, len: 0.35 }, { at: 18, midi: 52, len: 0.35 }, { at: 19.25, midi: 47, len: 0.35 },
      { at: 20, midi: 37, len: 0.6 }, { at: 21.2, midi: 44, len: 0.35 }, { at: 22.15, midi: 49, len: 0.35 }, { at: 23.2, midi: 44, len: 0.35 },
      { at: 24, midi: 42, len: 0.6 }, { at: 25, midi: 49, len: 0.35 }, { at: 26, midi: 54, len: 0.35 }, { at: 27.2, midi: 57, len: 0.35 },
      { at: 28, midi: 39, len: 0.9 }, { at: 29.3, midi: 46, len: 0.45 }, { at: 30.2, midi: 51, len: 0.45 }
    ], { type: "square", volume: 0.055, filterFrequency: 1100 });
    playBeatNotes(bpm, [
      { at: 0, midi: 80, len: 1.0 }, { at: 1.2, midi: 83, len: 0.45 }, { at: 1.8, midi: 85, len: 0.65 }, { at: 2.75, midi: 88, len: 1.05 },
      { at: 4.2, midi: 85, len: 0.7 }, { at: 5.1, midi: 83, len: 0.5 }, { at: 5.8, midi: 80, len: 1.2 },
      { at: 8, midi: 81, len: 0.7 }, { at: 8.9, midi: 85, len: 0.55 }, { at: 9.65, midi: 88, len: 1.05 }, { at: 11.05, midi: 90, len: 0.75 },
      { at: 12, midi: 88, len: 0.55 }, { at: 12.75, midi: 85, len: 0.55 }, { at: 13.55, midi: 83, len: 0.85 }, { at: 14.65, midi: 80, len: 1.0 },
      { at: 16, midi: 88, len: 1.2 }, { at: 17.45, midi: 90, len: 0.55 }, { at: 18.2, midi: 92, len: 1.1 }, { at: 20, midi: 90, len: 0.7 },
      { at: 20.95, midi: 88, len: 0.55 }, { at: 21.75, midi: 85, len: 1.0 }, { at: 23.05, midi: 83, len: 0.65 },
      { at: 24, midi: 85, len: 0.55 }, { at: 24.7, midi: 88, len: 0.55 }, { at: 25.45, midi: 92, len: 1.15 }, { at: 27, midi: 90, len: 0.75 },
      { at: 28, midi: 88, len: 0.65 }, { at: 28.85, midi: 85, len: 0.6 }, { at: 29.65, midi: 83, len: 0.65 }, { at: 30.5, midi: 80, len: 1.35 }
    ], { type: "triangle", volume: 0.13, filterFrequency: 5200 });
    for (let at = 0; at < 32; at += 0.5) {
      const chordNotes = [88, 92, 95, 99];
      playBeatNote(bpm, { at, midi: chordNotes[Math.floor(at * 2) % chordNotes.length], len: 0.18, type: "sine", volume: 0.03, filterFrequency: 6200 });
    }
  }),
  jpopSunny: pattern(32, 108, (bpm) => {
    playPopBackbeat(bpm, 8);
    [[0, [57, 61, 64, 69]], [4, [52, 56, 59, 64]], [8, [54, 57, 61, 66]], [12, [59, 62, 66, 71]], [16, [57, 61, 64, 72]], [20, [52, 56, 59, 68]], [24, [54, 57, 61, 73]], [28, [56, 59, 64, 68]]]
      .forEach(([at, notes]) => playBeatChord(bpm, at, notes, 3.85, { type: "sine", volume: 0.045, roll: 0.08 }));
    playBeatNotes(bpm, [
      { at: 0, midi: 33, len: 1.2 }, { at: 2, midi: 40, len: 0.7 }, { at: 4, midi: 28, len: 1.2 }, { at: 6, midi: 35, len: 0.7 },
      { at: 8, midi: 30, len: 1.2 }, { at: 10, midi: 37, len: 0.7 }, { at: 12, midi: 35, len: 1.2 }, { at: 14, midi: 42, len: 0.7 },
      { at: 16, midi: 33, len: 1.2 }, { at: 18, midi: 40, len: 0.7 }, { at: 20, midi: 28, len: 1.2 }, { at: 22, midi: 35, len: 0.7 },
      { at: 24, midi: 30, len: 1.2 }, { at: 26, midi: 37, len: 0.7 }, { at: 28, midi: 32, len: 1.4 }, { at: 30, midi: 39, len: 0.8 }
    ], { type: "sine", volume: 0.06, filterFrequency: 900 });
    playBeatNotes(bpm, [
      { at: 0, midi: 73, len: 2.1 }, { at: 2.45, midi: 76, len: 1.0 }, { at: 3.7, midi: 78, len: 1.6 },
      { at: 6, midi: 76, len: 1.1 }, { at: 7.35, midi: 73, len: 1.35 }, { at: 9.2, midi: 71, len: 1.0 },
      { at: 10.45, midi: 69, len: 1.3 }, { at: 12.4, midi: 71, len: 0.95 }, { at: 13.55, midi: 73, len: 2.0 },
      { at: 16, midi: 76, len: 1.5 }, { at: 17.8, midi: 78, len: 1.0 }, { at: 19, midi: 81, len: 2.0 },
      { at: 21.5, midi: 78, len: 0.8 }, { at: 22.55, midi: 76, len: 1.1 }, { at: 24, midi: 73, len: 1.25 },
      { at: 25.55, midi: 76, len: 0.95 }, { at: 26.75, midi: 78, len: 1.2 }, { at: 28.3, midi: 81, len: 1.0 }, { at: 29.55, midi: 78, len: 1.9 }
    ], { type: "sine", volume: 0.12, filterFrequency: 4300 });
  }),
  cityPopDrive: pattern(32, 92, (bpm) => {
    playFunkDrums(bpm, 8);
    [[0, [61, 65, 68, 72]], [4, [59, 63, 68, 73]], [8, [58, 61, 65, 70]], [12, [57, 61, 66, 69]], [16, [61, 65, 68, 75]], [20, [59, 63, 68, 75]], [24, [61, 65, 70, 73]], [28, [60, 64, 67, 71]]]
      .forEach(([at, notes]) => {
        playBeatChord(bpm, at + 0.35, notes, 1.0, { type: "sine", volume: 0.038, roll: 0.025, filterFrequency: 2200 });
        playBeatChord(bpm, at + 2.25, notes, 1.1, { type: "triangle", volume: 0.032, roll: 0.02, filterFrequency: 2400 });
      });
    playBeatNotes(bpm, [
      { at: 0, midi: 37, len: 0.8 }, { at: 1.5, midi: 44, len: 0.4 }, { at: 2.35, midi: 49, len: 0.55 }, { at: 3.2, midi: 44, len: 0.35 },
      { at: 4, midi: 32, len: 0.8 }, { at: 5.25, midi: 39, len: 0.4 }, { at: 6.35, midi: 44, len: 0.55 }, { at: 7.2, midi: 39, len: 0.35 },
      { at: 8, midi: 34, len: 0.8 }, { at: 9.5, midi: 41, len: 0.4 }, { at: 10.35, midi: 46, len: 0.55 }, { at: 11.2, midi: 41, len: 0.35 },
      { at: 12, midi: 30, len: 0.8 }, { at: 13.5, midi: 37, len: 0.4 }, { at: 14.35, midi: 42, len: 0.55 }, { at: 15.2, midi: 37, len: 0.35 },
      { at: 16, midi: 37, len: 0.8 }, { at: 17.5, midi: 44, len: 0.4 }, { at: 18.35, midi: 49, len: 0.55 }, { at: 19.2, midi: 44, len: 0.35 },
      { at: 20, midi: 32, len: 0.8 }, { at: 21.25, midi: 39, len: 0.4 }, { at: 22.35, midi: 44, len: 0.55 }, { at: 23.2, midi: 39, len: 0.35 },
      { at: 24, midi: 34, len: 0.8 }, { at: 25.5, midi: 41, len: 0.4 }, { at: 26.35, midi: 46, len: 0.55 }, { at: 27.2, midi: 49, len: 0.35 },
      { at: 28, midi: 36, len: 1.1 }, { at: 30.1, midi: 43, len: 0.7 }
    ], { type: "triangle", volume: 0.08, filterFrequency: 1200 });
    playBeatNotes(bpm, [
      { at: 0.2, midi: 80, len: 1.5 }, { at: 2.15, midi: 77, len: 0.85 }, { at: 3.25, midi: 75, len: 1.25 },
      { at: 5, midi: 73, len: 0.8 }, { at: 6.05, midi: 75, len: 1.25 }, { at: 8.2, midi: 77, len: 1.2 },
      { at: 9.75, midi: 80, len: 0.85 }, { at: 10.9, midi: 82, len: 1.45 }, { at: 13.05, midi: 80, len: 0.8 },
      { at: 14.05, midi: 77, len: 1.4 }, { at: 16.4, midi: 84, len: 1.55 }, { at: 18.4, midi: 82, len: 1.0 },
      { at: 19.7, midi: 80, len: 1.4 }, { at: 21.75, midi: 77, len: 1.05 }, { at: 23.15, midi: 75, len: 1.0 },
      { at: 24.4, midi: 77, len: 1.1 }, { at: 25.8, midi: 80, len: 1.0 }, { at: 27.15, midi: 82, len: 1.1 },
      { at: 28.65, midi: 80, len: 1.0 }, { at: 30, midi: 77, len: 1.55 }
    ], { type: "sine", volume: 0.115, filterFrequency: 3600 });
  }),
  jazzSwing: pattern(32, 154, (bpm) => {
    playSwingRide(bpm, 8);
    const chords = [[0, [58, 62, 65, 69]], [4, [55, 59, 62, 65]], [8, [60, 64, 67, 71]], [12, [57, 61, 64, 67]], [16, [58, 62, 65, 72]], [20, [55, 59, 62, 69]], [24, [60, 64, 67, 74]], [28, [57, 61, 64, 70]]];
    chords.forEach(([at, notes]) => {
      playBeatChord(bpm, at, notes, 0.7, { type: "triangle", volume: 0.035, roll: 0.02 });
      playBeatChord(bpm, at + 2.65, notes, 0.55, { type: "triangle", volume: 0.03, roll: 0.015 });
    });
    const walk = [34, 36, 38, 39, 31, 33, 35, 36, 36, 38, 40, 41, 33, 35, 37, 38, 34, 36, 38, 41, 31, 33, 35, 38, 36, 38, 40, 43, 33, 35, 37, 40];
    playBeatNotes(bpm, walk.map((midi, at) => ({ at, midi, len: 0.78 })), { type: "triangle", volume: 0.065, filterFrequency: 1000 });
    playBeatNotes(bpm, [
      { at: 0, midi: 70, len: 0.55 }, { at: 0.78, midi: 74, len: 0.38 }, { at: 1.45, midi: 77, len: 0.65 }, { at: 2.5, midi: 81, len: 0.45 },
      { at: 3.15, midi: 79, len: 0.5 }, { at: 4, midi: 77, len: 0.45 }, { at: 4.62, midi: 74, len: 0.4 }, { at: 5.3, midi: 72, len: 0.7 },
      { at: 6.3, midi: 70, len: 0.4 }, { at: 7, midi: 69, len: 0.65 }, { at: 8, midi: 72, len: 0.55 }, { at: 8.72, midi: 76, len: 0.4 },
      { at: 9.35, midi: 79, len: 0.65 }, { at: 10.25, midi: 82, len: 0.42 }, { at: 10.85, midi: 84, len: 0.75 }, { at: 12.1, midi: 81, len: 0.48 },
      { at: 12.75, midi: 79, len: 0.5 }, { at: 13.45, midi: 77, len: 0.52 }, { at: 14.2, midi: 74, len: 0.65 }, { at: 15.2, midi: 70, len: 0.8 },
      { at: 16, midi: 74, len: 0.6 }, { at: 16.8, midi: 77, len: 0.42 }, { at: 17.45, midi: 81, len: 0.7 }, { at: 18.55, midi: 84, len: 0.45 },
      { at: 19.25, midi: 86, len: 0.65 }, { at: 20.3, midi: 84, len: 0.5 }, { at: 21, midi: 81, len: 0.62 }, { at: 22, midi: 79, len: 0.48 },
      { at: 22.7, midi: 77, len: 0.55 }, { at: 23.55, midi: 74, len: 0.7 }, { at: 24.55, midi: 72, len: 0.45 }, { at: 25.2, midi: 74, len: 0.42 },
      { at: 25.88, midi: 77, len: 0.55 }, { at: 26.72, midi: 79, len: 0.48 }, { at: 27.45, midi: 81, len: 0.75 }, { at: 28.65, midi: 79, len: 0.55 },
      { at: 29.45, midi: 77, len: 0.5 }, { at: 30.1, midi: 74, len: 1.0 }
    ], { type: "triangle", volume: 0.115, filterFrequency: 3500 });
  }),
  jazzCafe: pattern(24, 76, (bpm) => {
    playBrushGroove(bpm, 6);
    [[0, [62, 65, 69, 72]], [4, [59, 62, 65, 69]], [8, [57, 60, 64, 67]], [12, [60, 64, 67, 71]], [16, [62, 65, 69, 74]], [20, [59, 62, 65, 72]]]
      .forEach(([at, notes]) => playBeatChord(bpm, at + 0.25, notes, 3.2, { type: "sine", volume: 0.036, roll: 0.07, filterFrequency: 2100 }));
    playBeatNotes(bpm, [
      { at: 0, midi: 38, len: 1.4 }, { at: 2.3, midi: 45, len: 0.9 }, { at: 4, midi: 35, len: 1.5 }, { at: 6.5, midi: 42, len: 0.8 },
      { at: 8, midi: 33, len: 1.4 }, { at: 10.4, midi: 40, len: 0.9 }, { at: 12, midi: 36, len: 1.4 }, { at: 14.2, midi: 43, len: 1.0 },
      { at: 16, midi: 38, len: 1.5 }, { at: 18.2, midi: 45, len: 0.9 }, { at: 20, midi: 35, len: 1.6 }, { at: 22.2, midi: 42, len: 1.0 }
    ], { type: "sine", volume: 0.045, filterFrequency: 800 });
    playBeatNotes(bpm, [
      { at: 0.3, midi: 74, len: 2.1 }, { at: 3.1, midi: 77, len: 1.1 }, { at: 5.1, midi: 81, len: 2.2 },
      { at: 8.2, midi: 79, len: 1.2 }, { at: 10.15, midi: 77, len: 1.5 }, { at: 12.6, midi: 74, len: 1.2 },
      { at: 14.2, midi: 72, len: 1.8 }, { at: 17.1, midi: 74, len: 1.1 }, { at: 18.8, midi: 76, len: 1.4 },
      { at: 21.3, midi: 74, len: 0.9 }, { at: 22.55, midi: 72, len: 1.6 }
    ], { type: "sine", volume: 0.095, filterFrequency: 3000 });
  }),
  bossaMorning: pattern(32, 98, (bpm) => {
    playBossaGroove(bpm, 8);
    [[0, [57, 61, 64, 69]], [4, [59, 64, 68, 71]], [8, [62, 65, 69, 74]], [12, [59, 62, 66, 71]], [16, [57, 61, 64, 72]], [20, [59, 64, 68, 76]], [24, [62, 65, 69, 77]], [28, [59, 62, 66, 74]]]
      .forEach(([at, notes]) => {
        playBeatChord(bpm, at + 0.25, notes, 0.65, { type: "triangle", volume: 0.032, roll: 0.03 });
        playBeatChord(bpm, at + 1.55, notes, 0.5, { type: "triangle", volume: 0.026, roll: 0.02 });
        playBeatChord(bpm, at + 2.75, notes, 0.75, { type: "sine", volume: 0.03, roll: 0.02 });
      });
    playBeatNotes(bpm, [
      { at: 0, midi: 33, len: 0.8 }, { at: 1.5, midi: 40, len: 0.35 }, { at: 2.25, midi: 45, len: 0.55 }, { at: 3.1, midi: 40, len: 0.35 },
      { at: 4, midi: 40, len: 0.8 }, { at: 5.5, midi: 47, len: 0.35 }, { at: 6.25, midi: 52, len: 0.55 }, { at: 7.1, midi: 47, len: 0.35 },
      { at: 8, midi: 38, len: 0.8 }, { at: 9.5, midi: 45, len: 0.35 }, { at: 10.25, midi: 50, len: 0.55 }, { at: 11.1, midi: 45, len: 0.35 },
      { at: 12, midi: 35, len: 0.8 }, { at: 13.5, midi: 42, len: 0.35 }, { at: 14.25, midi: 47, len: 0.55 }, { at: 15.1, midi: 42, len: 0.35 },
      { at: 16, midi: 33, len: 0.8 }, { at: 17.5, midi: 40, len: 0.35 }, { at: 18.25, midi: 45, len: 0.55 }, { at: 19.1, midi: 40, len: 0.35 },
      { at: 20, midi: 40, len: 0.8 }, { at: 21.5, midi: 47, len: 0.35 }, { at: 22.25, midi: 52, len: 0.55 }, { at: 23.1, midi: 47, len: 0.35 },
      { at: 24, midi: 38, len: 0.8 }, { at: 25.5, midi: 45, len: 0.35 }, { at: 26.25, midi: 50, len: 0.55 }, { at: 27.1, midi: 45, len: 0.35 },
      { at: 28, midi: 35, len: 1.3 }, { at: 30, midi: 42, len: 0.85 }
    ], { type: "triangle", volume: 0.052, filterFrequency: 950 });
    playBeatNotes(bpm, [
      { at: 0.2, midi: 73, len: 0.95 }, { at: 1.45, midi: 76, len: 0.75 }, { at: 2.45, midi: 78, len: 1.05 },
      { at: 4.3, midi: 76, len: 0.65 }, { at: 5.3, midi: 73, len: 0.9 }, { at: 6.6, midi: 71, len: 1.15 },
      { at: 8.1, midi: 69, len: 0.85 }, { at: 9.3, midi: 71, len: 0.8 }, { at: 10.4, midi: 73, len: 1.15 },
      { at: 12.2, midi: 76, len: 0.9 }, { at: 13.4, midi: 78, len: 0.75 }, { at: 14.45, midi: 76, len: 1.2 },
      { at: 16.4, midi: 80, len: 1.0 }, { at: 17.7, midi: 78, len: 0.75 }, { at: 18.75, midi: 76, len: 1.2 },
      { at: 20.35, midi: 73, len: 0.8 }, { at: 21.45, midi: 71, len: 1.1 }, { at: 23.05, midi: 69, len: 0.9 },
      { at: 24.25, midi: 71, len: 0.8 }, { at: 25.25, midi: 73, len: 0.8 }, { at: 26.35, midi: 76, len: 1.25 },
      { at: 28.35, midi: 78, len: 0.8 }, { at: 29.35, midi: 76, len: 0.9 }, { at: 30.55, midi: 73, len: 1.4 }
    ], { type: "sine", volume: 0.102, filterFrequency: 3400 });
  }),
  funkPop: pattern(32, 118, (bpm) => {
    playFunkDrums(bpm, 8);
    [[0, [55, 59, 62, 67]], [4, [58, 62, 65, 70]], [8, [60, 64, 67, 72]], [12, [62, 65, 69, 74]], [16, [55, 59, 62, 71]], [20, [58, 62, 65, 72]], [24, [60, 64, 67, 76]], [28, [62, 65, 69, 77]]]
      .forEach(([at, notes]) => {
        [0.35, 1.6, 2.25, 3.35].forEach((step) => playBeatChord(bpm, at + step, notes, 0.28, { type: "sawtooth", volume: 0.027, filterFrequency: 2400 }));
      });
    playBeatNotes(bpm, [
      { at: 0, midi: 31, len: 0.35 }, { at: 0.75, midi: 38, len: 0.3 }, { at: 1.5, midi: 43, len: 0.32 }, { at: 2.75, midi: 38, len: 0.28 }, { at: 3.25, midi: 43, len: 0.32 },
      { at: 4, midi: 34, len: 0.35 }, { at: 4.75, midi: 41, len: 0.3 }, { at: 5.5, midi: 46, len: 0.32 }, { at: 6.75, midi: 41, len: 0.28 }, { at: 7.25, midi: 46, len: 0.32 },
      { at: 8, midi: 36, len: 0.35 }, { at: 8.75, midi: 43, len: 0.3 }, { at: 9.5, midi: 48, len: 0.32 }, { at: 10.75, midi: 43, len: 0.28 }, { at: 11.25, midi: 48, len: 0.32 },
      { at: 12, midi: 38, len: 0.35 }, { at: 12.75, midi: 45, len: 0.3 }, { at: 13.5, midi: 50, len: 0.32 }, { at: 14.75, midi: 45, len: 0.28 }, { at: 15.25, midi: 50, len: 0.32 }
    ].flatMap((riff) => [riff, { ...riff, at: riff.at + 16 }]), { type: "square", volume: 0.08, filterFrequency: 1000 });
    playBeatNotes(bpm, [
      { at: 0.25, midi: 67, len: 0.35 }, { at: 0.95, midi: 71, len: 0.28 }, { at: 1.45, midi: 74, len: 0.48 }, { at: 2.2, midi: 77, len: 0.52 },
      { at: 3.15, midi: 74, len: 0.35 }, { at: 4.35, midi: 70, len: 0.32 }, { at: 4.95, midi: 74, len: 0.35 }, { at: 5.65, midi: 77, len: 0.55 },
      { at: 6.6, midi: 79, len: 0.45 }, { at: 8.25, midi: 72, len: 0.35 }, { at: 8.95, midi: 76, len: 0.32 }, { at: 9.55, midi: 79, len: 0.55 },
      { at: 10.55, midi: 81, len: 0.45 }, { at: 11.35, midi: 79, len: 0.35 }, { at: 12.2, midi: 77, len: 0.35 }, { at: 12.95, midi: 74, len: 0.42 },
      { at: 13.75, midi: 72, len: 0.55 }, { at: 16.25, midi: 71, len: 0.35 }, { at: 16.95, midi: 74, len: 0.32 }, { at: 17.55, midi: 77, len: 0.6 },
      { at: 18.55, midi: 79, len: 0.42 }, { at: 19.25, midi: 81, len: 0.45 }, { at: 20.15, midi: 79, len: 0.35 }, { at: 20.8, midi: 77, len: 0.35 },
      { at: 21.5, midi: 74, len: 0.55 }, { at: 22.45, midi: 72, len: 0.45 }, { at: 24.25, midi: 74, len: 0.35 }, { at: 25, midi: 77, len: 0.42 },
      { at: 25.8, midi: 79, len: 0.55 }, { at: 26.8, midi: 81, len: 0.55 }, { at: 28.1, midi: 79, len: 0.4 }, { at: 28.75, midi: 77, len: 0.4 },
      { at: 29.45, midi: 74, len: 0.55 }, { at: 30.4, midi: 72, len: 0.8 }
    ], { type: "sawtooth", volume: 0.12, filterFrequency: 2600 });
  }),
  pianoPop: pattern(24, 68, (bpm) => {
    playBalladPulse(bpm, 6);
    const chords = [[0, [60, 64, 67, 72]], [4, [59, 62, 67, 71]], [8, [57, 60, 64, 69]], [12, [57, 60, 65, 69]], [16, [60, 64, 67, 76]], [20, [59, 62, 66, 71]]];
    chords.forEach(([at, notes]) => {
      for (let step = 0; step < 4; step += 0.5) {
        playBeatNote(bpm, { at: at + step, midi: notes[Math.floor(step * 2) % notes.length], len: 0.46, type: "sine", volume: 0.037, filterFrequency: 2800 });
      }
    });
    playBeatNotes(bpm, [
      { at: 0, midi: 36, len: 2.2 }, { at: 4, midi: 35, len: 2.0 }, { at: 8, midi: 33, len: 2.0 },
      { at: 12, midi: 41, len: 2.0 }, { at: 16, midi: 36, len: 2.3 }, { at: 20, midi: 35, len: 2.2 }
    ], { type: "sine", volume: 0.052, filterFrequency: 700 });
    playBeatNotes(bpm, [
      { at: 0.5, midi: 72, len: 2.4 }, { at: 3.4, midi: 76, len: 1.25 }, { at: 5.2, midi: 79, len: 2.3 },
      { at: 8.4, midi: 76, len: 1.4 }, { at: 10.35, midi: 74, len: 1.8 }, { at: 13.2, midi: 72, len: 1.6 },
      { at: 15.4, midi: 71, len: 1.5 }, { at: 17.45, midi: 72, len: 1.2 }, { at: 19.1, midi: 76, len: 1.5 },
      { at: 21.3, midi: 79, len: 1.2 }, { at: 22.9, midi: 76, len: 1.0 }
    ], { type: "sine", volume: 0.1, filterFrequency: 3200 });
  }),
  synthParade: pattern(32, 164, (bpm) => {
    playFourOnFloor(bpm, 8, true);
    [[0, [62, 66, 69, 74]], [4, [57, 61, 64, 69]], [8, [59, 62, 66, 71]], [12, [55, 59, 62, 67]], [16, [62, 66, 69, 78]], [20, [57, 61, 64, 73]], [24, [59, 62, 66, 74]], [28, [61, 64, 68, 73]]]
      .forEach(([at, notes]) => playBeatChord(bpm, at, notes, 3.8, { type: "sawtooth", volume: 0.038, filterFrequency: 3600 }));
    for (let at = 0; at < 32; at += 0.25) {
      const arp = [86, 90, 93, 98, 93, 90, 86, 81];
      playBeatNote(bpm, { at, midi: arp[Math.floor(at * 4) % arp.length], len: 0.11, type: "sawtooth", volume: 0.036, filterFrequency: 6200 });
    }
    playBeatNotes(bpm, [
      { at: 0, midi: 38, len: 0.5 }, { at: 0.5, midi: 38, len: 0.25 }, { at: 1, midi: 50, len: 0.35 }, { at: 1.75, midi: 45, len: 0.25 },
      { at: 4, midi: 33, len: 0.5 }, { at: 4.5, midi: 33, len: 0.25 }, { at: 5, midi: 45, len: 0.35 }, { at: 5.75, midi: 40, len: 0.25 },
      { at: 8, midi: 35, len: 0.5 }, { at: 8.5, midi: 35, len: 0.25 }, { at: 9, midi: 47, len: 0.35 }, { at: 9.75, midi: 42, len: 0.25 },
      { at: 12, midi: 31, len: 0.5 }, { at: 12.5, midi: 31, len: 0.25 }, { at: 13, midi: 43, len: 0.35 }, { at: 13.75, midi: 38, len: 0.25 }
    ].flatMap((note) => [note, { ...note, at: note.at + 16 }]), { type: "sawtooth", volume: 0.095, filterFrequency: 1200 });
    playBeatNotes(bpm, [
      { at: 0, midi: 86, len: 0.6 }, { at: 0.75, midi: 90, len: 0.45 }, { at: 1.35, midi: 93, len: 0.8 }, { at: 2.35, midi: 98, len: 0.6 },
      { at: 3.2, midi: 95, len: 0.45 }, { at: 4, midi: 93, len: 0.6 }, { at: 4.75, midi: 90, len: 0.45 }, { at: 5.35, midi: 86, len: 0.8 },
      { at: 6.5, midi: 81, len: 0.65 }, { at: 8, midi: 83, len: 0.6 }, { at: 8.75, midi: 86, len: 0.45 }, { at: 9.35, midi: 90, len: 0.9 },
      { at: 10.55, midi: 93, len: 0.55 }, { at: 11.35, midi: 95, len: 0.65 }, { at: 12.2, midi: 93, len: 0.45 }, { at: 13, midi: 90, len: 0.55 },
      { at: 13.8, midi: 86, len: 1.0 }, { at: 16, midi: 98, len: 1.2 }, { at: 17.45, midi: 95, len: 0.6 }, { at: 18.25, midi: 93, len: 0.85 },
      { at: 19.4, midi: 90, len: 0.55 }, { at: 20.2, midi: 86, len: 0.75 }, { at: 21.2, midi: 90, len: 0.55 }, { at: 22, midi: 93, len: 0.85 },
      { at: 23.15, midi: 95, len: 0.55 }, { at: 24, midi: 98, len: 0.7 }, { at: 24.9, midi: 100, len: 0.6 }, { at: 25.75, midi: 98, len: 0.8 },
      { at: 27, midi: 95, len: 0.6 }, { at: 27.8, midi: 93, len: 0.7 }, { at: 28.85, midi: 90, len: 0.8 }, { at: 30, midi: 86, len: 1.2 }
    ], { type: "sawtooth", volume: 0.145, filterFrequency: 5200 });
  }),
  brassSmile: pattern(32, 138, (bpm) => {
    playRockBackbeat(bpm, 8);
    [[0, [48, 55, 60]], [4, [50, 57, 62]], [8, [52, 59, 64]], [12, [55, 62, 67]], [16, [48, 55, 60]], [20, [50, 57, 62]], [24, [52, 59, 64]], [28, [47, 54, 59]]]
      .forEach(([at, notes]) => {
        playBeatChord(bpm, at, notes, 0.7, { type: "sawtooth", volume: 0.065, filterFrequency: 1900 });
        playBeatChord(bpm, at + 2, notes, 0.55, { type: "sawtooth", volume: 0.05, filterFrequency: 1900 });
      });
    playBeatNotes(bpm, [
      { at: 0, midi: 36, len: 0.55 }, { at: 0.75, midi: 43, len: 0.28 }, { at: 2.5, midi: 48, len: 0.4 }, { at: 3.25, midi: 43, len: 0.3 },
      { at: 4, midi: 38, len: 0.55 }, { at: 4.75, midi: 45, len: 0.28 }, { at: 6.5, midi: 50, len: 0.4 }, { at: 7.25, midi: 45, len: 0.3 },
      { at: 8, midi: 40, len: 0.55 }, { at: 8.75, midi: 47, len: 0.28 }, { at: 10.5, midi: 52, len: 0.4 }, { at: 11.25, midi: 47, len: 0.3 },
      { at: 12, midi: 43, len: 0.55 }, { at: 12.75, midi: 50, len: 0.28 }, { at: 14.5, midi: 55, len: 0.4 }, { at: 15.25, midi: 50, len: 0.3 }
    ].flatMap((riff) => [riff, { ...riff, at: riff.at + 16 }]), { type: "square", volume: 0.085, filterFrequency: 1000 });
    playBeatNotes(bpm, [
      { at: 0.1, midi: 72, len: 0.45 }, { at: 0.75, midi: 76, len: 0.4 }, { at: 1.35, midi: 79, len: 0.75 }, { at: 2.4, midi: 84, len: 0.55 },
      { at: 3.2, midi: 83, len: 0.45 }, { at: 4.05, midi: 81, len: 0.45 }, { at: 4.7, midi: 79, len: 0.45 }, { at: 5.35, midi: 76, len: 0.75 },
      { at: 6.45, midi: 72, len: 0.55 }, { at: 8, midi: 79, len: 0.6 }, { at: 8.8, midi: 83, len: 0.45 }, { at: 9.5, midi: 86, len: 0.85 },
      { at: 10.8, midi: 88, len: 0.6 }, { at: 11.7, midi: 86, len: 0.45 }, { at: 12.4, midi: 84, len: 0.45 }, { at: 13.05, midi: 83, len: 0.6 },
      { at: 14, midi: 79, len: 0.85 }, { at: 16.15, midi: 84, len: 0.7 }, { at: 17.1, midi: 86, len: 0.55 }, { at: 17.9, midi: 88, len: 0.95 },
      { at: 19.3, midi: 91, len: 0.65 }, { at: 20.25, midi: 88, len: 0.5 }, { at: 21, midi: 86, len: 0.6 }, { at: 21.9, midi: 84, len: 0.75 },
      { at: 23, midi: 83, len: 0.65 }, { at: 24.1, midi: 81, len: 0.55 }, { at: 24.85, midi: 84, len: 0.55 }, { at: 25.65, midi: 86, len: 0.75 },
      { at: 26.8, midi: 88, len: 0.65 }, { at: 27.75, midi: 86, len: 0.6 }, { at: 28.65, midi: 84, len: 0.7 }, { at: 29.7, midi: 79, len: 1.2 }
    ], { type: "sawtooth", volume: 0.135, filterFrequency: 2800 });
  })
};

function chooseJapaneseVoice() {
  if (!("speechSynthesis" in window)) return null;
  const voices = window.speechSynthesis.getVoices();
  return (
    voices.find((voice) => voice.lang === "ja-JP" && /Kyoko|Otoya|Japanese|Japan|日本|Siri/i.test(voice.name)) ||
    voices.find((voice) => voice.lang === "ja-JP") ||
    voices.find((voice) => voice.lang?.startsWith("ja")) ||
    null
  );
}

function speakCatMessage() {
  if (!("speechSynthesis" in window) || !("SpeechSynthesisUtterance" in window)) {
    return false;
  }

  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(catAlarmMessage);
  utterance.lang = "ja-JP";
  utterance.pitch = 1.65;
  utterance.rate = 1.02;
  utterance.volume = alarmVolume;

  const voice = chooseJapaneseVoice();
  if (voice) utterance.voice = voice;

  window.speechSynthesis.speak(utterance);
  return true;
}

function playCatChirp(startOffset = 0) {
  makeOscillatorTone({
    startOffset,
    frequency: 620,
    endFrequency: 880,
    duration: 0.18,
    type: "sine",
    volume: 0.11,
    filterFrequency: 4200
  });
  makeOscillatorTone({
    startOffset: startOffset + 0.16,
    frequency: 880,
    endFrequency: 520,
    duration: 0.28,
    type: "triangle",
    volume: 0.09,
    filterFrequency: 3600
  });
  makeOscillatorTone({
    startOffset: startOffset + 0.06,
    frequency: 1240,
    endFrequency: 980,
    duration: 0.18,
    type: "sine",
    volume: 0.035,
    filterFrequency: 5200
  });
}

function playCatNotice() {
  playCatChirp(0);
  const didSpeak = speakCatMessage();
  playCatChirp(6.8);

  if (!didSpeak) {
    playBeatNotes(120, [
      { at: 0, midi: 76, len: 0.5 },
      { at: 0.7, midi: 79, len: 0.45 },
      { at: 1.35, midi: 83, len: 0.8 },
      { at: 2.6, midi: 81, len: 0.55 },
      { at: 3.35, midi: 79, len: 0.5 },
      { at: 4.05, midi: 76, len: 1.0 }
    ], { type: "sine", volume: 0.12, filterFrequency: 3800 });
  }
}

function stopRegisteredAudio() {
  if (!registeredAudioPlayer) return;
  registeredAudioPlayer.pause();
  registeredAudioPlayer.currentTime = 0;
  registeredAudioPlayer.src = "";
  registeredAudioPlayer = null;
}

function playRegisteredAudio({ loop = true } = {}) {
  if (!registeredAudio?.url) return false;

  registeredAudioPlayer = new Audio(registeredAudio.url);
  registeredAudioPlayer.loop = loop;
  registeredAudioPlayer.volume = alarmVolume;
  registeredAudioPlayer.addEventListener("ended", () => {
    registeredAudioPlayer = null;
    render();
  });

  registeredAudioPlayer.play().catch(() => {
    stopRegisteredAudio();
    statusText.textContent = "音楽を再生できません";
    playCatNotice();
  });

  return true;
}

function stopAlarm() {
  melodyLooping = false;
  window.clearTimeout(melodyTimerId);
  melodyTimerId = 0;
  stopRegisteredAudio();
  if ("speechSynthesis" in window) {
    window.speechSynthesis.cancel();
  }
  activeAudioNodes.forEach((node) => {
    try {
      node.stop();
    } catch {
      // Already stopped.
    }
  });
  activeAudioNodes = [];
  render();
}

function scheduleMelodyLoop() {
  if (!melodyLooping) return;
  if (registeredAudio?.url) return;
  const pattern = distinctSongPatterns[alarmId] || distinctSongPatterns.catVoice;
  pattern.play();
  melodyTimerId = window.setTimeout(scheduleMelodyLoop, pattern.length * 1000);
}

function playAlarm({ loop = true } = {}) {
  stopAlarm();
  melodyLooping = loop;
  if (playRegisteredAudio({ loop })) {
    render();
    return;
  }
  const pattern = distinctSongPatterns[alarmId] || distinctSongPatterns.catVoice;
  pattern.play();
  if (loop) {
    melodyTimerId = window.setTimeout(scheduleMelodyLoop, pattern.length * 1000);
  }
  render();
}

function finishTimer() {
  running = false;
  endAt = 0;
  stopTimerTicker();
  remainingSeconds = 0;
  playAlarm();
  if ("Notification" in window && Notification.permission === "granted") {
    new Notification("ポモドーロ終了", {
      body: taskInput.value ? `${taskInput.value}\n${catAlarmMessage}` : catAlarmMessage
    });
  }
  saveState();
  render();
}

function startPause() {
  stopAlarm();
  if (running) {
    updateRemainingFromClock();
    running = false;
    endAt = 0;
    stopTimerTicker();
    saveState();
    render();
    return;
  }

  if (remainingSeconds <= 0) {
    remainingSeconds = totalSeconds;
  }

  ensureAudioContext();
  running = true;
  endAt = Date.now() + remainingSeconds * 1000;
  startTimerTicker();
  saveState();
  render();
}

setButton.addEventListener("click", setFromInputs);
startPauseButton.addEventListener("click", startPause);
resetButton.addEventListener("click", () => {
  stopAlarm();
  running = false;
  endAt = 0;
  stopTimerTicker();
  remainingSeconds = totalSeconds;
  saveState();
  render();
});
alarmButton.addEventListener("click", playAlarm);
stopAlarmButton.addEventListener("click", stopAlarm);

selectAudioButton.addEventListener("click", async () => {
  if (!desktopApi) {
    browserAudioInput.click();
    return;
  }

  const audioFile = await desktopApi.selectAudioFile();
  if (!audioFile) return;

  registeredAudio = audioFile;
  alarmId = "registeredAudio";
  saveState();
  playAlarm({ loop: false });
});

browserAudioInput.addEventListener("change", () => {
  const file = browserAudioInput.files?.[0];
  if (!file) return;

  if (registeredAudio?.sessionOnly) {
    URL.revokeObjectURL(registeredAudio.url);
  }

  registeredAudio = {
    name: file.name,
    path: "ブラウザで選択した音源",
    url: URL.createObjectURL(file),
    sessionOnly: true
  };
  alarmId = "registeredAudio";
  saveState();
  playAlarm({ loop: false });
});

clearAudioButton.addEventListener("click", () => {
  stopAlarm();
  if (registeredAudio?.sessionOnly) {
    URL.revokeObjectURL(registeredAudio.url);
  }
  registeredAudio = desktopApi ? null : bundledAudio;
  alarmId = "catVoice";
  saveState();
  render();
});

volumeInput.addEventListener("input", () => {
  alarmVolume = clamp(volumeInput.value, 0, 100) / 100;
  if (registeredAudioPlayer) {
    registeredAudioPlayer.volume = alarmVolume;
  }
  saveState();
  render();
});

memoInput.addEventListener("input", saveState);
timerTitle.addEventListener("input", saveState);
taskInput.addEventListener("input", saveState);
timerTabButton.addEventListener("click", () => setActiveTab("timer"));
memoTabButton.addEventListener("click", () => setActiveTab("memo"));

pinButton.addEventListener("click", async () => {
  if (!desktopApi) {
    statusText.textContent = "ブラウザ表示";
    return;
  }
  const isTop = await desktopApi.toggleTop();
  statusText.textContent = isTop ? "最前面表示中" : "通常表示";
});
minimizeButton.addEventListener("click", () => {
  if (desktopApi) desktopApi.minimize();
});
closeButton.addEventListener("click", () => {
  if (desktopApi) {
    desktopApi.close();
    return;
  }
  window.close();
});

window.addEventListener("keydown", (event) => {
  if (event.code === "Space" && event.target === document.body) {
    event.preventDefault();
    startPause();
  }
});

if ("Notification" in window && Notification.permission === "default") {
  Notification.requestPermission();
}

loadState();
if (running) {
  startTimerTicker();
}
render();
