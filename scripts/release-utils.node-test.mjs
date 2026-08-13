import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { bumpPatch, capturePnpm, compareVersions, highestVersion, parseVersion } from "./release-utils.mjs";

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
});
