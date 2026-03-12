const { spawn } = require("child_process");

const mode = process.argv[2];
if (mode !== "local" && mode !== "online") {
  console.error("Usage: node ./scripts/start-with-mode.js <local|online>");
  process.exit(1);
}

const extraArgs = process.argv.slice(3);
const isWindows = process.platform === "win32";
const expoCommand = isWindows ? "npx" : "npx";
const env = { ...process.env, EXPO_PUBLIC_API_MODE: mode };

const child = spawn(expoCommand, ["expo", "start", ...extraArgs], {
  stdio: "inherit",
  shell: isWindows,
  env,
});

child.on("exit", (code) => {
  process.exit(code ?? 0);
});
