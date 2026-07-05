import { spawn } from "node:child_process";
import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import net from "node:net";
import { launchOptions } from "camoufox-js";

const display = process.env.DISPLAY ?? ":99";
process.env.MOZ_DISABLE_CONTENT_SANDBOX = "1";
process.env.MOZ_DISABLE_GMP_SANDBOX = "1";
process.env.MOZ_DISABLE_RDD_SANDBOX = "1";
process.env.MOZ_DISABLE_SOCKET_PROCESS_SANDBOX = "1";
const startupUrl = process.env.STARTUP_URL || "about:blank";
const proxyUrl = process.env.CAMOUFOX_PROXY || "";
const persistentProfile = process.env.PERSISTENT_PROFILE === "1";
const profileDir = persistentProfile ? "/home/camoufox/profile" : "/home/camoufox/tmp/profile";
const screenWidth = Number(process.env.SCREEN_WIDTH ?? 1366);
const screenHeight = Number(process.env.SCREEN_HEIGHT ?? 768);
const exposedDevtoolsPort = Number(process.env.DEVTOOLS_PORT ?? 9222);
const firefoxDevtoolsPort = exposedDevtoolsPort + 1;

mkdirSync(profileDir, { recursive: true });
rmSync(`/tmp/.X${display.replace(":", "")}-lock`, { force: true });
rmSync("/tmp/.X11-unix/X99", { force: true });

function run(name, args) {
  const child = spawn(name, args, { stdio: "inherit", env: process.env });
  child.on("exit", (code) => {
    if (code) console.error(`${name} exited with code ${code}`);
  });
  return child;
}

const xvfb = run("Xvfb", [display, "-screen", "0", `${screenWidth}x${screenHeight}x24`, "-ac", "+extension", "RANDR"]);
await waitForDisplay(display);
run("fluxbox", []);
run("x11vnc", ["-display", display, "-forever", "-shared", "-nopw", "-rfbport", process.env.VNC_PORT ?? "5900"]);
run("websockify", ["--web=/usr/share/novnc", process.env.NOVNC_PORT ?? "6080", `localhost:${process.env.VNC_PORT ?? "5900"}`]);
const devtoolsBridge = startTcpBridge(exposedDevtoolsPort, firefoxDevtoolsPort);

const options = await launchOptions({ headless: false });
const browserEnv = { ...process.env, ...(options.env ?? {}), DISPLAY: display };
browserEnv.CAMOU_CONFIG_1 = resizeCamouConfig(browserEnv.CAMOU_CONFIG_1);
writeUserPrefs(profileDir, proxyUrl);

const browser = spawn(options.executablePath, [
  "-no-remote",
  "-profile",
  profileDir,
  "--remote-debugging-address",
  "0.0.0.0",
  "--remote-debugging-port",
  String(firefoxDevtoolsPort),
  startupUrl
], {
  stdio: "inherit",
  env: browserEnv
});
browser.on("exit", (code) => {
  console.error(`Camoufox exited with code ${code}`);
  process.exit(code ?? 1);
});

process.on("SIGTERM", async () => {
  browser.kill("SIGTERM");
  devtoolsBridge.close();
  xvfb.kill("SIGTERM");
  process.exit(0);
});

setInterval(() => undefined, 60_000);

async function waitForDisplay(value) {
  const displayNumber = value.replace(":", "");
  const socketPath = `/tmp/.X11-unix/X${displayNumber}`;
  for (let attempt = 0; attempt < 80; attempt += 1) {
    if (existsSync(socketPath)) return;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`Xvfb did not create ${socketPath}`);
}

function resizeCamouConfig(value) {
  if (!value) return value;
  try {
    const config = JSON.parse(value);
    config["screen.width"] = screenWidth;
    config["screen.height"] = screenHeight;
    config["screen.availWidth"] = screenWidth;
    config["screen.availHeight"] = screenHeight;
    config["window.outerWidth"] = screenWidth;
    config["window.outerHeight"] = screenHeight;
    return JSON.stringify(config);
  } catch {
    return value;
  }
}

function writeUserPrefs(dir, rawProxy) {
  const lines = [
    'user_pref("browser.shell.checkDefaultBrowser", false);',
    'user_pref("browser.tabs.warnOnClose", false);',
    'user_pref("browser.sessionstore.resume_from_crash", false);'
  ];

  if (rawProxy) {
    const proxy = new URL(rawProxy);
    const scheme = proxy.protocol.replace(":", "");
    const host = proxy.hostname;
    const port = Number(proxy.port);
    lines.push('user_pref("network.proxy.type", 1);');
    if (scheme.startsWith("socks")) {
      lines.push(`user_pref("network.proxy.socks", ${JSON.stringify(host)});`);
      lines.push(`user_pref("network.proxy.socks_port", ${port});`);
      lines.push(`user_pref("network.proxy.socks_version", ${scheme === "socks4" ? 4 : 5});`);
      lines.push('user_pref("network.proxy.socks_remote_dns", true);');
    } else {
      lines.push(`user_pref("network.proxy.http", ${JSON.stringify(host)});`);
      lines.push(`user_pref("network.proxy.http_port", ${port});`);
      lines.push(`user_pref("network.proxy.ssl", ${JSON.stringify(host)});`);
      lines.push(`user_pref("network.proxy.ssl_port", ${port});`);
    }
  } else {
    lines.push('user_pref("network.proxy.type", 0);');
  }

  writeFileSync(`${dir}/user.js`, `${lines.join("\n")}\n`);
}

function startTcpBridge(publicPort, targetPort) {
  return net.createServer((client) => {
    const upstream = net.connect(targetPort, "127.0.0.1");
    let firstChunk = true;
    client.on("data", (chunk) => {
      if (firstChunk) {
        firstChunk = false;
        const rewritten = chunk
          .toString("utf8")
          .replace(/^Host: .*$/im, `Host: 127.0.0.1:${targetPort}`);
        upstream.write(rewritten);
        client.pipe(upstream);
        return;
      }
      upstream.write(chunk);
    });
    upstream.pipe(client);
    client.on("error", () => upstream.destroy());
    upstream.on("error", () => client.destroy());
  }).listen(publicPort, "0.0.0.0", () => {
    console.log(`DevTools bridge listening on 0.0.0.0:${publicPort} -> 127.0.0.1:${targetPort}`);
  });
}
