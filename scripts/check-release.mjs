import fs from "node:fs";
const { version } = JSON.parse(fs.readFileSync(new URL("../package.json", import.meta.url)));
const response = await fetch(`https://api.github.com/repos/mavaali/tippani/releases/tags/v${version}`, {
  headers: { Accept: "application/vnd.github+json", "User-Agent": "tippani-release-check" },
  signal: AbortSignal.timeout(15000),
});
if (!response.ok) throw new Error("Publish the signed desktop release through release.yml before publishing to npm.");
const release = await response.json();
const expected = [
  `Tippani-${version}-mac-arm64.dmg`,
  `Tippani-${version}-mac-x64.dmg`,
  `Tippani-${version}-win-x64.exe`,
  "SHA256SUMS.txt",
];
if (release.draft || !expected.every(name => release.assets.some(asset => asset.name === name && asset.size > 0))) {
  throw new Error("npm publication blocked: this version needs both macOS installers, the Windows installer, and checksums in a public GitHub release.");
}
console.log("Signed-desktop release artifacts are present; npm publication may proceed.");
