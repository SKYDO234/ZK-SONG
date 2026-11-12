import React, { useCallback, useEffect, useState } from 'react';
import {
  KeyRound,
  Plus,
  Copy,
  Eye,
  EyeOff,
  Power,
  Trash2,
  Terminal,
  Send,
  RefreshCw,
  ShieldCheck,
  Activity,
  Clock3,
  Code2,
  CheckCircle2,
  XCircle,
  Layers,
} from 'lucide-react';
import { useApp } from '../../context/AppContext';
import DashboardLayout from '../../components/DashboardLayout';
import {
  StatCard,
  SectionCard,
  Modal,
  ConfirmDialog,
  Spinner,
  formatDate,
  formatNumber,
  inputClass,
  labelClass,
  primaryBtn,
  ghostBtn,
  EmptyState,
} from '../../components/Common';

const ENDPOINTS = [
  { method: 'GET', path: '/api/v1/songs', desc: 'List all approved songs with full metadata, thumbnail and audio URLs.' },
  { method: 'GET', path: '/api/v1/songs/:id', desc: 'Fetch a single approved song by its numeric ID.' },
  { method: 'GET', path: '/api/v1/artist-of-the-month', desc: 'Current month crown winner, leaderboard and their releases.' },
  { method: 'GET', path: '/api/v1/stream/:id', desc: 'Stream audio with HTTP 206 range support (seek-friendly).' },
];

export default function ApiKeyManagement() {
  const { authFetch, notify } = useApp();
  const [keys, setKeys] = useState([]);
  const [loading, setLoading] = useState(true);
  const [revealed, setRevealed] = useState({});
  const [busyId, setBusyId] = useState(null);

  const [createOpen, setCreateOpen] = useState(false);
  const [newKeyName, setNewKeyName] = useState('');
  const [newPermissions, setNewPermissions] = useState('read:songs,stream:audio,read:artists');
  const [creating, setCreating] = useState(false);
  const [createdKey, setCreatedKey] = useState(null);

  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleting, setDeleting] = useState(false);

  // Sandbox
  const [sandboxKey, setSandboxKey] = useState('');
  const [endpoint, setEndpoint] = useState('/api/v1/songs');
  const [sandboxLoading, setSandboxLoading] = useState(false);
  const [sandboxResult, setSandboxResult] = useState(null);
  const [sandboxTab, setSandboxTab] = useState('json');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await authFetch('/api/admin/api-keys');
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Failed to load API keys');
      setKeys(json.api_keys || []);
    } catch (err) {
      notify(err.message, 'error');
    } finally {
      setLoading(false);
    }
  }, [authFetch, notify]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!sandboxKey) {
      const firstActive = keys.find((k) => k.status === 'active');
      setSandboxKey(firstActive?.api_key || '');
    }
  }, [keys, sandboxKey]);

  const createKey = async (e) => {
    e.preventDefault();
    if (!newKeyName.trim()) return;
    setCreating(true);
    try {
      const res = await authFetch('/api/admin/api-keys', {
        method: 'POST',
        body: JSON.stringify({ name: newKeyName, permissions: newPermissions }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Failed to generate key');
      setCreatedKey(json.api_key);
      notify(json.message, 'success');
      setNewKeyName('');
      setCreateOpen(false);
      load();
    } catch (err) {
      notify(err.message, 'error');
    } finally {
      setCreating(false);
    }
  };

  const toggleKey = async (k) => {
    setBusyId(k.id);
    try {
      const res = await authFetch(`/api/admin/api-keys/${k.id}/toggle`, { method: 'PUT' });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Toggle failed');
      notify(json.message, 'success');
      load();
    } catch (err) {
      notify(err.message, 'error');
    } finally {
      setBusyId(null);
    }
  };

  const deleteKey = async () => {
    setDeleting(true);
    try {
      const res = await authFetch(`/api/admin/api-keys/${deleteTarget.id}`, { method: 'DELETE' });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Delete failed');
      notify(json.message, 'success');
      setDeleteTarget(null);
      load();
    } catch (err) {
      notify(err.message, 'error');
    } finally {
      setDeleting(false);
    }
  };

  const copy = (text, label = 'Copied') => {
    navigator.clipboard?.writeText(text);
    notify(`${label} to clipboard.`, 'info');
  };

  const runSandbox = async () => {
    if (!sandboxKey) {
      notify('Select or paste an active API key first.', 'error');
      return;
    }
    setSandboxLoading(true);
    setSandboxResult(null);
    const started = performance.now();
    try {
      const sep = endpoint.includes('?') ? '&' : '?';
      const res = await fetch(`${endpoint}${sep}api_key=${encodeURIComponent(sandboxKey)}`);
      const ms = Math.round(performance.now() - started);
      const text = await res.text();
      let parsed;
      try {
        parsed = JSON.parse(text);
      } catch (err) {
        parsed = { raw: text };
      }
      setSandboxResult({ status: res.status, ok: res.ok, ms, body: parsed });
    } catch (err) {
      setSandboxResult({ status: 0, ok: false, ms: Math.round(performance.now() - started), body: { error: err.message } });
    } finally {
      setSandboxLoading(false);
    }
  };

  const activeKeys = keys.filter((k) => k.status === 'active');
  const totalRequests = keys.reduce((a, k) => a + (k.requests_count || 0), 0);

  const curlSnippet = `curl -H "X-API-Key: ${sandboxKey || 'YOUR_API_KEY'}" \\
  ${window.location.origin}/api/v1/songs?limit=10`;

  return (
    <DashboardLayout
      variant="admin"
      title="API Key Management"
      subtitle="Issue secure credentials for external music applications"
      actions={
        <button onClick={() => setCreateOpen(true)} className={`${primaryBtn} hidden sm:inline-flex`}>
          <Plus className="w-4 h-4" /> Generate Key
        </button>
      }
    >
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4 stagger">
        <StatCard label="Total Keys" value={keys.length} icon={KeyRound} tone="violet" loading={loading} />
        <StatCard label="Active Keys" value={activeKeys.length} icon={ShieldCheck} tone="emerald" />
        <StatCard label="Revoked Keys" value={keys.length - activeKeys.length} icon={XCircle} tone="rose" />
        <StatCard label="API Requests Served" value={formatNumber(totalRequests)} icon={Activity} tone="cyan" />
      </div>

      <div className="grid lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 space-y-4">
          <SectionCard
            title="Issued API Keys"
            subtitle="External applications authenticate with the X-API-Key header"
            action={
              <button onClick={() => setCreateOpen(true)} className={`${primaryBtn} !py-2 !text-xs sm:hidden`}>
                <Plus className="w-3.5 h-3.5" /> New
              </button>
            }
          >
            {loading ? (
              <div className="p-4 space-y-2">
                {[1, 2].map((i) => <div key={i} className="h-28 rounded-2xl skeleton" />)}
              </div>
            ) : keys.length === 0 ? (
              <EmptyState
                icon={KeyRound}
                title="No API keys yet"
                description="Generate your first secure key so external Spotify-like apps can consume the approved songs catalogue."
                action={
                  <button onClick={() => setCreateOpen(true)} className={primaryBtn}>
                    <Plus className="w-4 h-4" /> Generate API Key
                  </button>
                }
              />
            ) : (
              <div className="p-3 sm:p-4 space-y-2.5 stagger">
                {keys.map((k) => {
                  const isRevealed = revealed[k.id];
                  return (
                    <div
                      key={k.id}
                      className={`rounded-2xl border p-3.5 ${
                        k.status === 'active'
                          ? 'border-slate-200 dark:border-white/10 bg-white dark:bg-slate-900/60'
                          : 'border-rose-500/25 bg-rose-500/5'
                      }`}
                    >
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="font-extrabold text-sm truncate flex items-center gap-1.5">
                            {k.name}
                            <span
                              className={`px-1.5 py-0.5 rounded text-[9px] font-black uppercase border ${
                                k.status === 'active'
                                  ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-300 border-emerald-500/30'
                                  : 'bg-rose-500/15 text-rose-600 dark:text-rose-300 border-rose-500/30'
                              }`}
                            >
                              {k.status}
                            </span>
                          </p>
                          <p className="text-[10px] text-slate-400 font-mono mt-0.5">ID #{k.id}</p>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <button
                            onClick={() => toggleKey(k)}
                            disabled={busyId === k.id}
                            className={`px-2.5 py-1.5 rounded-lg border text-[10px] font-extrabold inline-flex items-center gap-1 disabled:opacity-40 ${
                              k.status === 'active'
                                ? 'border-amber-500/40 text-amber-600 dark:text-amber-300 hover:bg-amber-500/10'
                                : 'border-emerald-500/40 text-emerald-600 dark:text-emerald-300 hover:bg-emerald-500/10'
                            }`}
                          >
                            <Power className="w-3 h-3" /> {k.status === 'active' ? 'Revoke' : 'Activate'}
                          </button>
                          <button
                            onClick={() => setDeleteTarget(k)}
                            className="p-1.5 rounded-lg border border-rose-500/40 text-rose-500 hover:bg-rose-500/10"
                            title="Delete key"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>

                      <div className="mt-2.5 flex items-center gap-2 rounded-xl bg-slate-100 dark:bg-slate-950 border border-slate-200 dark:border-white/10 px-3 py-2">
                        <Code2 className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                        <code className="text-[11px] font-mono font-bold flex-1 truncate">
                          {isRevealed ? k.api_key : `${k.api_key.slice(0, 12)}${'•'.repeat(18)}${k.api_key.slice(-4)}`}
                        </code>
                        <button onClick={() => setRevealed({ ...revealed, [k.id]: !isRevealed })} className="p-1 text-slate-400 hover:text-violet-500" title={isRevealed ? 'Hide key' : 'Reveal key'}>
                          {isRevealed ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                        </button>
                        <button onClick={() => copy(k.api_key, 'API key')} className="p-1 text-slate-400 hover:text-violet-500" title="Copy key">
                          <Copy className="w-3.5 h-3.5" />
                        </button>
                      </div>

                      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-2 text-[10px] text-slate-500">
                        <span className="inline-flex items-center gap-1"><Layers className="w-3 h-3" /> {k.permissions}</span>
                        <span className="inline-flex items-center gap-1"><Activity className="w-3 h-3" /> {formatNumber(k.requests_count)} requests</span>
                        <span className="inline-flex items-center gap-1"><Clock3 className="w-3 h-3" /> Created {formatDate(k.created_at)}</span>
                        {k.last_used_at && <span>Last used {formatDate(k.last_used_at, true)}</span>}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </SectionCard>

          {/* Request playground */}
          <SectionCard title="API Request Playground" subtitle="Execute real authenticated requests against the public REST API">
            <div className="p-4 space-y-3">
              <div className="grid sm:grid-cols-2 gap-2.5">
                <div>
                  <label className={labelClass}>API Key</label>
                  <select value={sandboxKey} onChange={(e) => setSandboxKey(e.target.value)} className={inputClass}>
                    <option value="">— select key —</option>
                    {keys.map((k) => (
                      <option key={k.id} value={k.api_key}>
                        {k.name} ({k.status})
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className={labelClass}>Endpoint</label>
                  <select value={endpoint} onChange={(e) => setEndpoint(e.target.value)} className={inputClass}>
                    {ENDPOINTS.map((e) => (
                      <option key={e.path} value={e.path.replace(':id', '1')}>
                        GET {e.path.replace(':id', '1')}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                <button onClick={runSandbox} disabled={sandboxLoading} className={primaryBtn}>
                  {sandboxLoading ? <Spinner label="Requesting…" /> : <><Send className="w-4 h-4" /> Send Request</>}
                </button>
                <button onClick={() => copy(curlSnippet, 'cURL command')} className={ghostBtn}>
                  <Terminal className="w-4 h-4" /> Copy cURL
                </button>
              </div>

              <pre className="text-[10px] font-mono p-3 rounded-xl bg-slate-950 text-slate-300 overflow-x-auto border border-white/10">
{curlSnippet}
              </pre>

              {sandboxResult && (
                <div className="rounded-xl border border-slate-200 dark:border-white/10 overflow-hidden">
                  <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 bg-slate-100 dark:bg-white/5 border-b border-slate-200 dark:border-white/10">
                    <div className="flex items-center gap-2 text-[11px] font-extrabold">
                      <span className={`px-1.5 py-0.5 rounded ${sandboxResult.ok ? 'bg-emerald-500/20 text-emerald-600 dark:text-emerald-300' : 'bg-rose-500/20 text-rose-600 dark:text-rose-300'}`}>
                        {sandboxResult.status || 'ERR'}
                      </span>
                      <span className="text-slate-500">{sandboxResult.ms} ms</span>
                    </div>
                    <div className="flex gap-1">
                      {['json', 'headers'].map((t) => (
                        <button
                          key={t}
                          onClick={() => setSandboxTab(t)}
                          className={`px-2 py-1 rounded text-[10px] font-extrabold uppercase ${sandboxTab === t ? 'bg-violet-600 text-white' : 'text-slate-500 hover:bg-slate-200 dark:hover:bg-white/10'}`}
                        >
                          {t}
                        </button>
                      ))}
                      <button onClick={() => copy(JSON.stringify(sandboxResult.body, null, 2), 'Response JSON')} className="px-2 py-1 rounded text-[10px] font-extrabold text-slate-500 hover:bg-slate-200 dark:hover:bg-white/10">
                        COPY
                      </button>
                    </div>
                  </div>
                  <pre className="text-[10px] font-mono p-3 bg-slate-950 text-emerald-300 max-h-72 overflow-auto">
{sandboxTab === 'json'
  ? JSON.stringify(sandboxResult.body, null, 2)
  : JSON.stringify(
      {
        'content-type': 'application/json',
        'x-powered-by': 'ZK-SONG-Engine/2.6',
        'x-authenticated-client': keys.find((k) => k.api_key === sandboxKey)?.name || 'unauthenticated',
      },
      null,
      2
    )}
                  </pre>
                </div>
              )}
            </div>
          </SectionCard>
        </div>

        <div className="space-y-4">
          <SectionCard title="API Reference" subtitle="v1 endpoints available to key holders">
            <div className="divide-y divide-slate-100 dark:divide-white/5">
              {ENDPOINTS.map((e) => (
                <div key={e.path} className="p-3.5">
                  <p className="text-[11px] font-mono font-extrabold">
                    <span className="px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-600 dark:text-emerald-300 text-[9px] mr-1.5">{e.method}</span>
                    {e.path}
                  </p>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1 leading-relaxed">{e.desc}</p>
                </div>
              ))}
            </div>
          </SectionCard>

          <SectionCard title="Authentication" subtitle="Supported key transports">
            <div className="p-4 space-y-2.5 text-[11px]">
              <div className="rounded-xl bg-slate-100 dark:bg-slate-950 p-3 font-mono">
                <p className="text-[9px] uppercase font-extrabold tracking-wider text-slate-400 mb-1">Header (recommended)</p>
                X-API-Key: zks_live_…
              </div>
              <div className="rounded-xl bg-slate-100 dark:bg-slate-950 p-3 font-mono">
                <p className="text-[9px] uppercase font-extrabold tracking-wider text-slate-400 mb-1">Bearer Token</p>
                Authorization: Bearer zks_live_…
              </div>
              <div className="rounded-xl bg-slate-100 dark:bg-slate-950 p-3 font-mono">
                <p className="text-[9px] uppercase font-extrabold tracking-wider text-slate-400 mb-1">Query String</p>
                ?api_key=zks_live_…
              </div>
              <p className="text-slate-500 leading-relaxed">
                Revoked keys return <span className="font-mono font-bold">403 REVOKED_API_KEY</span>.
                Invalid keys return <span className="font-mono font-bold">401 INVALID_API_KEY</span>.
              </p>
            </div>
          </SectionCard>

          {createdKey && (
            <div className="rounded-2xl border border-emerald-500/40 bg-emerald-500/10 p-4 animate-scale-in">
              <p className="flex items-center gap-1.5 text-xs font-extrabold text-emerald-700 dark:text-emerald-300">
                <CheckCircle2 className="w-4 h-4" /> New key created
              </p>
              <p className="text-[11px] text-slate-600 dark:text-slate-300 mt-1">
                Copy it now — you can reveal it later from the key list.
              </p>
              <code className="block mt-2 p-2.5 rounded-lg bg-slate-950 text-emerald-300 text-[10px] font-mono break-all">
                {createdKey.api_key}
              </code>
              <div className="flex gap-2 mt-2">
                <button onClick={() => copy(createdKey.api_key, 'API key')} className={`${primaryBtn} !py-2 !text-xs flex-1`}>
                  <Copy className="w-3.5 h-3.5" /> Copy
                </button>
                <button onClick={() => setCreatedKey(null)} className={`${ghostBtn} !py-2 !text-xs`}>
                  Dismiss
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      <Modal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        title="Generate Secure API Key"
        subtitle="Issue credentials for a new external streaming application"
        size="sm"
        footer={
          <>
            <button onClick={() => setCreateOpen(false)} className={ghostBtn}>Cancel</button>
            <button onClick={createKey} disabled={creating || !newKeyName.trim()} className={primaryBtn}>
              {creating ? <Spinner label="Generating…" /> : <><Plus className="w-4 h-4" /> Generate</>}
            </button>
          </>
        }
      >
        <form onSubmit={createKey} className="space-y-3.5">
          <div>
            <label className={labelClass}>Application / Client Name *</label>
            <input
              value={newKeyName}
              onChange={(e) => setNewKeyName(e.target.value)}
              placeholder="e.g. Spotify-Like iOS Player"
              className={inputClass}
              autoFocus
            />
          </div>
          <div>
            <label className={labelClass}>Permissions Scope</label>
            <select value={newPermissions} onChange={(e) => setNewPermissions(e.target.value)} className={inputClass}>
              <option value="read:songs,stream:audio,read:artists">Full read + streaming</option>
              <option value="read:songs">Read catalogue only</option>
              <option value="stream:audio">Streaming only</option>
              <option value="read:songs,stream:audio,read:artists,read:analytics">Full access + analytics</option>
            </select>
          </div>
          <p className="text-[11px] text-slate-500 leading-relaxed">
            Keys are generated with 144 bits of cryptographic entropy and prefixed with
            <span className="font-mono font-bold"> zks_live_</span>. Store them securely in your
            client&apos;s environment configuration.
          </p>
        </form>
      </Modal>

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        onClose={() => setDeleteTarget(null)}
        onConfirm={deleteKey}
        loading={deleting}
        title="Delete API key?"
        message={`"${deleteTarget?.name || ''}" will stop working immediately. Any application using this key will receive 401 INVALID_API_KEY responses.`}
        confirmLabel="Delete Key"
      />
    </DashboardLayout>
  );
}
