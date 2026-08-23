import { execFileSync } from "node:child_process";
import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";

export function capture(command, args, options = {}) {
  return execFileSync(command, args, {
    encoding: "utf8",
    stdio: ["ignore", "pipe", options.quietStderr ? "ignore" : "pipe"],
  }).trim();
}

export function inherit(command, args) {
  execFileSync(command, args, { stdio: "inherit" });
}

function pnpmInvocation(args) {
  if (process.platform !== "win32") return { command: "pnpm", args };
  const command = process.env.ComSpec ?? `${process.env.SystemRoot ?? "C:\\Windows"}\\System32\\cmd.exe`;
  return { command, args: ["/d", "/s", "/c", "pnpm", ...args] };
}

export function capturePnpm(args) {
  const invocation = pnpmInvocation(args);
  return capture(invocation.command, invocation.args);
}

export function inheritPnpm(args) {
  const invocation = pnpmInvocation(args);
  inherit(invocation.command, invocation.args);
}

export function parseVersion(value) {
  const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(value.trim());
  if (!match) throw new Error(`Version must use stable SemVer x.y.z, received: ${value}`);
  return match.slice(1).map(Number);
}

export function compareVersions(left, right) {
  const a = parseVersion(left);
  const b = parseVersion(right);
  for (let index = 0; index < 3; index += 1) {
    if (a[index] !== b[index]) return a[index] - b[index];
  }
  return 0;
}

export function highestVersion(values) {
  return values.filter(Boolean).sort(compareVersions).at(-1) ?? null;
}

export function bumpPatch(version) {
  const [major, minor, patch] = parseVersion(version);
  return `${major}.${minor}.${patch + 1}`;
}

export function isVersionOnlyChangeSet(paths, versionFiles) {
  if (paths.length === 0) return false;
  const allowed = new Set(versionFiles);
  return paths.every((path) => allowed.has(path));
}

export function canResumeVersionPreparation({ selectedVersion, projectVersion, highestUsedVersion, taggedVersions, changedPaths, versionFiles }) {
  return selectedVersion === projectVersion
    && !taggedVersions.includes(selectedVersion)
    && (!highestUsedVersion || compareVersions(projectVersion, highestUsedVersion) > 0)
    && isVersionOnlyChangeSet(changedPaths, versionFiles);
}

export function selectSuggestedReleaseVersion({ projectVersion, usedVersions, taggedVersions, publishedVersion }) {
  // A tag without a published release means a previous invocation reached the
  // push phase and was interrupted. Keep suggesting that version so rerunning
  // the command resumes the existing release instead of skipping to the next one.
  if (taggedVersions.includes(projectVersion) && publishedVersion !== projectVersion) {
    return projectVersion;
  }
  const highestUsed = highestVersion([...usedVersions, publishedVersion]);
  if (!highestUsed || compareVersions(projectVersion, highestUsed) > 0) return projectVersion;
  return bumpPatch(highestUsed);
}

export function remoteTagVersions() {
  const output = capture("git", ["ls-remote", "--tags", "origin", "refs/tags/v*"]);
  const versions = [];
  for (const line of output.split(/\r?\n/)) {
    const match = /refs\/tags\/v(\d+\.\d+\.\d+)(?:\^\{\})?$/.exec(line);
    if (match) versions.push(match[1]);
  }
  return [...new Set(versions)];
}

export function localTagVersions() {
  const output = capture("git", ["tag", "--list", "v*"]);
  return output.split(/\r?\n/)
    .map((tag) => /^v(\d+\.\d+\.\d+)$/.exec(tag)?.[1] ?? null)
    .filter(Boolean);
}

export function latestPublishedRelease() {
  const releases = JSON.parse(capture("gh", [
    "release", "list", "--limit", "100",
    "--json", "tagName,isDraft,isPrerelease,isLatest,publishedAt",
  ]));
  const summary = releases.find((release) => release.isLatest)
    ?? releases.find((release) => !release.isDraft && !release.isPrerelease);
  if (!summary) return null;
  const match = /^v(\d+\.\d+\.\d+)$/.exec(summary.tagName ?? "");
  if (!match) return null;
  const details = JSON.parse(capture("gh", ["release", "view", summary.tagName, "--json", "url,assets"]));
  return { version: match[1], tag: summary.tagName, url: details.url, assets: details.assets ?? [] };
}

export async function promptValue(question, fallback) {
  if (!stdin.isTTY) throw new Error(`Interactive input is unavailable. Pass the value explicitly, for example: pnpm tag -- ${fallback}`);
  const prompt = createInterface({ input: stdin, output: stdout });
  try {
    return (await prompt.question(`${question} [${fallback}]: `)).trim() || fallback;
  } finally {
    prompt.close();
  }
}

export async function promptExact(question, expected) {
  if (!stdin.isTTY) throw new Error("Interactive confirmation is required for withdrawing a release.");
  const prompt = createInterface({ input: stdin, output: stdout });
  try {
    return (await prompt.question(`${question}\nType ${expected} to continue: `)).trim() === expected;
  } finally {
    prompt.close();
  }
}
