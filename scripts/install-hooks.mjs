import { execFileSync } from "node:child_process";

try {
  execFileSync("git", ["rev-parse", "--git-dir"], { stdio: "ignore" });
  execFileSync("git", ["config", "--local", "core.hooksPath", ".githooks"], { stdio: "ignore" });
  console.log("Git commit-message hook installed (.githooks). Use `pnpm commit` for guided commits.");
} catch {
  console.log("Git hooks were not installed because this directory is not a Git worktree.");
}
