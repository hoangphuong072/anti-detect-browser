import React, { useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import { Copy, Edit3, Monitor, Play, Plus, Power, RefreshCw, Square, Trash2, Wifi } from "lucide-react";
import type { BrowserProxy, BrowserRecord, ProxyScheme, ProxyTestResult } from "../../shared/types";
import "./styles.css";

type FormState = {
  name: string;
  startupUrl: string;
  persistentProfile: boolean;
  useProxy: boolean;
  proxy: BrowserProxy;
};

const emptyProxy: BrowserProxy = { scheme: "http", host: "", port: 8080 };

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) }
  });
  if (!response.ok) {
    const body = await response.json().catch(() => ({ error: response.statusText }));
    throw new Error(body.error ?? "Request failed");
  }
  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}

function App() {
  const [browsers, setBrowsers] = useState<BrowserRecord[]>([]);
  const [selected, setSelected] = useState<BrowserRecord | null>(null);
  const [editing, setEditing] = useState<BrowserRecord | null>(null);
  const [editForm, setEditForm] = useState<FormState | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [proxyResult, setProxyResult] = useState<ProxyTestResult | null>(null);
  const [form, setForm] = useState<FormState>({
    name: "",
    startupUrl: "",
    persistentProfile: true,
    useProxy: false,
    proxy: emptyProxy
  });

  const runningCount = useMemo(() => browsers.filter((browser) => browser.status === "running").length, [browsers]);
  const integrationBase = window.location.origin;
  const hermesIntegrationUrl = `${integrationBase}/api/integration/hermes`;

  async function load() {
    setError(null);
    setBrowsers(await api<BrowserRecord[]>("/api/browsers"));
  }

  async function runAction(label: string, action: () => Promise<void>) {
    setBusy(label);
    setError(null);
    try {
      await action();
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(null);
    }
  }

  useEffect(() => {
    void load();
    const timer = window.setInterval(() => void load(), 5000);
    return () => window.clearInterval(timer);
  }, []);

  async function createBrowser(event: React.FormEvent) {
    event.preventDefault();
    await runAction("create", async () => {
      await api<BrowserRecord>("/api/browsers", {
        method: "POST",
        body: JSON.stringify({
          name: form.name,
          startupUrl: form.startupUrl || undefined,
          persistentProfile: form.persistentProfile,
          proxy: form.useProxy ? form.proxy : undefined
        })
      });
      setForm({ name: "", startupUrl: "", persistentProfile: true, useProxy: false, proxy: emptyProxy });
    });
  }

  async function testProxy(browser: BrowserRecord) {
    await runAction(`test-${browser.id}`, async () => {
      const result = await api<ProxyTestResult>(`/api/browsers/${browser.id}/proxy/test`, { method: "POST", body: JSON.stringify({}) });
      setProxyResult(result);
    });
  }

  function openEdit(browser: BrowserRecord) {
    const proxy = browser.proxy ? { ...browser.proxy, password: browser.proxy.password === "********" ? "" : browser.proxy.password } : emptyProxy;
    setEditing(browser);
    setEditForm({
      name: browser.name,
      startupUrl: browser.startupUrl ?? "",
      persistentProfile: browser.persistentProfile,
      useProxy: Boolean(browser.proxy),
      proxy
    });
  }

  async function saveEdit(event: React.FormEvent) {
    event.preventDefault();
    if (!editing || !editForm) return;
    await runAction(`edit-${editing.id}`, async () => {
      await api<BrowserRecord>(`/api/browsers/${editing.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          name: editForm.name,
          startupUrl: editForm.startupUrl || undefined,
          proxy: editForm.useProxy ? editForm.proxy : null
        })
      });
      setEditing(null);
      setEditForm(null);
    });
  }

  async function clearBrowserData(browser: BrowserRecord) {
    const confirmed = window.confirm(`Clear all data for "${browser.name}"? This removes cookies, cache, and the saved profile volume.`);
    if (!confirmed) return;
    await runAction(`clear-${browser.id}`, async () => {
      await api(`/api/browsers/${browser.id}/clear-data`, { method: "POST" });
      setEditing(null);
      setEditForm(null);
    });
  }

  return (
    <main>
      <header className="topbar">
        <div>
          <h1>Antidetect Browser Manager</h1>
          <p>{browsers.length} browsers · {runningCount} running</p>
        </div>
        <button className="iconText" onClick={() => void load()} disabled={Boolean(busy)}>
          <RefreshCw size={17} /> Refresh
        </button>
      </header>

      {error && <div className="alert">{error}</div>}
      {proxyResult && (
        <div className={proxyResult.ok ? "notice" : "alert"}>
          Proxy test: {proxyResult.ok ? `OK · ${proxyResult.ip ?? "unknown IP"}` : proxyResult.error}
        </div>
      )}

      <section className="integrationPanel">
        <div>
          <strong>Hermes integration</strong>
          <code>{hermesIntegrationUrl}</code>
        </div>
        <button onClick={() => void navigator.clipboard.writeText(hermesIntegrationUrl)}>
          <Copy size={16} /> Copy
        </button>
      </section>

      <section className="layout">
        <form className="panel" onSubmit={(event) => void createBrowser(event)}>
          <h2><Plus size={18} /> New browser</h2>
          <label>
            Name
            <input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} required />
          </label>
          <label>
            Startup URL
            <input
              value={form.startupUrl}
              onChange={(event) => setForm({ ...form, startupUrl: event.target.value })}
              placeholder="https://example.com"
            />
          </label>
          <label className="check">
            <input
              type="checkbox"
              checked={form.persistentProfile}
              onChange={(event) => setForm({ ...form, persistentProfile: event.target.checked })}
            />
            Persistent profile
          </label>
          <label className="check">
            <input type="checkbox" checked={form.useProxy} onChange={(event) => setForm({ ...form, useProxy: event.target.checked })} />
            Use proxy
          </label>
          {form.useProxy && (
            <div className="proxyGrid">
              <select
                value={form.proxy.scheme}
                onChange={(event) => setForm({ ...form, proxy: { ...form.proxy, scheme: event.target.value as ProxyScheme } })}
              >
                <option value="http">http</option>
                <option value="https">https</option>
                <option value="socks4">socks4</option>
                <option value="socks5">socks5</option>
              </select>
              <input placeholder="host" value={form.proxy.host} onChange={(event) => setForm({ ...form, proxy: { ...form.proxy, host: event.target.value } })} />
              <input
                type="number"
                placeholder="port"
                value={form.proxy.port}
                onChange={(event) => setForm({ ...form, proxy: { ...form.proxy, port: Number(event.target.value) } })}
              />
              <input
                placeholder="username"
                value={form.proxy.username ?? ""}
                onChange={(event) => setForm({ ...form, proxy: { ...form.proxy, username: event.target.value || undefined } })}
              />
              <input
                type="password"
                placeholder="password"
                value={form.proxy.password ?? ""}
                onChange={(event) => setForm({ ...form, proxy: { ...form.proxy, password: event.target.value || undefined } })}
              />
            </div>
          )}
          <button className="primary" disabled={busy === "create"}>
            <Plus size={17} /> Create
          </button>
        </form>

        <section className="tableWrap">
          <table>
            <thead>
              <tr>
                <th>Name</th>
                <th>Status</th>
                <th>Profile</th>
                <th>Proxy</th>
                <th>noVNC</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {browsers.map((browser) => (
                <tr key={browser.id}>
                  <td>
                    <strong>{browser.name}</strong>
                    <span>{browser.containerName}</span>
                  </td>
                  <td><span className={`status ${browser.status}`}>{browser.status}</span></td>
                  <td>{browser.persistentProfile ? "Persistent" : "Ephemeral"}</td>
                  <td>{browser.proxy ? `${browser.proxy.scheme}://${browser.proxy.host}:${browser.proxy.port}` : "None"}</td>
                  <td>{browser.noVncPort}</td>
                  <td className="actions">
                    <button title="Start" onClick={() => void runAction(`start-${browser.id}`, () => api(`/api/browsers/${browser.id}/start`, { method: "POST" }))}>
                      <Play size={16} />
                    </button>
                    <button title="Stop" onClick={() => void runAction(`stop-${browser.id}`, () => api(`/api/browsers/${browser.id}/stop`, { method: "POST" }))}>
                      <Square size={16} />
                    </button>
                    <button title="Remote" onClick={() => setSelected(browser)} disabled={browser.status !== "running"}>
                      <Monitor size={16} />
                    </button>
                    <button title="Edit" onClick={() => openEdit(browser)}>
                      <Edit3 size={16} />
                    </button>
                    <button title="Test proxy" onClick={() => void testProxy(browser)} disabled={!browser.proxy}>
                      <Wifi size={16} />
                    </button>
                    <button
                      title="Delete"
                      onClick={() =>
                        void runAction(`delete-${browser.id}`, () =>
                          api(`/api/browsers/${browser.id}?deleteVolume=${browser.persistentProfile}`, { method: "DELETE" })
                        )
                      }
                    >
                      <Trash2 size={16} />
                    </button>
                  </td>
                </tr>
              ))}
              {!browsers.length && (
                <tr>
                  <td colSpan={6} className="empty">No browsers yet.</td>
                </tr>
              )}
            </tbody>
          </table>
        </section>
      </section>

      {selected && (
        <div className="remote">
          <div className="remoteBar">
            <strong>{selected.name}</strong>
            <button onClick={() => setSelected(null)}><Power size={16} /> Close</button>
          </div>
          <iframe title={`Remote ${selected.name}`} src={selected.remoteUrl} />
        </div>
      )}

      {editing && editForm && (
        <div className="modalBackdrop">
          <form className="editDialog" onSubmit={(event) => void saveEdit(event)}>
            <div className="dialogHeader">
              <h2><Edit3 size={18} /> Edit browser</h2>
              <button type="button" onClick={() => { setEditing(null); setEditForm(null); }}>
                <Power size={16} /> Close
              </button>
            </div>
            <label>
              Name
              <input value={editForm.name} onChange={(event) => setEditForm({ ...editForm, name: event.target.value })} required />
            </label>
            <label>
              Startup URL
              <input
                value={editForm.startupUrl}
                onChange={(event) => setEditForm({ ...editForm, startupUrl: event.target.value })}
                placeholder="https://example.com"
              />
            </label>
            <label className="check">
              <input type="checkbox" checked={editForm.useProxy} onChange={(event) => setEditForm({ ...editForm, useProxy: event.target.checked })} />
              Use proxy
            </label>
            {editForm.useProxy && (
              <div className="proxyGrid">
                <select
                  value={editForm.proxy.scheme}
                  onChange={(event) => setEditForm({ ...editForm, proxy: { ...editForm.proxy, scheme: event.target.value as ProxyScheme } })}
                >
                  <option value="http">http</option>
                  <option value="https">https</option>
                  <option value="socks4">socks4</option>
                  <option value="socks5">socks5</option>
                </select>
                <input
                  placeholder="host"
                  value={editForm.proxy.host}
                  onChange={(event) => setEditForm({ ...editForm, proxy: { ...editForm.proxy, host: event.target.value } })}
                />
                <input
                  type="number"
                  placeholder="port"
                  value={editForm.proxy.port}
                  onChange={(event) => setEditForm({ ...editForm, proxy: { ...editForm.proxy, port: Number(event.target.value) } })}
                />
                <input
                  placeholder="username"
                  value={editForm.proxy.username ?? ""}
                  onChange={(event) => setEditForm({ ...editForm, proxy: { ...editForm.proxy, username: event.target.value || undefined } })}
                />
                <input
                  type="password"
                  placeholder="password"
                  value={editForm.proxy.password ?? ""}
                  onChange={(event) => setEditForm({ ...editForm, proxy: { ...editForm.proxy, password: event.target.value || undefined } })}
                />
              </div>
            )}
            <div className="dialogActions">
              <button type="button" className="danger" onClick={() => void clearBrowserData(editing)}>
                <Trash2 size={16} /> Clear data
              </button>
              <button className="primary" disabled={busy === `edit-${editing.id}`}>
                <Edit3 size={16} /> Save
              </button>
            </div>
          </form>
        </div>
      )}
    </main>
  );
}

createRoot(document.getElementById("root")!).render(<App />);
