import path from "node:path";

export const config = {
  host: process.env.HOST ?? "127.0.0.1",
  port: Number(process.env.PORT ?? 3000),
  databasePath: path.resolve(process.env.DATABASE_PATH ?? "./data/adb.sqlite"),
  camoufoxImage: process.env.CAMOUFOX_IMAGE ?? "camoufox-vnc:latest",
  noVncPortStart: Number(process.env.NOVNC_PORT_START ?? 59080),
  noVncPortEnd: Number(process.env.NOVNC_PORT_END ?? 59180)
};
