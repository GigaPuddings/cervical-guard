import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { capture } from "./release-utils.mjs";

function optionValue(args, name) {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : undefined;
}

function encodePathSegment(value) {
  return encodeURIComponent(value).replace(/%2F/gi, "/");
}

export function stableReleaseAssetUrl(repository, tag, assetName) {
  if (!/^[^/\s]+\/[^/\s]+$/.test(repository)) throw new Error(`Invalid GitHub repository: ${repository}`);
  if (!/^v\d+\.\d+\.\d+$/.test(tag)) throw new Error(`Invalid release tag: ${tag}`);
  if (!assetName || /[\\/]/.test(assetName)) throw new Error(`Invalid release asset name: ${assetName}`);
  return `https://github.com/${repository}/releases/download/${encodePathSegment(tag)}/${encodePathSegment(assetName)}`;
}

function isGitHubApiAssetUrl(value) {
  try {
    const url = new URL(value);
    return url.hostname === "api.github.com" && /^\/repos\/[^/]+\/[^/]+\/releases\/assets\/\d+$/.test(url.pathname);
  } catch {
    return false;
  }
}

function architectureAliases(platform) {
  if (platform.includes("x86_64")) return ["x64", "x86_64"];
  if (platform.includes("aarch64")) return ["arm64", "aarch64"];
  if (platform.includes("i686")) return ["x86", "i686"];
  return [];
}

export function selectUpdaterAsset(platform, assets) {
  const candidates = assets
    .map((asset) => typeof asset === "string" ? asset : asset?.name)
    .filter((name) => typeof name === "string" && !name.endsWith(".sig"));
  const windowsCandidates = platform.startsWith("windows-")
    ? candidates.filter((name) => name.toLowerCase().endsWith(".exe"))
    : candidates;
  if (windowsCandidates.length === 1) return windowsCandidates[0];

  const aliases = architectureAliases(platform);
  const ranked = windowsCandidates
    .map((name) => {
      const lower = name.toLowerCase();
      let score = 0;
      if (platform.startsWith("windows-") && lower.endsWith(".exe")) score += 20;
      if (platform.endsWith("-nsis") && lower.includes("setup")) score += 10;
      if (aliases.some((alias) => lower.includes(alias))) score += 5;
      return { name, score };
    })
    .sort((left, right) => right.score - left.score || left.name.localeCompare(right.name));
  if (!ranked[0] || (ranked[1] && ranked[0].score === ranked[1].score)) {
    throw new Error(`Could not select one updater asset for ${platform}. Assets: ${candidates.join(", ")}`);
  }
  return ranked[0].name;
}

export function stabilizeUpdaterManifest(manifest, { repository, tag, assets }) {
  if (!manifest || typeof manifest !== "object" || !manifest.platforms || typeof manifest.platforms !== "object") {
    throw new Error("Updater manifest must contain a platforms object.");
  }
  let replacements = 0;
  const platforms = Object.fromEntries(Object.entries(manifest.platforms).map(([platform, entry]) => {
    if (!entry || typeof entry !== "object" || !isGitHubApiAssetUrl(entry.url)) return [platform, entry];
    const assetName = selectUpdaterAsset(platform, assets);
    replacements += 1;
    return [platform, { ...entry, url: stableReleaseAssetUrl(repository, tag, assetName) }];
  }));
  return { manifest: { ...manifest, platforms }, replacements };
}

async function main() {
  const args = process.argv.slice(2);
  const input = optionValue(args, "--input");
  const output = optionValue(args, "--output") ?? input;
  const repository = optionValue(args, "--repository") ?? process.env.GITHUB_REPOSITORY;
  const tag = optionValue(args, "--tag");
  if (!input || !output || !repository || !tag) {
    throw new Error("Usage: node scripts/stabilize-updater-manifest.mjs --input latest.json [--output latest.json] --repository owner/repo --tag vX.Y.Z");
  }
  const release = JSON.parse(capture("gh", ["release", "view", tag, "--json", "assets"]));
  const source = JSON.parse(await readFile(input, "utf8"));
  const result = stabilizeUpdaterManifest(source, { repository, tag, assets: release.assets ?? [] });
  await writeFile(output, `${JSON.stringify(result.manifest, null, 2)}\n`, "utf8");
  console.log(`Stabilized ${result.replacements} updater URL(s) in ${output}.`);
}

const invokedDirectly = process.argv[1]
  && resolve(process.argv[1]).toLowerCase() === fileURLToPath(import.meta.url).toLowerCase();
if (invokedDirectly) main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
