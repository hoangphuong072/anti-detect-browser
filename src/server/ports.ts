import net from "node:net";

export async function isPortAvailable(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.once("error", () => resolve(false));
    server.once("listening", () => {
      server.close(() => resolve(true));
    });
    server.listen(port, "127.0.0.1");
  });
}

export async function allocatePort(start: number, end: number, reserved: Set<number>): Promise<number> {
  for (let port = start; port <= end; port += 1) {
    if (reserved.has(port)) continue;
    if (await isPortAvailable(port)) return port;
  }
  throw new Error(`No available noVNC ports in range ${start}-${end}`);
}
