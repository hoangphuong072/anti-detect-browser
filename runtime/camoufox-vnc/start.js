import { spawn } from "node:child_process";
import { mkdirSync } from "node:fs";
import { launchOptions } from "camoufox-js";
import { firefox } from "playwright-core";

const display = process.env.DISPLAY ?? ":99";
process.env.MOZ_DISABLE_CONTENT_SANDBOX = "1";
process.env.MOZ_DISABLE_GMP_SANDBOX = "1";
process.env.MOZ_DISABLE_RDD_SANDBOX = "1";
process.env.MOZ_DISABLE_SOCKET_PROCESS_SANDBOX = "1";
const startupUrl = process.env.STARTUP_URL || "about:blank";
const proxyUrl = process.env.CAMOUFOX_PROXY || "";
const persistentProfile = process.env.PERSISTENT_PROFILE === "1";
const profileDir = persistentProfile ? "/home/camoufox/profile" : "/home/camoufox/tmp/profile";

mkdirSync(profileDir, { recursive: true });

function run(name, args) {
  const child = spawn(name, args, { stdio: "inherit", env: process.env });
  child.on("exit", (code) => {
    if (code) console.error(`${name} exited with code ${code}`);
  });
  return child;
}

run("Xvfb", [display, "-screen", "0", "1366x768x24", "-ac", "+extension", "RANDR"]);
run("fluxbox", []);
run("x11vnc", ["-display", display, "-forever", "-shared", "-nopw", "-rfbport", process.env.VNC_PORT ?? "5900"]);
run("websockify", ["--web=/usr/share/novnc", process.env.NOVNC_PORT ?? "6080", `localhost:${process.env.VNC_PORT ?? "5900"}`]);

const options = await launchOptions({ headless: false });
options.env = { ...(options.env ?? {}), DISPLAY: display };

if (proxyUrl) {
  options.proxy = { server: proxyUrl };
}

const browser = await firefox.launchPersistentContext(profileDir, options);
const page = browser.pages()[0] ?? (await browser.newPage());
await page.goto(startupUrl).catch((error) => console.error(`Startup URL failed: ${error.message}`));

process.on("SIGTERM", async () => {
  await browser.close().catch(() => undefined);
  process.exit(0);
});

setInterval(() => undefined, 60_000);
