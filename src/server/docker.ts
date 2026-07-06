import Docker from "dockerode";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { BrowserProxy, BrowserRecord, BrowserStatus, CreateBrowserRequest, ProxyTestResult, UpdateBrowserRequest } from "../shared/types.js";
import { allocatePort } from "./ports.js";
import { proxyToUrl } from "./proxy.js";
import type { BrowserRepository } from "./db.js";

const APP_LABEL = "adb.manager";
const ID_LABEL = "adb.browser.id";
const execFileAsync = promisify(execFile);

export class DockerBrowserService {
  private docker = new Docker();
  private runtimeImagePromise?: Promise<void>;

  constructor(
    private repo: BrowserRepository,
    private image: string,
    private portStart: number,
    private portEnd: number,
    private buildRuntimeImage: boolean,
    private runtimeContext: string
  ) {}

  async list(): Promise<BrowserRecord[]> {
    const records = this.repo.list();
    await Promise.all(records.map((record) => this.refreshStatus(record.id).catch(() => undefined)));
    return this.repo.list();
  }

  async get(id: string): Promise<BrowserRecord | undefined> {
    await this.refreshStatus(id).catch(() => undefined);
    return this.repo.get(id);
  }

  async create(input: CreateBrowserRequest): Promise<BrowserRecord> {
    const id = crypto.randomUUID();
    const noVncPort = await allocatePort(this.portStart, this.portEnd, this.repo.usedPorts());
    const containerName = `adb-browser-${id.slice(0, 12)}`;
    const volumeName = input.persistentProfile ? `adb-profile-${id}` : undefined;
    const now = new Date().toISOString();
    const record = this.repo.create({
      id,
      name: input.name,
      containerName,
      status: "created",
      desiredStatus: "stopped",
      noVncPort,
      devtoolsPort: noVncPort + 1000,
      startupUrl: input.startupUrl,
      persistentProfile: input.persistentProfile,
      volumeName,
      proxy: input.proxy,
      createdAt: now,
      updatedAt: now
    });
    await this.ensureContainer(record);
    return this.repo.get(id)!;
  }

  async start(id: string): Promise<BrowserRecord> {
    const record = this.mustGet(id);
    const container = await this.ensureContainer(record);
    await container.start().catch((error: { statusCode?: number }) => {
      if (error.statusCode !== 304) throw error;
    });
    await this.waitForStableStart(container, id);
    return this.repo.update(id, { desiredStatus: "running", status: "running" });
  }

  async stop(id: string): Promise<BrowserRecord> {
    const record = this.mustGet(id);
    const container = await this.findContainer(record);
    if (container) {
      await container.stop({ t: 10 }).catch((error: { statusCode?: number }) => {
        if (error.statusCode !== 304 && error.statusCode !== 404) throw error;
      });
    }
    return this.repo.update(id, { desiredStatus: "stopped", status: "stopped" });
  }

  async remove(id: string, deleteVolume: boolean): Promise<void> {
    const record = this.mustGet(id);
    const container = await this.findContainer(record);
    if (container) {
      await container.remove({ force: true, v: deleteVolume }).catch((error: { statusCode?: number }) => {
        if (error.statusCode !== 404) throw error;
      });
    }
    if (deleteVolume && record.volumeName) {
      await this.docker.getVolume(record.volumeName).remove().catch(() => undefined);
    }
    this.repo.delete(id);
  }

  async updateProxy(id: string, proxy?: BrowserProxy): Promise<BrowserRecord> {
    const record = this.mustGet(id);
    const wasRunning = record.status === "running";
    const container = await this.findContainer(record);
    if (container) {
      await container.remove({ force: true, v: false }).catch(() => undefined);
    }
    const next = this.repo.update(id, { proxy, containerId: undefined, status: "created" });
    await this.ensureContainer(next);
    if (wasRunning) return this.start(id);
    return this.repo.get(id)!;
  }

  async updateBrowser(id: string, input: UpdateBrowserRequest): Promise<BrowserRecord> {
    const record = this.mustGet(id);
    const proxy = this.mergeProxy(record.proxy, input.proxy);
    const wasRunning = record.status === "running";
    const runtimeChanged = record.startupUrl !== input.startupUrl || JSON.stringify(record.proxy ?? null) !== JSON.stringify(proxy ?? null);
    if (!runtimeChanged) {
      return this.repo.update(id, { name: input.name });
    }

    const container = await this.findContainer(record);
    if (container) {
      await container.remove({ force: true, v: false }).catch(() => undefined);
    }
    const next = this.repo.update(id, {
      name: input.name,
      startupUrl: input.startupUrl,
      proxy,
      containerId: undefined,
      status: "created"
    });
    await this.ensureContainer(next);
    if (wasRunning) return this.start(id);
    return this.repo.get(id)!;
  }

  async clearData(id: string): Promise<BrowserRecord> {
    const record = this.mustGet(id);
    const wasRunning = record.status === "running";
    const container = await this.findContainer(record);
    if (container) {
      await container.remove({ force: true, v: false }).catch(() => undefined);
    }
    if (record.volumeName) {
      await this.docker.getVolume(record.volumeName).remove().catch(() => undefined);
    }
    const next = this.repo.update(id, { containerId: undefined, status: "created" });
    await this.ensureContainer(next);
    if (wasRunning) return this.start(id);
    return this.repo.get(id)!;
  }

  async testProxy(proxy: BrowserProxy): Promise<ProxyTestResult> {
    try {
      const { stdout } = await execFileAsync(
        "curl",
        ["--silent", "--show-error", "--fail", "--max-time", "15", "--proxy", proxyToUrl(proxy), "https://api.ipify.org?format=json"],
        { timeout: 20000 }
      );
      const body = JSON.parse(stdout) as { ip?: string };
      return { ok: Boolean(body.ip), ip: body.ip, body };
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : String(error) };
    }
  }

  private async ensureContainer(record: BrowserRecord): Promise<Docker.Container> {
    await this.ensureRuntimeImage();
    const existing = await this.findContainer(record);
    if (existing) {
      if (await this.isContainerUsingCurrentImage(existing)) return existing;
      await existing.remove({ force: true, v: false }).catch(() => undefined);
      this.repo.update(record.id, { containerId: undefined, status: "created" });
    }

    const env = [
      `BROWSER_ID=${record.id}`,
      `STARTUP_URL=${record.startupUrl ?? "about:blank"}`,
      `PERSISTENT_PROFILE=${record.persistentProfile ? "1" : "0"}`
    ];
    if (record.proxy) env.push(`CAMOUFOX_PROXY=${proxyToUrl(record.proxy)}`);

    const binds = record.volumeName ? [`${record.volumeName}:/home/camoufox/profile`] : [];
    const container = await this.docker.createContainer({
      Image: this.image,
      name: record.containerName,
      Env: env,
      Labels: {
        [APP_LABEL]: "true",
        [ID_LABEL]: record.id
      },
      ExposedPorts: {
        "6080/tcp": {},
        "9222/tcp": {}
      },
      HostConfig: {
        Binds: binds,
        PortBindings: {
          "6080/tcp": [{ HostIp: "127.0.0.1", HostPort: String(record.noVncPort) }],
          "9222/tcp": [{ HostIp: "0.0.0.0", HostPort: String(record.devtoolsPort) }]
        },
        ShmSize: 1024 * 1024 * 1024
      }
    });
    this.repo.update(record.id, { containerId: container.id, status: "created" });
    return container;
  }

  private async ensureRuntimeImage(): Promise<void> {
    try {
      await this.docker.getImage(this.image).inspect();
      return;
    } catch (error) {
      if (!this.buildRuntimeImage) {
        throw new Error(`Runtime image ${this.image} is missing. Set ADB_BUILD_RUNTIME_IMAGE=1 or pre-build/push CAMOUFOX_IMAGE.`);
      }
    }

    this.runtimeImagePromise ??= this.buildRuntimeImageNow().finally(() => {
      this.runtimeImagePromise = undefined;
    });
    return this.runtimeImagePromise;
  }

  private async buildRuntimeImageNow(): Promise<void> {
    console.log(`Runtime image ${this.image} is missing; building from ${this.runtimeContext}`);
    await execFileAsync("docker", ["build", "-t", this.image, this.runtimeContext], {
      timeout: 30 * 60 * 1000,
      maxBuffer: 1024 * 1024 * 20
    });
    console.log(`Runtime image ${this.image} built successfully`);
  }

  private async findContainer(record: BrowserRecord): Promise<Docker.Container | undefined> {
    if (record.containerId) {
      const container = this.docker.getContainer(record.containerId);
      try {
        await container.inspect();
        return container;
      } catch {
        return undefined;
      }
    }
    const containers = await this.docker.listContainers({
      all: true,
      filters: { label: [`${ID_LABEL}=${record.id}`] }
    });
    if (!containers[0]) return undefined;
    return this.docker.getContainer(containers[0].Id);
  }

  private async isContainerUsingCurrentImage(container: Docker.Container): Promise<boolean> {
    const [containerDetails, imageDetails] = await Promise.all([
      container.inspect(),
      this.docker.getImage(this.image).inspect()
    ]);
    return containerDetails.Image === imageDetails.Id;
  }

  private async refreshStatus(id: string): Promise<void> {
    const record = this.repo.get(id);
    if (!record) return;
    const container = await this.findContainer(record);
    if (!container) {
      this.repo.update(id, { status: "missing", containerId: undefined });
      return;
    }
    const details = await container.inspect();
    const status: BrowserStatus = details.State.Running ? "running" : "stopped";
    this.repo.update(id, { status, containerId: details.Id });
  }

  private async waitForStableStart(container: Docker.Container, id: string): Promise<void> {
    const timeoutMs = Number(process.env.ADB_START_GRACE_MS ?? 6000);
    const deadline = Date.now() + timeoutMs;

    while (Date.now() < deadline) {
      const details = await container.inspect();
      if (!details.State.Running) {
        this.repo.update(id, { desiredStatus: "running", status: "stopped", containerId: details.Id });
        throw new Error(await this.describeContainerExit(container, details));
      }
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
  }

  private async describeContainerExit(container: Docker.Container, details: Docker.ContainerInspectInfo): Promise<string> {
    const exitCode = details.State.ExitCode;
    const stateError = details.State.Error ? ` (${details.State.Error})` : "";
    const logs = await container
      .logs({ stdout: true, stderr: true, tail: 80 })
      .then((buffer) => this.cleanDockerLogBuffer(buffer).trim())
      .catch(() => "");
    const suffix = logs ? `\n\nLast container logs:\n${logs}` : "";
    return `Browser container stopped during startup with exit code ${exitCode}${stateError}.${suffix}`;
  }

  private cleanDockerLogBuffer(buffer: Buffer): string {
    let offset = 0;
    const chunks: Buffer[] = [];

    while (offset + 8 <= buffer.length) {
      const size = buffer.readUInt32BE(offset + 4);
      const start = offset + 8;
      const end = start + size;
      if (end > buffer.length) break;
      chunks.push(buffer.subarray(start, end));
      offset = end;
    }

    return (chunks.length ? Buffer.concat(chunks) : buffer).toString("utf8");
  }

  private mustGet(id: string): BrowserRecord {
    const record = this.repo.get(id);
    if (!record) throw new Error("Browser not found");
    return record;
  }

  private mergeProxy(current: BrowserProxy | undefined, next: BrowserProxy | undefined): BrowserProxy | undefined {
    if (!next) return undefined;
    if (!current) return next;
    if (next.password === "********" || next.password === "") {
      return { ...next, password: current.password };
    }
    return next;
  }
}
