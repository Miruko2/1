import { copyFile, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const appDir = path.resolve(scriptDir, "..");
const projectDir = path.resolve(appDir, "..");
const source = path.join(appDir, "src-tauri", "target", "release", "hanako-editor.exe");
const destinations = [
  path.join(projectDir, "HanakoEditor.exe"),
  path.join(projectDir, "HanakoEditor-Sakura.exe")
];

await stat(source);
await Promise.all(destinations.map(destination => copyFile(source, destination)));
console.log(`Portable apps copied to:\n${destinations.join("\n")}`);
