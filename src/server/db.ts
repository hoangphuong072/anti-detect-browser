import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import type { BrowserProxy, BrowserRecord, BrowserStatus } from "../shared/types.js";

type Row = {
  id: string;
  name: string;
  container_name: string;
  container_id: string | null;
  status: BrowserStatus;
  desired_status: "running" | "stopped";
  novnc_port: number;
  startup_url: string | null;
  persistent_profile: 0 | 1;
  volume_name: string | null;
  proxy_json: string | null;
  created_at: string;
  updated_at: string;
};

export class BrowserRepository {
  private db: Database.Database;

  constructor(databasePath: string) {
    fs.mkdirSync(path.dirname(databasePath), { recursive: true });
    this.db = new Database(databasePath);
    this.db.pragma("journal_mode = WAL");
    this.db.exec(`
      create table if not exists browsers (
        id text primary key,
        name text not null,
        container_name text not null unique,
        container_id text,
        status text not null,
        desired_status text not null,
        novnc_port integer not null unique,
        startup_url text,
        persistent_profile integer not null,
        volume_name text,
        proxy_json text,
        created_at text not null,
        updated_at text not null
      );
    `);
  }

  list(): BrowserRecord[] {
    const rows = this.db.prepare("select * from browsers order by created_at desc").all() as Row[];
    return rows.map((row) => this.fromRow(row));
  }

  get(id: string): BrowserRecord | undefined {
    const row = this.db.prepare("select * from browsers where id = ?").get(id) as Row | undefined;
    return row ? this.fromRow(row) : undefined;
  }

  create(input: Omit<BrowserRecord, "remoteUrl">): BrowserRecord {
    this.db
      .prepare(
        `insert into browsers (
          id, name, container_name, container_id, status, desired_status, novnc_port,
          startup_url, persistent_profile, volume_name, proxy_json, created_at, updated_at
        ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        input.id,
        input.name,
        input.containerName,
        input.containerId ?? null,
        input.status,
        input.desiredStatus,
        input.noVncPort,
        input.startupUrl ?? null,
        input.persistentProfile ? 1 : 0,
        input.volumeName ?? null,
        input.proxy ? JSON.stringify(input.proxy) : null,
        input.createdAt,
        input.updatedAt
      );
    return this.get(input.id)!;
  }

  update(id: string, patch: Partial<Omit<BrowserRecord, "id" | "remoteUrl" | "createdAt">>): BrowserRecord {
    const current = this.get(id);
    if (!current) throw new Error("Browser not found");
    const next = { ...current, ...patch, updatedAt: new Date().toISOString() };
    this.db
      .prepare(
        `update browsers set
          name = ?, container_name = ?, container_id = ?, status = ?, desired_status = ?,
          novnc_port = ?, startup_url = ?, persistent_profile = ?, volume_name = ?,
          proxy_json = ?, updated_at = ?
        where id = ?`
      )
      .run(
        next.name,
        next.containerName,
        next.containerId ?? null,
        next.status,
        next.desiredStatus,
        next.noVncPort,
        next.startupUrl ?? null,
        next.persistentProfile ? 1 : 0,
        next.volumeName ?? null,
        next.proxy ? JSON.stringify(next.proxy) : null,
        next.updatedAt,
        id
      );
    return this.get(id)!;
  }

  delete(id: string): void {
    this.db.prepare("delete from browsers where id = ?").run(id);
  }

  usedPorts(): Set<number> {
    const rows = this.db.prepare("select novnc_port from browsers").all() as { novnc_port: number }[];
    return new Set(rows.map((row) => row.novnc_port));
  }

  private fromRow(row: Row): BrowserRecord {
    const proxy = row.proxy_json ? (JSON.parse(row.proxy_json) as BrowserProxy) : undefined;
    return {
      id: row.id,
      name: row.name,
      containerName: row.container_name,
      containerId: row.container_id ?? undefined,
      status: row.status,
      desiredStatus: row.desired_status,
      noVncPort: row.novnc_port,
      startupUrl: row.startup_url ?? undefined,
      persistentProfile: Boolean(row.persistent_profile),
      volumeName: row.volume_name ?? undefined,
      proxy,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      remoteUrl: `/remote/${row.id}/vnc.html?autoconnect=1&resize=remote&path=${encodeURIComponent(`remote/${row.id}/websockify`)}`
    };
  }
}
