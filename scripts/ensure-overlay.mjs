import { existsSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

const run = (command, args) => {
  const result = spawnSync(command, args, {
    stdio: "inherit",
    shell: process.platform === "win32",
  });

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
};

const getMaxMtime = (targetPath) => {
  if (!existsSync(targetPath)) return 0;
  const stat = statSync(targetPath);
  if (!stat.isDirectory()) return stat.mtimeMs;

  let maxMtime = stat.mtimeMs;
  for (const entry of readdirSync(targetPath)) {
    const fullPath = join(targetPath, entry);
    maxMtime = Math.max(maxMtime, getMaxMtime(fullPath));
  }
  return maxMtime;
};

const targetDist = "dist/overlay/index.html";
const sourcePaths = ["src/overlay", "src/overlay-compat", "overlay", "vite.config.overlay.ts"];

const distMtime = existsSync(targetDist) ? statSync(targetDist).mtimeMs : 0;
const latestSourceMtime = Math.max(...sourcePaths.map(getMaxMtime));

if (!distMtime || latestSourceMtime > distMtime) {
  run("pnpm", ["build:overlay"]);
}
