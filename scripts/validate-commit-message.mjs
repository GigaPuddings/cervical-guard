import { readFileSync } from "node:fs";
import { validateCommitMessage } from "./conventional-commits.mjs";

const messagePath = process.argv[2];
if (!messagePath) throw new Error("Commit message file path is required.");
const result = validateCommitMessage(readFileSync(messagePath, "utf8"));
if (!result.valid) {
  console.error(`Invalid commit message: ${result.subject || "<empty>"}`);
  console.error(result.error);
  console.error("Example: feat(updater): generate categorized release notes");
  process.exit(1);
}
