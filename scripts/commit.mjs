import { execFileSync } from "node:child_process";
import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";
import { COMMIT_TYPES, validateCommitMessage } from "./conventional-commits.mjs";

function capture(command, args) {
  return execFileSync(command, args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
}

if (!capture("git", ["diff", "--cached", "--name-only"])) {
  throw new Error("No staged changes. Run `git add <files>` before `pnpm commit`.");
}
if (!stdin.isTTY) throw new Error("`pnpm commit` requires an interactive terminal.");

const prompt = createInterface({ input: stdin, output: stdout });
try {
  console.log("Select commit type:");
  COMMIT_TYPES.forEach(([type, label], index) => console.log(`  ${index + 1}. ${type.padEnd(8)} ${label}`));
  const choice = Number((await prompt.question("Type number: ")).trim());
  const selected = COMMIT_TYPES[choice - 1];
  if (!selected) throw new Error("Invalid commit type selection.");
  const scope = (await prompt.question("Scope (optional, e.g. updater): ")).trim();
  if (scope && !/^[a-z0-9._/-]+$/.test(scope)) throw new Error("Scope may contain lowercase letters, numbers, dot, underscore, slash, or hyphen only.");
  const description = (await prompt.question("Short description: ")).trim();
  const subject = `${selected[0]}${scope ? `(${scope})` : ""}: ${description}`;
  const result = validateCommitMessage(subject);
  if (!result.valid) throw new Error(result.error);
  console.log(`\nCommit: ${subject}`);
  const confirm = (await prompt.question("Create commit? [Y/n]: ")).trim().toLowerCase();
  if (confirm && confirm !== "y" && confirm !== "yes") throw new Error("Commit cancelled.");
  execFileSync("git", ["commit", "-m", subject], { stdio: "inherit" });
} finally {
  prompt.close();
}
