import { describe, expect, it } from "vitest";
import { parseProxyUrl, proxyToUrl, redactProxy } from "./proxy.js";

describe("proxy utilities", () => {
  it("parses socks proxies with credentials", () => {
    expect(parseProxyUrl("socks5://user:p%40ss@example.com:1080")).toEqual({
      scheme: "socks5",
      host: "example.com",
      port: 1080,
      username: "user",
      password: "p@ss"
    });
  });

  it("serializes proxy URLs", () => {
    expect(
      proxyToUrl({
        scheme: "http",
        host: "proxy.local",
        port: 8080,
        username: "agent",
        password: "secret value"
      })
    ).toBe("http://agent:secret%20value@proxy.local:8080");
  });

  it("redacts proxy passwords", () => {
    expect(
      redactProxy({
        scheme: "https",
        host: "proxy.local",
        port: 8443,
        username: "agent",
        password: "secret"
      })
    ).toEqual({
      scheme: "https",
      host: "proxy.local",
      port: 8443,
      username: "agent",
      password: "********"
    });
  });
});
