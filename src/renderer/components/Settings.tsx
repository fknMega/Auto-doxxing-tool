import React, { useEffect, useRef, useState } from "react";
import { useStore } from "../state/store";
import { SENSITIVE_SUMMARY, type ModuleConfig, type ModuleSecret, type ModuleHeader, type ThemePref, type AccessLevel } from "../../shared/types";
import { IPlus, ITrash, IEdit, IClose, ISearch, IKey, IDiscord, IHeart } from "./icons";
import { ModulesPane as ModulesPaneList } from "./ModulesPane";


const MODELS = [
  { id: "claude-opus-5", name: "Opus 5 — most capable" },
  { id: "claude-sonnet-5", name: "Sonnet 5 — balanced" },
  { id: "claude-haiku-4-5-20251001", name: "Haiku 4.5 — fastest" },
];
// The stored values are the SDK's; the labels are sentence case for the pane.
const EFFORTS = [
  { value: "low", label: "Low" },
  { value: "medium", label: "Medium" },
  { value: "high", label: "High" },
  { value: "xhigh", label: "Very high" },
  { value: "max", label: "Max" },
] as const;
const TABS = ["General", "Model", "Modules", "About"] as const;
type Tab = (typeof TABS)[number];

/** The three access levels, in increasing order of what Aether can do without
 *  being asked. `ask` is the default: capable, but nothing happens behind you. */
const ACCESS: { value: AccessLevel; label: string; headline: string; blurb: string }[] = [
  {
    value: "safe", label: "Safe",
    headline: "Collection only",
    blurb: "Search, recon and the graph. No shell, no file writes, no installing.",
  },
  {
    value: "ask", label: "Ask",
    headline: "Asks before it acts",
    blurb: "Aether can request the shell, a URL, or installing a tool. You approve each one.",
  },
  {
    value: "full", label: "Full",
    headline: "No prompts",
    blurb: "Everything Safe withholds is simply allowed. Aether reads untrusted pages — choose this deliberately.",
  },
];

const THEMES: { value: ThemePref; label: string }[] = [
  { value: "system", label: "System" },
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
];

/** The switch. Its state is the knob's position and the track's fill, so it
 *  carries no text — role="switch" + aria-checked is what announces it. */
function Switch({ on, label, onToggle }: { on: boolean; label: string; onToggle: () => void }) {
  return (
    <button
      className={`switch${on ? " on" : ""}`}
      role="switch"
      aria-checked={on}
      aria-label={label}
      onClick={onToggle}
    />
  );
}

/** Dev-only (browser preview): let ?tab=Modules open a pane directly, so the
 *  screenshot script can reach one without clicking. Same guard convention as
 *  the __selectNode hook in GraphView. */
function initialTab(): Tab {
  if (!(window as unknown as { __aetherMock?: boolean }).__aetherMock) return "General";
  const t = new URLSearchParams(location.search).get("tab");
  return (TABS as readonly string[]).includes(t ?? "") ? (t as Tab) : "General";
}

export function Settings() {
  const settings = useStore((s) => s.settings);
  const [tab, setTab] = useState<Tab>(initialTab);
  if (!settings) return null;

  return (
    <div className="pane-scroll">
      <div className="pane">
        <h1>Settings</h1>
        <p className="sub">How Aether signs in, which model it runs, and what it can reach for.</p>
        <div className="tabs" role="tablist" aria-label="Settings sections">
          {TABS.map((t) => (
            <button key={t} id={`tab-${t}`} role="tab" aria-selected={tab === t} aria-controls="settings-panel"
              className={tab === t ? "on" : ""} onClick={() => setTab(t)}>
              {t}
            </button>
          ))}
        </div>
        <div id="settings-panel" role="tabpanel" aria-labelledby={`tab-${tab}`}>
          {tab === "General" && <GeneralPane />}
          {tab === "Model" && <ModelPane />}
          {tab === "Modules" && <ModulesPane />}
          {tab === "About" && <AboutPane />}
        </div>
      </div>
    </div>
  );
}

function GeneralPane() {
  const settings = useStore((s) => s.settings)!;
  const save = useStore((s) => s.saveSettings);
  const auth = useStore((s) => s.auth);
  const refreshAuth = useStore((s) => s.refreshAuth);
  const [loginMsg, setLoginMsg] = useState<string | null>(null);
  const mounted = useRef(true);
  useEffect(() => () => { mounted.current = false; }, []);

  const signIn = async () => {
    const r = await window.aether.authLogin();
    if (mounted.current) setLoginMsg(r.message);
    // The CLI login lands out-of-band, so poll for it rather than asking the
    // operator to come back and press Recheck.
    for (let i = 0; i < 30; i++) {
      await new Promise((res) => setTimeout(res, 2000));
      if (!mounted.current) return;
      await refreshAuth();
      if (useStore.getState().auth?.loggedIn) { if (mounted.current) setLoginMsg("Signed in."); break; }
    }
  };

  const theme = settings.theme ?? "system";
  const access: AccessLevel = settings.access ?? "ask";

  return (
    <>
      <div className="field">
        <span className="flabel">Claude account</span>
        <div className="desc">Aether drives Claude through the Agent SDK using your subscription — sign in once.</div>
        <div className="slab">
          <span className={`dot-status ${auth?.loggedIn ? "ok" : "bad"}`} />
          <div className="grow">
            <div className="t">{auth?.loggedIn ? "Signed in" : "Not signed in"}</div>
            <div className="s">{loginMsg ?? auth?.detail ?? (auth?.authMethod ? `via ${auth.authMethod}` : "Run npm run login, or sign in here.")}</div>
          </div>
          {!auth?.loggedIn && <button className="btn primary" onClick={signIn}>Sign in</button>}
          {auth?.loggedIn && <button className="btn ghost" onClick={() => void refreshAuth()}>Recheck</button>}
        </div>
      </div>

      <div className="field">
        <span className="flabel">Appearance</span>
        <div className="desc">Follow the system setting, or pick one.</div>
        <div className="seg-pick" role="group" aria-label="Appearance">
          {THEMES.map((t) => (
            <button key={t.value} className={theme === t.value ? "on" : ""} aria-pressed={theme === t.value} onClick={() => void save({ theme: t.value })}>
              {t.label}
            </button>
          ))}
        </div>
      </div>

      <div className="field">
        <label htmlFor="owner-name">Your name</label>
        <div className="desc">What Aether calls you.</div>
        <input id="owner-name" type="text" defaultValue={settings.ownerName} onBlur={(e) => void save({ ownerName: e.target.value.trim() || "friend" })} />
      </div>

      <div className="field">
        <span className="flabel">Voice</span>
        <div className="desc">Changes Aether's tone and nothing else — every boundary holds either way.</div>
        <div className="seg-pick" role="group" aria-label="Voice">
          <button className={settings.personaVoice === "flirty" ? "on" : ""} aria-pressed={settings.personaVoice === "flirty"} onClick={() => void save({ personaVoice: "flirty" })}>Casual</button>
          <button className={settings.personaVoice === "professional" ? "on" : ""} aria-pressed={settings.personaVoice === "professional"} onClick={() => void save({ personaVoice: "professional" })}>Professional</button>
        </div>
      </div>

      <div className="field">
        <span className="flabel">Access</span>
        <div className="desc">
          What Aether may do on this machine. Whatever you pick, commands run in an OS sandbox, reads cannot
          leave its workspace, and your credentials stay off-limits — these levels decide what it can reach for,
          not whether the boundary holds.
        </div>
        <div className="seg-pick" role="group" aria-label="Access level">
          {ACCESS.map((a) => (
            <button
              key={a.value}
              className={access === a.value ? "on" : ""}
              aria-pressed={access === a.value}
              onClick={() => void save({ access: a.value })}
            >
              {a.label}
            </button>
          ))}
        </div>
        <div className="slab" style={{ marginTop: "var(--sp-3)" }}>
          <div className="grow">
            <div className="t">{ACCESS.find((a) => a.value === access)?.headline}</div>
            <div className="s">{ACCESS.find((a) => a.value === access)?.blurb}</div>
          </div>
        </div>
      </div>
    </>
  );
}

function ModelPane() {
  const settings = useStore((s) => s.settings)!;
  const save = useStore((s) => s.saveSettings);
  const status = useStore((s) => s.providerStatus);
  const refreshStatus = useStore((s) => s.refreshProviderStatus);
  const setProviderKey = useStore((s) => s.setProviderKey);
  const providerLogin = useStore((s) => s.providerLogin);
  const providerLogout = useStore((s) => s.providerLogout);
  const [key, setKey] = useState("");
  const [geminiBusy, setGeminiBusy] = useState(false);
  const [geminiMsg, setGeminiMsg] = useState<string | null>(null);
  const provider = settings.provider ?? "claude";

  const signInGemini = async () => {
    setGeminiBusy(true);
    setGeminiMsg("Opening your browser to sign in to Google…");
    try {
      const r = await providerLogin("gemini");
      setGeminiMsg(r.message);
    } finally {
      setGeminiBusy(false);
    }
  };

  const pick = async (p: typeof provider) => { await save({ provider: p }); void refreshStatus(); };

  return (
    <>
      <div className="field">
        <span className="flabel">Provider</span>
        <div className="desc">Which model runs the investigation. Claude uses your subscription through the Agent SDK. ChatGPT and Ollama talk to any OpenAI-compatible endpoint, and get the same tools and graph.</div>
        <div className="seg-pick" role="group" aria-label="Provider">
          <button className={provider === "claude" ? "on" : ""} aria-pressed={provider === "claude"} onClick={() => void pick("claude")}>Claude</button>
          <button className={provider === "openai" ? "on" : ""} aria-pressed={provider === "openai"} onClick={() => void pick("openai")}>ChatGPT</button>
          <button className={provider === "gemini" ? "on" : ""} aria-pressed={provider === "gemini"} onClick={() => void pick("gemini")}>Gemini</button>
          <button className={provider === "ollama" ? "on" : ""} aria-pressed={provider === "ollama"} onClick={() => void pick("ollama")}>Ollama</button>
        </div>
      </div>

      {provider === "claude" && (
        <>
          <div className="field">
            <label htmlFor="claude-model">Model</label>
            <div className="desc">Which Claude model runs the investigation.</div>
            <select id="claude-model" defaultValue={settings.model} onChange={(e) => void save({ model: e.target.value })}>
              {MODELS.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
            </select>
          </div>
          <div className="field">
            <span className="flabel">Reasoning effort</span>
            <div className="desc">Higher digs deeper on hard cases; lower is snappier and cheaper.</div>
            <div className="seg-pick" role="group" aria-label="Reasoning effort">
              {EFFORTS.map((e) => (
                <button key={e.value} className={settings.effort === e.value ? "on" : ""} aria-pressed={settings.effort === e.value} onClick={() => void save({ effort: e.value })}>{e.label}</button>
              ))}
            </div>
          </div>
        </>
      )}

      {provider === "openai" && (
        <>
          <div className="field">
            <label htmlFor="openai-key">OpenAI API key</label>
            <div className="desc">
              OpenAI has no sign-in for API access, so Aether connects with a key. It is stored encrypted on this
              machine (OS keychain) and never shown again or sent to the renderer.
            </div>
            <div className="row-inline">
              <input id="openai-key" type="password" placeholder={status?.hasKey ? "Stored — type to replace" : "sk-..."} value={key} onChange={(e) => setKey(e.target.value)} />
              <button className="btn primary" disabled={!key.trim()} onClick={async () => { await setProviderKey("openai", key.trim()); setKey(""); }}>Connect</button>
            </div>
            {status?.hasKey && <div className="desc ok tight">Connected.</div>}
            <div className="row-inline">
              <button className="btn link" onClick={() => window.open("https://platform.openai.com/api-keys")}>Get an API key</button>
              {status?.hasKey && <button className="btn link" onClick={() => void setProviderKey("openai", "")}>Disconnect</button>}
            </div>
          </div>
          <div className="field">
            <label htmlFor="openai-model">Model</label>
            <input id="openai-model" type="text" defaultValue={settings.openaiModel} onBlur={(e) => void save({ openaiModel: e.target.value.trim() })} placeholder="gpt-4o" />
          </div>
          <div className="field">
            <label htmlFor="openai-url">Base URL</label>
            <div className="desc">Point this at any OpenAI-compatible gateway (Azure, OpenRouter, a proxy) if you are not using OpenAI directly.</div>
            <input id="openai-url" type="text" defaultValue={settings.openaiBaseUrl} onBlur={(e) => void save({ openaiBaseUrl: e.target.value.trim() })} placeholder="https://api.openai.com/v1" />
          </div>
        </>
      )}

      {provider === "gemini" && (
        <>
          <div className="field">
            <span className="flabel">Google account</span>
            <div className="desc">
              Sign in with your Google account to use Gemini free through Google's Code Assist — no API key. The
              sign-in opens in your browser; the token is stored encrypted on this machine and never shown to the
              renderer.
            </div>
            <div className="slab">
              <span className={`dot-status ${status?.hasKey ? "ok" : "bad"}`} />
              <div className="grow">
                <div className="t">{status?.hasKey ? "Signed in" : "Not signed in"}</div>
                <div className="s">{geminiMsg ?? status?.detail ?? "Sign in with your Google account to use Gemini free."}</div>
              </div>
              {!status?.hasKey && <button className="btn primary" disabled={geminiBusy} onClick={() => void signInGemini()}>{geminiBusy ? "Signing in…" : "Sign in with Google"}</button>}
              {status?.hasKey && <button className="btn ghost" onClick={async () => { await providerLogout("gemini"); setGeminiMsg(null); }}>Sign out</button>}
            </div>
          </div>
          <div className="field">
            <label htmlFor="gemini-model">Model</label>
            <div className="desc">gemini-2.5-pro is the most capable; flash is faster. Tool calling drives the graph on all of them.</div>
            <select id="gemini-model" defaultValue={settings.geminiModel} onChange={(e) => void save({ geminiModel: e.target.value })}>
              {["gemini-2.5-pro", "gemini-2.5-flash", "gemini-2.5-flash-lite"].map((m) => <option key={m} value={m}>{m}</option>)}
            </select>
          </div>
        </>
      )}

      {provider === "ollama" && (
        <>
          <div className="field">
            <label htmlFor="ollama-model">Local model</label>
            <div className="desc">
              Runs entirely on your machine. Tool calling needs a tool-capable model (llama3.1, qwen2.5, mistral-nemo);
              models without tool support will still chat but cannot drive the graph.
            </div>
            {status?.models?.length ? (
              <select id="ollama-model" defaultValue={settings.ollamaModel} onChange={(e) => void save({ ollamaModel: e.target.value })}>
                {status.models.map((m) => <option key={m} value={m}>{m}</option>)}
              </select>
            ) : (
              <input id="ollama-model" type="text" defaultValue={settings.ollamaModel} onBlur={(e) => void save({ ollamaModel: e.target.value.trim() })} placeholder="llama3.1" />
            )}
            {status?.detail && <div className="desc bad tight">{status.detail}</div>}
          </div>
          <div className="field">
            <label htmlFor="ollama-url">Base URL</label>
            <div className="row-inline">
              <input id="ollama-url" type="text" defaultValue={settings.ollamaBaseUrl} onBlur={(e) => void save({ ollamaBaseUrl: e.target.value.trim() })} placeholder="http://localhost:11434/v1" />
              <button className="btn ghost" onClick={() => void refreshStatus()}>Re-scan</button>
            </div>
          </div>
        </>
      )}
    </>
  );
}

function ModulesPane() {
  const [editing, setEditing] = useState<ModuleConfig | null>(null);
  return (
    <>
      <ModulesPaneList onEdit={setEditing} onAdd={() => setEditing(newModule())} />
      {editing && <ModuleEditor initial={editing} onClose={() => setEditing(null)} />}
    </>
  );
}

function newModule(): ModuleConfig {
  return { id: "", name: "", description: "", kind: "command", enabled: true, builtin: false, method: "GET", inputLabel: "", command: "", url: "", headers: [], body: "", secrets: [] };
}

function ModuleEditor({ initial, onClose }: { initial: ModuleConfig; onClose: () => void }) {
  const saveModule = useStore((s) => s.saveModule);
  const [m, setM] = useState<ModuleConfig>({ ...initial, headers: initial.headers ?? [], secrets: initial.secrets ?? [] });
  const [busy, setBusy] = useState(false);
  const set = (patch: Partial<ModuleConfig>) => setM((prev) => ({ ...prev, ...patch }));
  const isHttp = m.kind === "http";

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const setSecret = (i: number, patch: Partial<ModuleSecret>) =>
    set({ secrets: (m.secrets ?? []).map((s, j) => (j === i ? { ...s, ...patch } : s)) });
  const setHeader = (i: number, patch: Partial<ModuleHeader>) =>
    set({ headers: (m.headers ?? []).map((h, j) => (j === i ? { ...h, ...patch } : h)) });

  const save = async () => {
    if (!m.name.trim() || !m.description.trim()) return;
    setBusy(true);
    try {
      await saveModule(m);
      onClose();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="scrim" onClick={onClose}>
      <div className="modal" role="dialog" aria-modal="true" aria-label={initial.id ? "Edit module" : "New module"} onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h2>{initial.id ? "Edit module" : "New module"}</h2>
          <button className="icon-btn" aria-label="Close" onClick={onClose}><IClose size={16} /></button>
        </div>
        <div className="modal-body">
          <div className="field">
            <label className="flabel" htmlFor="mod-name">Name</label>
            <input id="mod-name" type="text" placeholder="nesher" value={m.name} onChange={(e) => set({ name: e.target.value })} />
          </div>
          <div className="field">
            <label className="flabel" htmlFor="mod-desc">When should Aether use this?</label>
            <div className="desc tight">This becomes the tool's description — say what it does and when to reach for it.</div>
            <textarea id="mod-desc" className="ctl" rows={2} placeholder="Search breach corpora for an email or username and return matching records." value={m.description} onChange={(e) => set({ description: e.target.value })} />
          </div>
          <div className="field">
            <span className="flabel">Type</span>
            <div className="seg-pick" role="group" aria-label="Type">
              <button className={!isHttp ? "on" : ""} aria-pressed={!isHttp} onClick={() => set({ kind: "command" })}>Local command</button>
              <button className={isHttp ? "on" : ""} aria-pressed={isHttp} onClick={() => set({ kind: "http" })}>API (HTTP)</button>
            </div>
          </div>
          <div className="field">
            <label className="flabel" htmlFor="mod-input">What does Aether pass as input?</label>
            <div className="desc tight">The one free-form argument Aether fills, substituted as <code>{"{input}"}</code>.</div>
            <input id="mod-input" type="text" placeholder="an email, username, or domain" value={m.inputLabel ?? ""} onChange={(e) => set({ inputLabel: e.target.value })} />
          </div>

          {!isHttp ? (
            <div className="field">
              <label className="flabel" htmlFor="mod-cmd">Command</label>
              <div className="desc tight">Runs in Aether's workspace. Withheld at Safe access; at Ask you approve each run. Use <code>{"{input}"}</code> (safely quoted) or the <code>$AETHER_INPUT</code> env var. Secrets below are exported as env vars.</div>
              <textarea id="mod-cmd" className="ctl" rows={2} placeholder="nesher --json {input}" value={m.command ?? ""} onChange={(e) => set({ command: e.target.value })} />
            </div>
          ) : (
            <>
              <div className="field">
                <span className="flabel">Method</span>
                <div className="seg-pick" role="group" aria-label="Method">
                  <button className={m.method !== "POST" ? "on" : ""} aria-pressed={m.method !== "POST"} onClick={() => set({ method: "GET" })}>GET</button>
                  <button className={m.method === "POST" ? "on" : ""} aria-pressed={m.method === "POST"} onClick={() => set({ method: "POST" })}>POST</button>
                </div>
              </div>
              <div className="field">
                <label className="flabel" htmlFor="mod-url">URL</label>
                <div className="desc tight">Use <code>{"{input}"}</code> (URL-encoded) and <code>{"{{KEY}}"}</code> to inject a secret below.</div>
                <input id="mod-url" type="text" placeholder="https://api.example.com/search?q={input}" value={m.url ?? ""} onChange={(e) => set({ url: e.target.value })} />
              </div>
              <div className="field">
                <span className="flabel">Headers</span>
                {(m.headers ?? []).map((h, i) => (
                  <div className="row-inline" key={i}>
                    <input type="text" aria-label="Header name" placeholder="Authorization" value={h.name} onChange={(e) => setHeader(i, { name: e.target.value })} />
                    <input type="text" aria-label="Header value" placeholder="Bearer {{API_KEY}}" value={h.value} onChange={(e) => setHeader(i, { value: e.target.value })} />
                    <button className="mini-btn danger" aria-label="Remove header" onClick={() => set({ headers: (m.headers ?? []).filter((_, j) => j !== i) })}><IClose size={12} /></button>
                  </div>
                ))}
                <button className="add-row" onClick={() => set({ headers: [...(m.headers ?? []), { name: "", value: "" }] })}><IPlus size={12} />Add header</button>
              </div>
              {m.method === "POST" && (
                <div className="field">
                  <label className="flabel" htmlFor="mod-body">Body</label>
                  <textarea id="mod-body" className="ctl" rows={2} placeholder={'{"query": "{input}"}'} value={m.body ?? ""} onChange={(e) => set({ body: e.target.value })} />
                </div>
              )}
            </>
          )}

          <div className="field">
            <span className="flabel">Keys and secrets</span>
            <div className="desc tight">Stored encrypted on this machine and never shown again. Reference them by name: <code>{"{{NAME}}"}</code> in a URL, header or body, or as an env var in a command.</div>
            {(m.secrets ?? []).map((s, i) => (
              <div className="row-inline" key={i}>
                <input type="text" aria-label="Key name" placeholder="API_KEY" value={s.name} onChange={(e) => setSecret(i, { name: e.target.value })} />
                <input type="password" aria-label="Key value" placeholder={s.set ? "Stored — leave blank to keep" : "value"} value={s.value ?? ""} onChange={(e) => setSecret(i, { value: e.target.value, set: false })} />
                <button className="mini-btn danger" aria-label="Remove key" onClick={() => set({ secrets: (m.secrets ?? []).filter((_, j) => j !== i) })}><IClose size={12} /></button>
              </div>
            ))}
            <button className="add-row" onClick={() => set({ secrets: [...(m.secrets ?? []), { name: "", set: false, value: "" }] })}><IPlus size={12} />Add key</button>
          </div>
        </div>
        <div className="modal-foot">
          <div className="note">{isHttp ? "Runs at every access level." : "Runs the shell — needs Ask or Full access."}</div>
          <span className="spacer" />
          <button className="btn ghost" onClick={onClose}>Cancel</button>
          <button className="btn primary" disabled={busy || !m.name.trim() || !m.description.trim()} onClick={save}>{busy ? "Saving…" : "Save module"}</button>
        </div>
      </div>
    </div>
  );
}

const UPDATE_LABEL: Record<string, string> = {
  disabled: "Updates run on an installed build",
  idle: "Ready to check",
  checking: "Checking for updates…",
  "not-available": "You are on the latest version",
  available: "Update found",
  downloading: "Downloading update…",
  downloaded: "Update ready to install",
  error: "Could not check for updates",
};

function UpdatesCard() {
  const status = useStore((s) => s.updateStatus);
  const check = useStore((s) => s.checkForUpdate);
  const install = useStore((s) => s.installUpdate);
  const refresh = useStore((s) => s.refreshUpdateStatus);
  const save = useStore((s) => s.saveSettings);
  const autoUpdate = useStore((s) => s.settings?.autoUpdate ?? true);
  useEffect(() => { void refresh(); }, []);

  const state = status?.state ?? "idle";
  const dot = state === "downloaded" || state === "available" ? " ok" : state === "error" ? " bad" : "";
  const line = state === "downloading" && status?.percent != null
    ? `Downloading update… ${status.percent}%`
    : (status?.message || UPDATE_LABEL[state] || "");

  return (
    <div className="field">
      <span className="flabel">Updates</span>
      <div className="desc">Aether updates itself from GitHub Releases. New builds download in the background and install on restart.</div>
      <div className="slab">
        <span className={`dot-status${dot}`} />
        <div className="grow">
          <div className="t">Version {status?.currentVersion ?? ""}{status?.newVersion && state !== "not-available" ? ` to ${status.newVersion}` : ""}</div>
          <div className="s">{line}</div>
        </div>
        {state === "downloaded"
          ? <button className="btn primary" onClick={() => void install()}>Restart and install</button>
          : <button className="btn ghost" disabled={state === "checking" || state === "downloading" || state === "disabled"} onClick={() => void check()}>{state === "checking" ? "Checking…" : "Check now"}</button>}
      </div>
      <div className="slab">
        <div className="grow">
          <div className="t">Check automatically on launch</div>
        </div>
        <Switch on={autoUpdate} label="Check for updates automatically" onToggle={() => void save({ autoUpdate: !autoUpdate })} />
      </div>
    </div>
  );
}

function AboutPane() {
  return (
    <>
      <UpdatesCard />
      <div className="field">
        <span className="flabel">Aether</span>
        <div className="desc">A desktop agent that works a live knowledge graph — OSINT and authorized security research, driven by Claude, ChatGPT, Gemini, or a local model.</div>
        <div className="row-inline">
          <button className="btn ghost" onClick={() => window.open("https://discord.gg/zjawxkDZVP")}><IDiscord size={13} /> Discord</button>
          <button className="btn ghost" onClick={() => window.open("https://github.com/sponsors/fknMega")}><IHeart size={13} /> Sponsor</button>
        </div>
      </div>
      <div className="field">
        <span className="flabel">Security</span>
        <div className="desc">
          Command execution runs in an OS sandbox (Seatbelt on macOS, Bubblewrap on Linux). File reads cannot
          leave Aether's workspace in any mode. These stay off-limits at every access level:
        </div>
        <div className="mod-list">
          {SENSITIVE_SUMMARY.map((line) => (
            <div className="row sm" key={line}><span className="lbl">{line}</span></div>
          ))}
        </div>
        <div className="desc">
          Aether reads content written by the people it investigates, so prompt injection is a real risk, not a
          theoretical one — the sandbox exists because the system prompt alone is not enough. Custom command
          modules are a shell command you asked for, so only add ones you trust. Keys are encrypted at rest
          (OS keychain when available) and never sent to the renderer or to the model in plaintext.
        </div>
      </div>
    </>
  );
}
