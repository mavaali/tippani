const release = process.env.TIPPANI_RELEASE === "1";
const path = require("node:path");
const { execFileSync } = require("node:child_process");

module.exports = {
  appId: "io.github.mavaali.tippani",
  productName: "Tippani",
  directories: { app: path.join(__dirname, "dist", "desktop-app"), output: path.join(__dirname, "installers") },
  electronVersion: require("./package.json").devDependencies.electron,
  files: ["desktop/**", "cli.cjs", "package.json", "LICENSE", "!node_modules/**"],
  asar: true,
  npmRebuild: false,
  publish: null,
  artifactName: "Tippani-${version}-${os}-${arch}.${ext}",
  forceCodeSigning: release,
  beforePack: async (context) => {
    if (!release) return;
    const required = context.electronPlatformName === "darwin"
      ? ["CSC_LINK", "CSC_KEY_PASSWORD", "APPLE_ID", "APPLE_APP_SPECIFIC_PASSWORD", "APPLE_TEAM_ID"]
      : ["CSC_LINK", "CSC_KEY_PASSWORD"];
    for (const key of required) {
      if (!process.env[key]) throw new Error(`Release signing requires ${key}. No unsigned release fallback.`);
    }
  },
  afterPack: async context => {
    if (!release && context.electronPlatformName === "darwin") {
      execFileSync("codesign", ["--force", "--deep", "--sign", "-", path.join(context.appOutDir, "Tippani.app")], { stdio: "pipe" });
    }
  },
  mac: {
    target: ["dmg"],
    identity: release ? undefined : null,
    category: "public.app-category.productivity",
    minimumSystemVersion: "12.0",
    hardenedRuntime: true,
    notarize: release,
  },
  dmg: {
    sign: release,
    contents: [
      { x: 130, y: 220, type: "file" },
      { x: 410, y: 220, type: "link", path: "/Applications" },
    ],
  },
  win: { target: ["nsis"], signAndEditExecutable: true },
  nsis: {
    oneClick: false,
    perMachine: false,
    allowElevation: false,
    allowToChangeInstallationDirectory: true,
    createStartMenuShortcut: true,
    createDesktopShortcut: true,
    shortcutName: "Tippani",
    deleteAppDataOnUninstall: false,
    runAfterFinish: true,
  },
};
