import { z } from "zod";
import type { BrowserProxy } from "../shared/types.js";

export const proxySchema = z.object({
  scheme: z.enum(["http", "https", "socks4", "socks5"]),
  host: z.string().min(1),
  port: z.coerce.number().int().min(1).max(65535),
  username: z.string().optional(),
  password: z.string().optional()
});

export function proxyToUrl(proxy: BrowserProxy): string {
  const auth =
    proxy.username && proxy.password
      ? `${encodeURIComponent(proxy.username)}:${encodeURIComponent(proxy.password)}@`
      : proxy.username
        ? `${encodeURIComponent(proxy.username)}@`
        : "";
  return `${proxy.scheme}://${auth}${proxy.host}:${proxy.port}`;
}

export function redactProxy(proxy?: BrowserProxy): BrowserProxy | undefined {
  if (!proxy) return undefined;
  return {
    ...proxy,
    password: proxy.password ? "********" : undefined
  };
}

export function parseProxyUrl(value: string): BrowserProxy {
  const parsed = new URL(value);
  const scheme = parsed.protocol.replace(":", "");
  const result = proxySchema.parse({
    scheme,
    host: parsed.hostname,
    port: Number(parsed.port),
    username: parsed.username ? decodeURIComponent(parsed.username) : undefined,
    password: parsed.password ? decodeURIComponent(parsed.password) : undefined
  });
  return result;
}
