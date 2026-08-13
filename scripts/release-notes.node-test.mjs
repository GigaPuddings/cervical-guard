import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { categorizeCommits, previousStableTag, renderReleaseNotes } from "./generate-release-notes.mjs";
import { validateCommitMessage } from "./conventional-commits.mjs";

describe("conventional commits and release notes", () => {
  it("validates new commits while allowing Git-generated messages", () => {
    assert.equal(validateCommitMessage("feat(updater): generate release notes").valid, true);
    assert.equal(validateCommitMessage("fix: missing space").valid, true);
    assert.equal(validateCommitMessage("fix:Missing space").valid, false);
    assert.equal(validateCommitMessage("Merge branch 'master'").valid, true);
  });

  it("finds the previous stable tag numerically", () => {
    assert.equal(previousStableTag("v1.10.0", ["v1.2.0", "v1.9.9", "v1.10.0", "preview"]), "v1.9.9");
    assert.equal(previousStableTag("v0.1.0", []), null);
  });

  it("categorizes known types and tolerates legacy subjects", () => {
    const groups = categorizeCommits([
      { hash: "1111111", subject: "feat(ui): add language switch" },
      { hash: "2222222", subject: "fix: stop polling" },
      { hash: "3333333", subject: "perf(camera): lower CPU use" },
      { hash: "4444444", subject: "legacy commit" },
      { hash: "5555555", subject: "chore: release v0.2.0" },
    ]);
    assert.equal(groups.feat.length, 1);
    assert.equal(groups.fix.length, 1);
    assert.equal(groups.perf.length, 1);
    assert.equal(groups.other.length, 1);
  });

  it("renders bilingual Markdown used by GitHub and updater notes", () => {
    const notes = renderReleaseNotes({
      tag: "v0.2.0",
      previousTag: "v0.1.0",
      commits: [{ hash: "abcdef123", subject: "feat(updater): add automatic notes" }],
    });
    assert.match(notes, /Features \/ 新功能/);
    assert.match(notes, /\*\*updater:\*\* add automatic notes/);
    assert.match(notes, /Changes since v0\.1\.0/);
  });
});
