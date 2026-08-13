import {
  bumpPatch,
  inherit,
  latestPublishedRelease,
  promptExact,
} from "./release-utils.mjs";

inherit("gh", ["auth", "status"]);
const release = latestPublishedRelease();
if (!release) throw new Error("No published GitHub Release is available to withdraw.");

console.log(`Latest published release: ${release.tag}`);
console.log(`Release URL: ${release.url}`);
console.log(`Assets to remove: ${release.assets.map((asset) => asset.name).join(", ") || "none"}`);
console.log("The Git tag will be retained so this version number cannot be reused.");

const expected = `WITHDRAW ${release.tag}`;
if (!await promptExact("This deletes the latest Release and its downloadable assets.", expected)) {
  throw new Error("Withdrawal cancelled; confirmation text did not match.");
}

inherit("gh", ["release", "delete", release.tag, "--yes"]);
console.log(`${release.tag} was withdrawn. Publish the replacement with a higher version; suggested next version: ${bumpPatch(release.version)}.`);
