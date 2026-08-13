import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

function capture(command, args) {
  return execFileSync(command, args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
}

function inherit(command, args) {
  execFileSync(command, args, { stdio: "inherit" });
}

const packageVersion = JSON.parse(readFileSync("package.json", "utf8")).version;
const tauriVersion = JSON.parse(readFileSync("src-tauri/tauri.conf.json", "utf8")).version;
const cargoText = readFileSync("src-tauri/Cargo.toml", "utf8");
const cargoVersion = cargoText.match(/^version\s*=\s*"([^"]+)"/m)?.[1];

if (!/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(packageVersion)) {
  throw new Error(`package.json version is not valid SemVer: ${packageVersion}`);
}
if (packageVersion !== tauriVersion || packageVersion !== cargoVersion) {
  throw new Error(`Version mismatch: package=${packageVersion}, tauri=${tauriVersion}, cargo=${cargoVersion ?? "missing"}`);
}
if (capture("git", ["status", "--porcelain"])) {
  throw new Error("Working tree is not clean. Commit or stash changes before publishing.");
}

const branch = capture("git", ["branch", "--show-current"]);
if (!branch) throw new Error("Cannot publish from a detached HEAD.");

const tag = `v${packageVersion}`;
inherit("git", ["fetch", "origin", "--tags"]);
try {
  capture("git", ["rev-parse", "--verify", `refs/tags/${tag}`]);
  throw new Error(`Tag ${tag} already exists.`);
} catch (error) {
  if (error instanceof Error && error.message === `Tag ${tag} already exists.`) throw error;
}

inherit("git", ["push", "origin", `HEAD:${branch}`]);
inherit("git", ["tag", "--annotate", tag, "--message", `Release ${tag}`]);
inherit("git", ["push", "origin", tag]);

console.log(`Published ${tag}. GitHub Actions will build and upload the signed release assets.`);
