export type BrowserStatus = "created" | "running" | "stopped" | "missing" | "error";

export type ProxyScheme = "http" | "https" | "socks4" | "socks5";

export interface BrowserProxy {
  scheme: ProxyScheme;
  host: string;
  port: number;
  username?: string;
  password?: string;
}

export interface BrowserRecord {
  id: string;
  name: string;
  containerName: string;
  containerId?: string;
  status: BrowserStatus;
  desiredStatus: "running" | "stopped";
  noVncPort: number;
  devtoolsPort: number;
  startupUrl?: string;
  persistentProfile: boolean;
  volumeName?: string;
  proxy?: BrowserProxy;
  createdAt: string;
  updatedAt: string;
  remoteUrl: string;
}

export interface CreateBrowserRequest {
  name: string;
  proxy?: BrowserProxy;
  persistentProfile: boolean;
  startupUrl?: string;
}

export interface UpdateBrowserRequest {
  name: string;
  proxy?: BrowserProxy;
  startupUrl?: string;
}

export interface ProxyTestResult {
  ok: boolean;
  ip?: string;
  body?: unknown;
  error?: string;
}
