import React, { useCallback, useEffect, useState } from 'react';
import {
  Save,
  Image as ImageIcon,
  Palette,
  Globe,
  Settings as SettingsIcon,
  ShieldCheck,
  UploadCloud,
  RefreshCw,
  Mail,
  Type,
  Lock,
  CheckCircle2,
  AlertTriangle,
  Eye,
} from 'lucide-react';
import { useApp } from '../../context/AppContext';
import DashboardLayout from '../../components/DashboardLayout';
import {
  SectionCard,
  Spinner,
  inputClass,
  labelClass,
  primaryBtn,
  ghostBtn,
  formatDate,
} from '../../components/Common';

const PRESETS = [
  { name: 'Violet Nebula', primary: '#8b5cf6', secondary: '#06b6d4' },
  { name: 'Sunset Aurora', primary: '#f97316', secondary: '#ec4899' },
  { name: 'Emerald Pulse', primary: '#10b981', secondary: '#06b6d4' },
  { name: 'Royal Indigo', primary: '#6366f1', secondary: '#a855f7' },
  { name: 'Crimson Heat', primary: '#e11d48', secondary: '#f59e0b' },
  { name: 'Ocean Deep', primary: '#0ea5e9', secondary: '#22d3ee' },
];

export default function PlatformSettings() {
  const { authFetch, notify, settings, setSettings, refreshBootstrap, user } = useApp();
  const [form, setForm] = useState(settings);
  const [logoFile, setLogoFile] = useState(null);
  const [logoPreview, setLogoPreview] = useState(settings.logo_url);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await authFetch('/api/admin/settings');
      const json = await res.json();
      if (res.ok && json.settings) {
        setForm(json.settings);
        setLogoPreview(json.settings.logo_url);
      }
    } catch (err) {
      /* fall back to context settings */
    } finally {
      setLoading(false);
    }
  }, [authFetch]);

  useEffect(() => {
    load();
  }, [load]);

  const save = async (e) => {
    e?.preventDefault();
    setSaving(true);
    try {
      const fd = new FormData();
      Object.entries(form).forEach(([k, v]) => {
        if (v !== undefined && v !== null) fd.append(k, String(v));
      });
      if (logoFile) fd.append('logo', logoFile);

      const res = await authFetch('/api/admin/settings', { method: 'PUT', body: fd });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Failed to save settings');
      setSettings(json.settings);
      setForm(json.settings);
      setLogoFile(null);
      notify(json.message, 'success');
      await refreshBootstrap();
    } catch (err) {
      notify(err.message, 'error');
    } finally {
      setSaving(false);
    }
  };

  const applyPreset = (p) => {
    setForm({ ...form, primary_color: p.primary, secondary_color: p.secondary });
  };

  return (
    <DashboardLayout
      variant="admin"
      title="Platform Settings"
      subtitle="Website branding, identity, and moderation configuration"
      actions={
        <button onClick={load} className="p-2.5 rounded-xl border border-slate-200 dark:border-white/10 hover:bg-slate-100 dark:hover:bg-white/10" aria-label="Reload settings">
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
        </button>
      }
    >
      <form onSubmit={save} className="grid lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 space-y-4">
          {/* Identity */}
          <SectionCard title="Website Identity" subtitle="Name, tagline, and description shown across the platform">
            <div className="p-4 grid sm:grid-cols-2 gap-3.5">
              <div>
                <label className={labelClass}><span className="inline-flex items-center gap-1"><Type className="w-3 h-3" /> Website Name *</span></label>
                <input value={form.site_name || ''} onChange={(e) => setForm({ ...form, site_name: e.target.value })} className={inputClass} required />
              </div>
              <div>
                <label className={labelClass}>Accent Badge Text</label>
                <input value={form.accent_badge_text || ''} onChange={(e) => setForm({ ...form, accent_badge_text: e.target.value })} className={inputClass} />
              </div>
              <div className="sm:col-span-2">
                <label className={labelClass}>Tagline</label>
                <input value={form.site_tagline || ''} onChange={(e) => setForm({ ...form, site_tagline: e.target.value })} className={inputClass} />
              </div>
              <div className="sm:col-span-2">
                <label className={labelClass}>Website Description</label>
                <textarea rows={3} value={form.site_description || ''} onChange={(e) => setForm({ ...form, site_description: e.target.value })} className={inputClass} />
              </div>
              <div>
                <label className={labelClass}><span className="inline-flex items-center gap-1"><Mail className="w-3 h-3" /> Contact Email</span></label>
                <input type="email" value={form.contact_email || ''} onChange={(e) => setForm({ ...form, contact_email: e.target.value })} className={inputClass} />
              </div>
              <div>
                <label className={labelClass}>Footer Text</label>
                <input value={form.footer_text || ''} onChange={(e) => setForm({ ...form, footer_text: e.target.value })} className={inputClass} />
              </div>
            </div>
          </SectionCard>

          {/* Logo */}
          <SectionCard title="Logo & Branding" subtitle="Upload a custom logo or reference a hosted URL">
            <div className="p-4 flex flex-col sm:flex-row gap-4 items-start">
              <label className="cursor-pointer shrink-0 group relative">
                <img
                  src={logoPreview || '/uploads/branding/zk-logo.svg'}
                  alt="Logo preview"
                  className="w-24 h-24 rounded-2xl object-cover border border-slate-200 dark:border-white/15 bg-white"
                />
                <span className="absolute inset-0 rounded-2xl bg-black/50 grid place-items-center opacity-0 group-hover:opacity-100 transition-opacity">
                  <UploadCloud className="w-5 h-5 text-white" />
                </span>
                <input
                  type="file"
                  accept="image/*,.svg"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (!f) return;
                    if (!/^image\//.test(f.type) && !/\.svg$/i.test(f.name)) {
                      notify('Logo must be a PNG, JPG, WEBP, or SVG image.', 'error');
                      return;
                    }
                    setLogoFile(f);
                    setLogoPreview(URL.createObjectURL(f));
                  }}
                />
              </label>
              <div className="flex-1 space-y-2 w-full">
                <div>
                  <label className={labelClass}>Logo URL</label>
                  <input
                    value={form.logo_url || ''}
                    onChange={(e) => {
                      setForm({ ...form, logo_url: e.target.value });
                      setLogoPreview(e.target.value);
                      setLogoFile(null);
                    }}
                    placeholder="/uploads/branding/zk-logo.svg or https://…"
                    className={inputClass}
                  />
                </div>
                <p className="text-[11px] text-slate-500 leading-relaxed">
                  {logoFile
                    ? `New file selected: ${logoFile.name} — it will be uploaded on save.`
                    : 'Recommended: square 512×512 SVG/PNG with transparent background.'}
                </p>
                {logoFile && (
                  <button
                    type="button"
                    onClick={() => {
                      setLogoFile(null);
                      setLogoPreview(form.logo_url);
                    }}
                    className="text-[11px] font-bold text-rose-500 hover:underline"
                  >
                    Discard new logo
                  </button>
                )}
              </div>
            </div>
          </SectionCard>

          {/* Colors */}
          <SectionCard title="Brand Colors" subtitle="Applied to gradients, buttons, and accents platform-wide">
            <div className="p-4 space-y-4">
              <div className="grid sm:grid-cols-2 gap-3.5">
                <div>
                  <label className={labelClass}><span className="inline-flex items-center gap-1"><Palette className="w-3 h-3" /> Primary Color</span></label>
                  <div className="flex gap-2">
                    <input type="color" value={form.primary_color || '#8b5cf6'} onChange={(e) => setForm({ ...form, primary_color: e.target.value })} className="w-12 h-10 rounded-lg border border-slate-200 dark:border-white/10 bg-transparent cursor-pointer" />
                    <input value={form.primary_color || ''} onChange={(e) => setForm({ ...form, primary_color: e.target.value })} className={`${inputClass} font-mono`} />
                  </div>
                </div>
                <div>
                  <label className={labelClass}>Secondary Color</label>
                  <div className="flex gap-2">
                    <input type="color" value={form.secondary_color || '#06b6d4'} onChange={(e) => setForm({ ...form, secondary_color: e.target.value })} className="w-12 h-10 rounded-lg border border-slate-200 dark:border-white/10 bg-transparent cursor-pointer" />
                    <input value={form.secondary_color || ''} onChange={(e) => setForm({ ...form, secondary_color: e.target.value })} className={`${inputClass} font-mono`} />
                  </div>
                </div>
              </div>

              <div>
                <label className={labelClass}>Curated Palettes</label>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {PRESETS.map((p) => (
                    <button
                      key={p.name}
                      type="button"
                      onClick={() => applyPreset(p)}
                      className="flex items-center gap-2 p-2 rounded-xl border border-slate-200 dark:border-white/10 hover:bg-slate-50 dark:hover:bg-white/5 transition-colors text-left"
                    >
                      <span className="w-7 h-7 rounded-lg shrink-0" style={{ background: `linear-gradient(135deg, ${p.primary}, ${p.secondary})` }} />
                      <span className="text-[11px] font-extrabold truncate">{p.name}</span>
                    </button>
                  ))}
                </div>
              </div>

              <div className="rounded-xl p-4 text-white" style={{ background: `linear-gradient(120deg, ${form.primary_color || '#8b5cf6'}, ${form.secondary_color || '#06b6d4'})` }}>
                <p className="text-[10px] font-extrabold uppercase tracking-widest opacity-80">Live Preview</p>
                <p className="text-lg font-black mt-0.5">{form.site_name || 'ZK-SONG'}</p>
                <p className="text-[11px] opacity-90">{form.site_tagline}</p>
              </div>
            </div>
          </SectionCard>

          {/* Platform config */}
          <SectionCard title="Platform Configuration" subtitle="Moderation and registration rules">
            <div className="p-4 space-y-3">
              <div className="flex items-center justify-between gap-3 p-3 rounded-xl border border-slate-200 dark:border-white/10">
                <div>
                  <p className="text-sm font-extrabold flex items-center gap-1.5"><ShieldCheck className="w-4 h-4 text-amber-500" /> Require Admin Moderation</p>
                  <p className="text-[11px] text-slate-500 mt-0.5">New uploads stay pending until an admin approves them.</p>
                </div>
                <button
                  type="button"
                  onClick={() => setForm({ ...form, require_moderation: form.require_moderation === 'true' ? 'false' : 'true' })}
                  className={`relative w-12 h-6 rounded-full shrink-0 transition-colors ${form.require_moderation === 'true' ? 'bg-emerald-500' : 'bg-slate-300 dark:bg-white/15'}`}
                  aria-label="Toggle moderation"
                >
                  <span className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-all ${form.require_moderation === 'true' ? 'left-6' : 'left-0.5'}`} />
                </button>
              </div>

              <div className="flex items-center justify-between gap-3 p-3 rounded-xl border border-slate-200 dark:border-white/10">
                <div>
                  <p className="text-sm font-extrabold flex items-center gap-1.5"><Lock className="w-4 h-4 text-violet-500" /> Allow New Registrations</p>
                  <p className="text-[11px] text-slate-500 mt-0.5">When disabled, only existing artists can sign in.</p>
                </div>
                <button
                  type="button"
                  onClick={() => setForm({ ...form, allow_registration: form.allow_registration === 'true' ? 'false' : 'true' })}
                  className={`relative w-12 h-6 rounded-full shrink-0 transition-colors ${form.allow_registration === 'true' ? 'bg-emerald-500' : 'bg-slate-300 dark:bg-white/15'}`}
                  aria-label="Toggle registration"
                >
                  <span className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-all ${form.allow_registration === 'true' ? 'left-6' : 'left-0.5'}`} />
                </button>
              </div>

              <div>
                <label className={labelClass}>Max Upload Size (MB)</label>
                <input
                  type="number"
                  min="1"
                  max="500"
                  value={form.max_upload_mb || '100'}
                  onChange={(e) => setForm({ ...form, max_upload_mb: e.target.value })}
                  className={inputClass}
                />
              </div>
            </div>
          </SectionCard>
        </div>

        <div className="space-y-4">
          <SectionCard title="Save Changes">
            <div className="p-4 space-y-3">
              <p className="text-[11px] text-slate-500 leading-relaxed">
                Branding updates apply instantly across the public landing page, User Panel, Admin
                Panel, and all external API responses.
              </p>
              <button type="submit" disabled={saving} className={`${primaryBtn} w-full`}>
                {saving ? <Spinner label="Saving…" /> : <><Save className="w-4 h-4" /> Save All Settings</>}
              </button>
              <button
                type="button"
                onClick={() => {
                  setForm(settings);
                  setLogoPreview(settings.logo_url);
                  setLogoFile(null);
                  notify('Reverted unsaved changes.', 'info');
                }}
                className={`${ghostBtn} w-full`}
              >
                Reset to Saved
              </button>
            </div>
          </SectionCard>

          <SectionCard title="Live Branding Preview">
            <div className="p-4">
              <div className="rounded-xl border border-slate-200 dark:border-white/10 p-3 flex items-center gap-2.5">
                <img src={logoPreview || '/uploads/branding/zk-logo.svg'} alt="logo" className="w-9 h-9 rounded-lg object-cover" />
                <div className="min-w-0">
                  <p className="font-black text-sm truncate">{form.site_name || 'ZK-SONG'}</p>
                  <p className="text-[10px] text-slate-500 truncate">{form.accent_badge_text}</p>
                </div>
              </div>
              <button
                type="button"
                className="mt-3 w-full py-2.5 rounded-xl text-white text-xs font-extrabold"
                style={{ background: `linear-gradient(120deg, ${form.primary_color || '#8b5cf6'}, ${form.secondary_color || '#06b6d4'})` }}
              >
                Sample Primary Button
              </button>
              <div className="mt-2 flex gap-2">
                <span className="h-8 flex-1 rounded-lg" style={{ backgroundColor: `${form.primary_color}22`, border: `1px solid ${form.primary_color}55` }} />
                <span className="h-8 flex-1 rounded-lg" style={{ backgroundColor: `${form.secondary_color}22`, border: `1px solid ${form.secondary_color}55` }} />
              </div>
            </div>
          </SectionCard>

          <SectionCard title="Current Administrator">
            <div className="p-4 flex items-center gap-3">
              <img src={user?.avatar_url || '/uploads/avatars/avatar-admin.svg'} alt={user?.name} className="w-10 h-10 rounded-xl object-cover border border-slate-200 dark:border-white/15" />
              <div className="min-w-0">
                <p className="font-extrabold text-sm truncate">{user?.name}</p>
                <p className="text-[11px] text-slate-500 truncate">{user?.email}</p>
              </div>
            </div>
          </SectionCard>

          <div className="rounded-2xl border border-amber-500/30 bg-amber-500/5 p-4">
            <p className="flex items-center gap-1.5 text-xs font-extrabold text-amber-700 dark:text-amber-300">
              <AlertTriangle className="w-3.5 h-3.5" /> Heads up
            </p>
            <p className="text-[11px] text-slate-600 dark:text-slate-400 mt-1.5 leading-relaxed">
              Disabling moderation auto-publishes every new upload immediately. Use only when you
              fully trust your artist roster.
            </p>
          </div>
        </div>
      </form>
    </DashboardLayout>
  );
}
