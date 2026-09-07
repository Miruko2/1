import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const appDir = path.resolve(scriptDir, "..");
const projectDir = path.resolve(appDir, "..");
const distDir = path.join(appDir, "dist");
const sourceHtmlPath = path.join(projectDir, "admin.html");
const bridgeSourcePath = path.join(appDir, "src", "desktop-bridge.js");

const bridgeTag = "  <script src=\"desktop-bridge.js\"></script>\n";
let html = await readFile(sourceHtmlPath, "utf8");
if (!html.includes("desktop-bridge.js")) {
  html = html.replace("</head>", bridgeTag + "</head>");
}

await mkdir(distDir, { recursive: true });
await writeFile(path.join(distDir, "index.html"), html, "utf8");
await copyFile(bridgeSourcePath, path.join(distDir, "desktop-bridge.js"));
await copyFile(path.join(projectDir, "article-music.js"), path.join(distDir, "article-music.js"));

console.log("Desktop UI prepared from ../admin.html");
