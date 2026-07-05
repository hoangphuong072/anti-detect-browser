import path from "node:path";
import http from "node:http";
import { fileURLToPath } from "node:url";
import cors from "cors";
import express from "express";
import httpProxy from "http-proxy";
import { createProxyMiddleware } from "http-proxy-middleware";
import { ZodError } from "zod";
import { config } from "./config.js";
import { BrowserRepository } from "./db.js";
import { DockerBrowserService } from "./docker.js";
import { redactProxy } from "./proxy.js";
import { createBrowserSchema, updateProxySchema } from "./schemas.js";

const app = express();
const repo = new BrowserRepository(config.databasePath);
const service = new DockerBrowserService(repo, config.camoufoxImage, config.noVncPortStart, config.noVncPortEnd);
const wsProxy = httpProxy.createProxyServer({ ws: true, changeOrigin: true });
const remoteHttpProxies = new Map<number, express.RequestHandler>();
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const webDir = path.resolve(__dirname, "../web");

app.use(cors({ origin: true }));
app.use(express.json());

function publicBrowser<T extends { proxy?: unknown }>(browser: T): T {
  return { ...browser, proxy: redactProxy(browser.proxy as never) };
}

function getRemoteHttpProxy(port: number) {
  const existing = remoteHttpProxies.get(port);
  if (existing) return existing;
  const middleware = createProxyMiddleware({
    target: `http://127.0.0.1:${port}`,
    changeOrigin: true
  }) as unknown as express.RequestHandler;
  remoteHttpProxies.set(port, middleware);
  return middleware;
}

app.get("/api/health", (_req, res) => {
  res.json({ ok: true, image: config.camoufoxImage });
});

app.get("/api/browsers", async (_req, res, next) => {
  try {
    const browsers = await service.list();
    res.json(browsers.map(publicBrowser));
  } catch (error) {
    next(error);
  }
});

app.post("/api/browsers", async (req, res, next) => {
  try {
    const parsed = createBrowserSchema.parse(req.body);
    const browser = await service.create({
      ...parsed,
      startupUrl: parsed.startupUrl || undefined
    });
    res.status(201).json(publicBrowser(browser));
  } catch (error) {
    next(error);
  }
});

app.get("/api/browsers/:id", async (req, res, next) => {
  try {
    const browser = await service.get(req.params.id);
    if (!browser) return res.status(404).json({ error: "Browser not found" });
    res.json(publicBrowser(browser));
  } catch (error) {
    next(error);
  }
});

app.post("/api/browsers/:id/start", async (req, res, next) => {
  try {
    res.json(publicBrowser(await service.start(req.params.id)));
  } catch (error) {
    next(error);
  }
});

app.post("/api/browsers/:id/stop", async (req, res, next) => {
  try {
    res.json(publicBrowser(await service.stop(req.params.id)));
  } catch (error) {
    next(error);
  }
});

app.delete("/api/browsers/:id", async (req, res, next) => {
  try {
    await service.remove(req.params.id, req.query.deleteVolume === "true");
    res.status(204).send();
  } catch (error) {
    next(error);
  }
});

app.post("/api/browsers/:id/proxy", async (req, res, next) => {
  try {
    const parsed = updateProxySchema.parse(req.body);
    const browser = await service.updateProxy(req.params.id, parsed.proxy ?? undefined);
    res.json(publicBrowser(browser));
  } catch (error) {
    next(error);
  }
});

app.post("/api/browsers/:id/proxy/test", async (req, res, next) => {
  try {
    const parsed = updateProxySchema.parse(req.body);
    const browser = await service.get(req.params.id);
    const proxy = parsed.proxy ?? browser?.proxy;
    if (!proxy) return res.status(400).json({ error: "Proxy is required" });
    res.json(await service.testProxy(proxy));
  } catch (error) {
    next(error);
  }
});

app.get("/api/browsers/:id/remote", async (req, res, next) => {
  try {
    const browser = await service.get(req.params.id);
    if (!browser) return res.status(404).json({ error: "Browser not found" });
    res.json({ url: browser.remoteUrl, noVncPort: browser.noVncPort });
  } catch (error) {
    next(error);
  }
});

app.use(
  "/remote/:id",
  async (req, res, next) => {
    const browser = await service.get(req.params.id);
    if (!browser) return res.status(404).send("Browser not found");
    return getRemoteHttpProxy(browser.noVncPort)(req, res, next);
  }
);

app.use(express.static(webDir));
app.get("/{*splat}", (_req, res) => {
  res.sendFile(path.join(webDir, "index.html"));
});

app.use((error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  if (error instanceof ZodError) {
    return res.status(400).json({ error: "Validation failed", details: error.flatten() });
  }
  const message = error instanceof Error ? error.message : String(error);
  const status = message === "Browser not found" ? 404 : 500;
  return res.status(status).json({ error: message });
});

const server = http.createServer(app);

server.on("upgrade", async (req, socket, head) => {
  try {
    const pathname = new URL(req.url ?? "/", "http://localhost").pathname;
    const match = pathname.match(/^\/remote\/([^/]+)(\/.*)$/);
    if (!match) {
      socket.destroy();
      return;
    }

    const browser = await service.get(match[1]);
    if (!browser) {
      socket.destroy();
      return;
    }

    req.url = `${match[2]}${req.url?.includes("?") ? `?${req.url.split("?")[1]}` : ""}`;
    wsProxy.ws(req, socket, head, { target: `http://127.0.0.1:${browser.noVncPort}` });
  } catch {
    socket.destroy();
  }
});

wsProxy.on("error", (_error, _req, socket) => {
  socket.destroy();
});

server.listen(config.port, config.host, () => {
  console.log(`Antidetect Browser Manager listening on http://${config.host}:${config.port}`);
});
