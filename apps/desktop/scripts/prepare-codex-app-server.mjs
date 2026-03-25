#!/usr/bin/env node
/**
 * Builds codex-app-server once and stages it for Tauri `bundle.externalBin` as
 * `src-tauri/binaries/codex-app-server-<target-triple>[.exe]`.
 *
 * Skips the cargo build when that file already exists (set FORCE=1 or --force to rebuild).
 *
 * Target selection:
 * - `TARGET` env (CI: match `tauri build --target ...`)
 * - otherwise host triple from `rustc --print host-tuple`
 */
import { spawnSync } from "node:child_process";
import { chmodSync, copyFileSync, existsSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const desktopDir = path.resolve(__dirname, "..");
const repoRoot = path.resolve(desktopDir, "../..");
const binariesDir = path.join(desktopDir, "src-tauri/binaries");
const manifestPath = path.join(repoRoot, "codex-rs/Cargo.toml");

const force =
  process.env.FORCE === "1" ||
  process.argv.includes("--force");

function run(cmd, args, opts = {}) {
  const r = spawnSync(cmd, args, { encoding: "utf8", stdio: "inherit", ...opts });
  if (r.status !== 0) process.exit(r.status ?? 1);
}

function hostTriple() {
  const r = spawnSync("rustc", ["--print", "host-tuple"], {
    encoding: "utf8",
  });
  if (r.status !== 0) {
    console.error(r.stderr || r.stdout);
    process.exit(1);
  }
  return r.stdout.trim();
}

const targetTriple = (process.env.TARGET || "").trim() || hostTriple();
const ext = process.platform === "win32" ? ".exe" : "";
const host = hostTriple();

const dest = path.join(binariesDir, `codex-app-server-${targetTriple}${ext}`);

mkdirSync(binariesDir, { recursive: true });

if (existsSync(dest) && !force) {
  console.log(
    `Skip codex-app-server build: ${dest} already exists (FORCE=1 or --force to rebuild).`,
  );
} else {
  const cargoArgs = [
    "build",
    "--release",
    "-p",
    "codex-app-server",
    "--manifest-path",
    manifestPath,
  ];
  if (targetTriple !== host) {
    cargoArgs.push("--target", targetTriple);
  }

  const outDir =
    targetTriple === host
      ? path.join(repoRoot, "codex-rs/target/release")
      : path.join(repoRoot, "codex-rs/target", targetTriple, "release");

  const built = path.join(outDir, `codex-app-server${ext}`);

  run("cargo", cargoArgs, { cwd: repoRoot });

  if (!existsSync(built)) {
    console.error(`Expected binary missing after build: ${built}`);
    process.exit(1);
  }

  copyFileSync(built, dest);
  if (process.platform !== "win32") {
    chmodSync(dest, 0o755);
  }

  console.log(`Prepared codex-app-server (${targetTriple}) -> ${dest}`);
}

// Tauri sidecar resolution: next to the running executable (`target/debug` or `MacOS/` in a bundle).
const debugOut = path.join(desktopDir, "src-tauri/target/debug", `codex-app-server${ext}`);
if (!existsSync(debugOut) || force) {
  mkdirSync(path.dirname(debugOut), { recursive: true });
  copyFileSync(dest, debugOut);
  if (process.platform !== "win32") {
    chmodSync(debugOut, 0o755);
  }
  console.log(`Copied for local dev sidecar path: ${debugOut}`);
}
