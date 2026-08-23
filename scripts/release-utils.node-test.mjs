import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  bumpPatch,
  canResumeVersionPreparation,
  capturePnpm,
  compareVersions,
  highestVersion,
  isVersionOnlyChangeSet,
  parseVersion,
  selectSuggestedReleaseVersion,
} from "./release-utils.mjs";

describe("release version helpers", () => {
  it("compares stable semantic versions numerically", () => {
    assert.equal(compareVersions("0.10.0", "0.9.9") > 0, true);
    assert.equal(compareVersions("1.0.0", "1.0.0"), 0);
    assert.equal(compareVersions("1.0.0", "1.0.1") < 0, true);
  });

  it("finds the highest previously used version", () => {
    assert.equal(highestVersion(["1.2.0", "1.10.0", "0.9.9"]), "1.10.0");
    assert.equal(highestVersion([]), null);
  });

  it("suggests the next patch without reusing a withdrawn version", () => {
    assert.equal(bumpPatch("2.4.9"), "2.4.10");
  });

  it("rejects prerelease and incomplete versions", () => {
    assert.throws(() => parseVersion("1.0"));
    assert.throws(() => parseVersion("1.0.0-beta.1"));
  });

  it("can launch pnpm as a child process on this platform", () => {
    assert.match(capturePnpm(["--version"]), /^\d+\.\d+\.\d+/);
  });

  it("recognizes an interrupted version-only preparation", () => {
    const versionFiles = ["package.json", "src-tauri/Cargo.toml", "src-tauri/Cargo.lock", "src-tauri/tauri.conf.json"];
    assert.equal(isVersionOnlyChangeSet(["package.json", "src-tauri/Cargo.toml"], versionFiles), true);
    assert.equal(isVersionOnlyChangeSet(["package.json", "src/App.tsx"], versionFiles), false);
    assert.equal(isVersionOnlyChangeSet([], versionFiles), false);
    assert.equal(canResumeVersionPreparation({
      selectedVersion: "0.1.18",
      projectVersion: "0.1.18",
      highestUsedVersion: "0.1.17",
      taggedVersions: ["0.1.17"],
      changedPaths: versionFiles,
      versionFiles,
    }), true);
    assert.equal(canResumeVersionPreparation({
      selectedVersion: "0.1.18",
      projectVersion: "0.1.18",
      highestUsedVersion: "0.1.17",
      taggedVersions: ["0.1.17"],
      changedPaths: [...versionFiles, "src/App.tsx"],
      versionFiles,
    }), false);
  });

  it("resumes an unpublished project tag instead of suggesting the next patch", () => {
    assert.equal(selectSuggestedReleaseVersion({
      projectVersion: "0.1.18",
      usedVersions: ["0.1.17", "0.1.18"],
      taggedVersions: ["0.1.18"],
      publishedVersion: "0.1.17",
    }), "0.1.18");
    assert.equal(selectSuggestedReleaseVersion({
      projectVersion: "0.1.18",
      usedVersions: ["0.1.17", "0.1.18"],
      taggedVersions: ["0.1.18"],
      publishedVersion: "0.1.18",
    }), "0.1.19");
  });
});
