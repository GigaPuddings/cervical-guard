import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  selectUpdaterAsset,
  stabilizeUpdaterManifest,
  stableReleaseAssetUrl,
} from "./stabilize-updater-manifest.mjs";

describe("updater manifest URLs", () => {
  const assets = [
    { name: "Cervical.Guard_0.1.5_x64-setup.exe" },
    { name: "Cervical.Guard_0.1.5_x64-setup.exe.sig" },
    { name: "latest.json" },
  ];

  it("selects the signed NSIS installer rather than its signature", () => {
    assert.equal(selectUpdaterAsset("windows-x86_64-nsis", assets), "Cervical.Guard_0.1.5_x64-setup.exe");
  });

  it("builds a stable GitHub release asset URL", () => {
    assert.equal(
      stableReleaseAssetUrl("GigaPuddings/cervical-guard", "v0.1.5", "Cervical.Guard_0.1.5_x64-setup.exe"),
      "https://github.com/GigaPuddings/cervical-guard/releases/download/v0.1.5/Cervical.Guard_0.1.5_x64-setup.exe",
    );
  });

  it("replaces API asset URLs without changing signatures or release metadata", () => {
    const source = {
      version: "0.1.5",
      notes: "Fix updater",
      platforms: {
        "windows-x86_64": { signature: "signed", url: "https://api.github.com/repos/GigaPuddings/cervical-guard/releases/assets/123" },
        "windows-x86_64-nsis": { signature: "signed", url: "https://api.github.com/repos/GigaPuddings/cervical-guard/releases/assets/123" },
      },
    };
    const result = stabilizeUpdaterManifest(source, {
      repository: "GigaPuddings/cervical-guard",
      tag: "v0.1.5",
      assets,
    });
    assert.equal(result.replacements, 2);
    assert.equal(result.manifest.notes, source.notes);
    assert.equal(result.manifest.platforms["windows-x86_64"].signature, "signed");
    assert.match(result.manifest.platforms["windows-x86_64"].url, /github\.com\/GigaPuddings\/cervical-guard\/releases\/download\/v0\.1\.5\//);
  });

  it("leaves an already stable manifest unchanged", () => {
    const stableUrl = stableReleaseAssetUrl("GigaPuddings/cervical-guard", "v0.1.5", assets[0].name);
    const result = stabilizeUpdaterManifest({
      version: "0.1.5",
      platforms: { "windows-x86_64-nsis": { signature: "signed", url: stableUrl } },
    }, { repository: "GigaPuddings/cervical-guard", tag: "v0.1.5", assets });
    assert.equal(result.replacements, 0);
    assert.equal(result.manifest.platforms["windows-x86_64-nsis"].url, stableUrl);
  });
});
