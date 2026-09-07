import { mkdir } from "node:fs/promises";
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const appDir = path.resolve(scriptDir, "..");
const cargoHome = path.join(appDir, ".cargo-local");
const tauriCli = path.join(appDir, "node_modules", "@tauri-apps", "cli", "tauri.js");
const args = process.argv.slice(2);

await mkdir(cargoHome, { recursive: true });

const child = spawn(process.execPath, [tauriCli, ...args], {
  cwd: appDir,
  env: { ...process.env, CARGO_HOME: cargoHome },
  stdio: "inherit"
});

child.on("error", error => {
  console.error(error);
  process.exitCode = 1;
});

child.on("exit", (code, signal) => {
  if (signal) {
    console.error(`Tauri stopped by signal ${signal}`);
    process.exitCode = 1;
    return;
  }
  process.exitCode = code ?? 1;
});
