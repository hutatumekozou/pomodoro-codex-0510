const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const outDir = path.join(root, "dist");
const files = ["index.html", "styles.css", "renderer.js"];
const audioDir = "アラーム音(SUNO作成)";

fs.rmSync(outDir, { recursive: true, force: true });
fs.mkdirSync(outDir, { recursive: true });

for (const file of files) {
  fs.copyFileSync(path.join(root, file), path.join(outDir, file));
}

const sourceAudioDir = path.join(root, audioDir);
if (fs.existsSync(sourceAudioDir)) {
  fs.cpSync(sourceAudioDir, path.join(outDir, audioDir), { recursive: true });
}
