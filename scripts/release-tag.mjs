import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import {
  bumpPatch,
  capture,
  compareVersions,
  highestVersion,
  inherit,
  inheritPnpm,
  latestPublishedRelease,
  localTagVersions,
  promptValue,
  remoteTagVersions,
} from "./release-utils.mjs";

// pnpm 11 on Windows forwards its `--` separator to the script itself.
const args = process.argv.slice(2).filter((value) => value !== "--");
const dryRun = args.includes("--dry-run");
const requestedVersion = args.find((value) => value !== "--dry-run");
const versionFiles = ["package.json", "src-tauri/Cargo.toml", "src-tauri/Cargo.lock", "src-tauri/tauri.conf.json"];

function configuredVersions() {
  const packageVersion = JSON.parse(readFileSync("package.json", "utf8")).version;
  const tauriVersion = JSON.parse(readFileSync("src-tauri/tauri.conf.json", "utf8")).version;
  const cargoText = readFileSync("src-tauri/Cargo.toml", "utf8");
  const cargoVersion = cargoText.match(/^version\s*=\s*"([^"]+)"/m)?.[1];
  if (packageVersion !== tauriVersion || packageVersion !== cargoVersion) {
    throw new Error(`Version mismatch before release: package=${packageVersion}, tauri=${tauriVersion}, cargo=${cargoVersion ?? "missing"}`);
  }
  return packageVersion;
}

function writeVersion(version) {
  const packageJson = readFileSync("package.json", "utf8");
  const nextPackageJson = packageJson.replace(/("version"\s*:\s*")[^"]+("\s*,)/, `$1${version}$2`);
  if (nextPackageJson === packageJson) throw new Error("Could not update package.json version.");
  writeFileSync("package.json", nextPackageJson);

  const tauriConfig = readFileSync("src-tauri/tauri.conf.json", "utf8");
  const nextTauriConfig = tauriConfig.replace(/("version"\s*:\s*")[^"]+("\s*,)/, `$1${version}$2`);
  if (nextTauriConfig === tauriConfig) throw new Error("Could not update src-tauri/tauri.conf.json version.");
  writeFileSync("src-tauri/tauri.conf.json", nextTauriConfig);

  const cargo = readFileSync("src-tauri/Cargo.toml", "utf8");
  const nextCargo = cargo.replace(/(\[package\][\s\S]*?^version\s*=\s*")[^"]+("\s*$)/m, `$1${version}$2`);
  if (nextCargo === cargo && !cargo.includes(`version = "${version}"`)) throw new Error("Could not update src-tauri/Cargo.toml version.");
  writeFileSync("src-tauri/Cargo.toml", nextCargo);
}

function waitForReleaseRun(tag, commit) {
  process.stdout.write("Waiting for GitHub Actions to start");
  let run = null;
  for (let attempt = 0; attempt < 30; attempt += 1) {
    const runs = JSON.parse(capture("gh", ["run", "list", "--workflow", "release.yml", "--event", "push", "--limit", "10", "--json", "databaseId,headBranch,headSha,status,conclusion,url"]));
    run = runs.find((item) => item.headBranch === tag && item.headSha === commit) ?? null;
    if (run) break;
    process.stdout.write(".");
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 3_000);
  }
  process.stdout.write("\n");
  if (!run) throw new Error(`Tag ${tag} was pushed, but its GitHub Actions run was not found. Check the Actions page.`);
  inherit("gh", ["run", "watch", String(run.databaseId), "--interval", "10", "--exit-status"]);

  const release = JSON.parse(capture("gh", ["release", "view", tag, "--json", "url,isDraft,assets"]));
  const assetNames = release.assets.map((asset) => asset.name);
  const required = ["latest.json", ".exe", ".exe.sig"];
  if (release.isDraft || required.some((suffix) => !assetNames.some((name) => suffix.startsWith(".") ? name.endsWith(suffix) : name === suffix))) {
    throw new Error(`Release ${tag} completed but required published assets are missing.`);
  }
  console.log(`Release ready: ${release.url}`);
}

const projectVersion = configuredVersions();
inherit("gh", ["auth", "status"]);
const latestRelease = latestPublishedRelease();
const localVersions = localTagVersions();
const remoteVersions = remoteTagVersions();
const highestUsed = highestVersion([...localVersions, ...remoteVersions, latestRelease?.version]);
const suggestedVersion = highestUsed
  ? (compareVersions(projectVersion, highestUsed) > 0 ? projectVersion : bumpPatch(highestUsed))
  : projectVersion;

console.log(`Latest published version: ${latestRelease?.version ?? "none"}`);
console.log(`Highest local tag version: ${highestVersion(localVersions) ?? "none"}`);
console.log(`Highest remote tag version: ${highestVersion(remoteVersions) ?? "none"}`);
console.log(`Current project version: ${projectVersion}`);

const version = requestedVersion ?? await promptValue("New release version", suggestedVersion);
if (localVersions.includes(version)) {
  throw new Error(`Local tag v${version} already exists. Choose a higher version, for example ${bumpPatch(version)}.`);
}
if (compareVersions(version, projectVersion) < 0) throw new Error(`New version ${version} cannot be lower than project version ${projectVersion}.`);
if (highestUsed && compareVersions(version, highestUsed) <= 0) {
  throw new Error(`New version ${version} must be greater than the previously used version ${highestUsed}. Withdrawn versions are not reused.`);
}
const tag = `v${version}`;

if (dryRun) {
  console.log(`Dry run passed. ${tag} can be prepared without publishing.`);
  process.exit(0);
}

if (capture("git", ["status", "--porcelain"])) throw new Error("Working tree is not clean. Commit or stash changes before publishing.");
const branch = capture("git", ["branch", "--show-current"]);
if (!branch) throw new Error("Cannot publish from a detached HEAD.");

const backups = new Map(versionFiles.map((path) => [path, readFileSync(path, "utf8")]));
let versionPrepared = false;
try {
  if (version !== projectVersion) {
    writeVersion(version);
    versionPrepared = true;
  }
  inheritPnpm(["check"]);
} catch (error) {
  if (versionPrepared) for (const [path, contents] of backups) writeFileSync(path, contents);
  throw error;
}

if (versionPrepared) {
  inherit("git", ["add", ...versionFiles]);
  inherit("git", ["commit", "-m", `chore: release ${tag}`]);
}
if (capture("git", ["status", "--porcelain"])) throw new Error("Publishing stopped because the working tree changed during verification.");

inherit("git", ["fetch", "origin", "--tags"]);
if (remoteTagVersions().includes(version)) throw new Error(`Tag ${tag} already exists on origin.`);
console.log("\nGenerated release notes preview:\n");
inherit(process.execPath, ["scripts/generate-release-notes.mjs", "--tag", tag]);
console.log("");
inherit("git", ["push", "origin", `HEAD:${branch}`]);
const commit = capture("git", ["rev-parse", "HEAD"]);
let localTagCommit = null;
try {
  localTagCommit = capture("git", ["rev-list", "-n", "1", tag]);
} catch {
  // A missing local tag is the normal first-publish path.
}
if (localTagCommit && localTagCommit !== commit) {
  throw new Error(`Local tag ${tag} points to ${localTagCommit}, not the release commit ${commit}.`);
}
if (!localTagCommit) inherit("git", ["tag", "--annotate", tag, "--message", `Release ${tag}`]);
inherit("git", ["push", "origin", tag]);

console.log(`Published ${tag}; waiting for the signed release assets to finish uploading.`);
waitForReleaseRun(tag, commit);
