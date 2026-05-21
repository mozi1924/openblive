import { existsSync } from "node:fs";
import { spawnSync } from "node:child_process";

if (!existsSync("overlay-compat/node_modules")) {
  const hasPackageLock = existsSync("overlay-compat/package-lock.json");
  const npmCommand = hasPackageLock ? "ci" : "install";
  const result = spawnSync(
    "npm",
    ["--prefix", "overlay-compat", npmCommand, "--loglevel=error", "--no-audit", "--fund=false"],
    {
      stdio: "inherit",
      shell: process.platform === "win32",
    },
  );

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}
