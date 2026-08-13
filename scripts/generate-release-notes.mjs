import { execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { compareVersions, parseVersion } from "./release-utils.mjs";
import { parseCommitSubject, releaseCategory } from "./conventional-commits.mjs";

function capture(command, args) {
  return execFileSync(command, args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
}

export function previousStableTag(currentTag, tags) {
  const currentVersion = currentTag.replace(/^v/, "");
  parseVersion(currentVersion);
  return tags
    .filter((tag) => /^v\d+\.\d+\.\d+$/.test(tag) && tag !== currentTag)
    .filter((tag) => compareVersions(tag.slice(1), currentVersion) < 0)
    .sort((left, right) => compareVersions(left.slice(1), right.slice(1)))
    .at(-1) ?? null;
}

export function categorizeCommits(commits) {
  const groups = { feat: [], fix: [], perf: [], other: [] };
  for (const commit of commits) {
    if (/^chore: release v\d+\.\d+\.\d+$/.test(commit.subject)) continue;
    const parsed = parseCommitSubject(commit.subject);
    const category = parsed ? releaseCategory(parsed.type) : "other";
    const description = parsed?.description ?? commit.subject;
    const scope = parsed?.scope ? `**${parsed.scope}:** ` : "";
    groups[category].push({ ...commit, text: `${scope}${description}`, breaking: parsed?.breaking ?? false });
  }
  return groups;
}

export function renderReleaseNotes({ tag, previousTag, commits }) {
  const version = tag.replace(/^v/, "");
  const groups = categorizeCommits(commits);
  const sections = [
    ["feat", "Features / 新功能"],
    ["fix", "Fixes / 问题修复"],
    ["perf", "Performance / 性能优化"],
    ["other", "Other Changes / 其他变更"],
  ];
  const lines = [`## Cervical Guard ${version}`, ""];
  for (const [key, title] of sections) {
    if (!groups[key].length) continue;
    lines.push(`### ${title}`, "");
    for (const commit of groups[key]) lines.push(`- ${commit.breaking ? "**BREAKING:** " : ""}${commit.text} (\`${commit.hash.slice(0, 7)}\`)`);
    lines.push("");
  }
  if (!commits.length || sections.every(([key]) => groups[key].length === 0)) lines.push("- No user-visible changes / 无面向用户的变更", "");
  lines.push(`_Changes since ${previousTag ?? "the initial commit"}._`);
  return `${lines.join("\n")}\n`;
}

export function readCommits(previousTag, head = "HEAD") {
  const range = previousTag ? `${previousTag}..${head}` : head;
  const output = capture("git", ["log", range, "--format=%H%x1f%s%x1e"]);
  if (!output) return [];
  return output.split("\x1e").map((record) => record.trim()).filter(Boolean).map((record) => {
    const [hash, subject] = record.split("\x1f");
    return { hash, subject };
  });
}

function runCli() {
  const args = process.argv.slice(2);
  const valueAfter = (flag) => {
    const index = args.indexOf(flag);
    return index >= 0 ? args[index + 1] : null;
  };
  const tag = valueAfter("--tag");
  const outputPath = valueAfter("--output");
  if (!tag || !/^v\d+\.\d+\.\d+$/.test(tag)) throw new Error("--tag vX.Y.Z is required.");
  const tags = capture("git", ["tag", "--list", "v*", "--merged", "HEAD"]).split(/\r?\n/).filter(Boolean);
  const previousTag = previousStableTag(tag, tags);
  const notes = renderReleaseNotes({ tag, previousTag, commits: readCommits(previousTag) });
  if (outputPath) writeFileSync(outputPath, notes, "utf8");
  else process.stdout.write(notes);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) runCli();
