import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  Mail,
  Lock,
  User,
  Eye,
  EyeOff,
  ArrowLeft,
  ShieldCheck,
  Crown,
  Sparkles,
  KeyRound,
  CheckCircle2,
  Globe,
  Music,
  Sun,
  Moon,
  AlertCircle,
} from 'lucide-react';
import { mediaUrl } from '../lib/apiBase';
import { useApp } from '../context/AppContext';
import { readJson } from '../lib/http';

function AuthShell({ title, subtitle, children }) {
  const { settings, theme, toggleTheme } = useApp();
  return (
    <div className="min-h-screen flex flex-col justify-between bg-[#0a0a0b] text-neutral-100 relative overflow-hidden pb-24">
      <div className="pointer-events-none absolute -top-40 left-1/2 -translate-x-1/2 w-[34rem] h-[34rem] rounded-full bg-amber-400/[0.07] blur-[150px]" />
      <div className="pointer-events-none absolute bottom-0 right-0 w-[26rem] h-[26rem] rounded-full bg-white/[0.03] blur-[140px]" />
      <div className="pointer-events-none absolute inset-0 opacity-[0.25] bg-[radial-gradient(circle_at_1px_1px,rgba(255,255,255,0.16)_1px,transparent_0)] [background-size:26px_26px]" />

      <div className="max-w-7xl w-full mx-auto px-4 sm:px-6 py-6 flex items-center justify-between relative z-10">
        <Link
          to="/"
          className="inline-flex items-center gap-2.5 text-sm font-bold text-neutral-400 hover:text-amber-300 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Back to {settings.site_name}</span>
        </Link>

        <button
          onClick={toggleTheme}
          className="p-2.5 rounded-xl border border-white/10 bg-white/[0.04] hover:border-amber-300/40 transition-colors"
          title="Toggle Theme"
        >
          {theme === 'dark' ? <Sun className="w-4 h-4 text-amber-300" /> : <Moon className="w-4 h-4 text-neutral-300" />}
        </button>
      </div>

      <div className="w-full max-w-md mx-auto px-4 relative z-10 my-auto">
        <div className="card-3d rounded-3xl p-6 sm:p-8 space-y-6">
          <div className="text-center space-y-2">
            <Link to="/" className="inline-block">
              <img
                src={mediaUrl(settings.logo_url) || '/zk-logo.svg'}
                alt={settings.site_name}
                className="w-14 h-14 rounded-2xl mx-auto border border-amber-300/30 object-cover shadow-[0_10px_30px_-12px_rgba(251,191,36,0.55)]"
              />
            </Link>
            <h1 className="text-2xl font-black tracking-tight text-white">{title}</h1>
            <p className="text-xs sm:text-sm text-neutral-400">{subtitle}</p>
          </div>
          {children}
        </div>
      </div>

      <div className="text-center text-xs text-neutral-500 py-4 relative z-10 space-y-1">
        <p>{settings.footer_text}</p>
        <p className="text-[11px] font-extrabold tracking-[0.18em] uppercase text-gold">
          Website by ZK Studio
        </p>
        <p className="text-[11px] font-semibold text-neutral-400">
          CEO &amp; MD — Ziyan Hossain
        </p>
      </div>
    </div>
  );
}

export function LoginPage() {
  const { loginWithCredentials, settings } = useApp();
  const navigate = useNavigate();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const loggedInUser = await loginWithCredentials(email, password);
      if (loggedInUser.role === 'admin') {
        navigate('/admin/dashboard');
      } else {
        navigate('/user/dashboard');
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthShell
      title={`Sign in to ${settings.site_name}`}
      subtitle="Access your Artist Studio Panel or Administrator Command Center"
    >
      {error && (
        <div className="p-3.5 rounded-2xl bg-rose-500/10 border border-rose-500/30 text-rose-600 dark:text-rose-300 text-xs font-semibold flex items-start gap-2.5">
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-xs font-bold uppercase tracking-wider text-neutral-400 dark:text-neutral-400 mb-1.5">
            Email Address
          </label>
          <div className="relative">
            <Mail className="w-4 h-4 text-neutral-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              className="field w-full pl-10 pr-4 py-3 text-sm"
            />
          </div>
        </div>

        <div>
          <div className="flex items-center justify-between mb-1.5">
            <label className="text-xs font-bold uppercase tracking-wider text-neutral-400 dark:text-neutral-400">
              Password
            </label>
            <Link
              to="/forgot-password"
              className="text-xs font-bold text-amber-500 dark:text-amber-300 hover:underline"
            >
              Forgot Password?
            </Link>
          </div>
          <div className="relative">
            <Lock className="w-4 h-4 text-neutral-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type={showPass ? 'text' : 'password'}
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              className="field w-full pl-10 pr-10 py-3 text-sm"
            />
            <button
              type="button"
              onClick={() => setShowPass(!showPass)}
              className="absolute right-3.5 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-neutral-200"
            >
              {showPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>
        </div>

        <button
          type="submit"
          disabled={loading}
          className="w-full py-3.5 rounded-xl btn-gold font-extrabold text-sm transition-all disabled:opacity-50"
        >
          {loading ? 'Authenticating...' : 'Sign In'}
        </button>
      </form>

      <p className="text-center text-xs text-neutral-400">
        Don&apos;t have an artist account?{' '}
        <Link to="/register" className="font-bold text-amber-500 dark:text-amber-300 hover:underline">
          Create an Account
        </Link>
      </p>
    </AuthShell>
  );
}

export function RegisterPage() {
  const { registerAccount, settings } = useApp();
  const navigate = useNavigate();

  const [form, setForm] = useState({
    name: '',
    email: '',
    password: '',
    confirmPassword: '',
    primary_genre: 'Synthwave',
    country: 'United States',
    bio: '',
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    if (form.password !== form.confirmPassword) {
      setError('Passwords do not match.');
      return;
    }
    if (form.password.length < 6) {
      setError('Password must be at least 6 characters.');
      return;
    }
    setLoading(true);
    try {
      await registerAccount(form);
      navigate('/user/dashboard');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthShell
      title={`Join ${settings.site_name} Studio`}
      subtitle="Create your artist profile to upload tracks and compete for Artist of the Month"
    >
      {error && (
        <div className="p-3.5 rounded-2xl bg-rose-500/10 border border-rose-500/30 text-rose-600 dark:text-rose-300 text-xs font-semibold flex items-start gap-2.5">
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-3.5">
        <div>
          <label className="block text-xs font-bold uppercase tracking-wider text-neutral-400 dark:text-neutral-400 mb-1">
            Artist / Stage Name *
          </label>
          <div className="relative">
            <User className="w-4 h-4 text-neutral-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              required
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="e.g. Nova Synthesis"
              className="field w-full pl-10 pr-4 py-2.5 text-sm"
            />
          </div>
        </div>

        <div>
          <label className="block text-xs font-bold uppercase tracking-wider text-neutral-400 dark:text-neutral-400 mb-1">
            Email Address *
          </label>
          <div className="relative">
            <Mail className="w-4 h-4 text-neutral-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="email"
              required
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              placeholder="you@example.com"
              className="field w-full pl-10 pr-4 py-2.5 text-sm"
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-neutral-400 dark:text-neutral-400 mb-1">
              Primary Genre
            </label>
            <select
              value={form.primary_genre}
              onChange={(e) => setForm({ ...form, primary_genre: e.target.value })}
              className="field w-full px-3 py-2.5 text-sm"
            >
              {[
                'Synthwave',
                'Electronic',
                'Progressive House',
                'Pop',
                'Hip-Hop',
                'Lo-Fi Beats',
                'Rock',
                'Cinematic',
                'Dream Pop',
                'Ambient Bass',
              ].map((g) => (
                <option key={g} value={g}>
                  {g}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-neutral-400 dark:text-neutral-400 mb-1">
              Country
            </label>
            <input
              type="text"
              value={form.country}
              onChange={(e) => setForm({ ...form, country: e.target.value })}
              placeholder="United States"
              className="field w-full px-3 py-2.5 text-sm"
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-neutral-400 dark:text-neutral-400 mb-1">
              Password *
            </label>
            <input
              type="password"
              required
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
              placeholder="Min 6 chars"
              className="field w-full px-3.5 py-2.5 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-neutral-400 dark:text-neutral-400 mb-1">
              Confirm Password *
            </label>
            <input
              type="password"
              required
              value={form.confirmPassword}
              onChange={(e) => setForm({ ...form, confirmPassword: e.target.value })}
              placeholder="Repeat password"
              className="field w-full px-3.5 py-2.5 text-sm"
            />
          </div>
        </div>

        <div>
          <label className="block text-xs font-bold uppercase tracking-wider text-neutral-400 dark:text-neutral-400 mb-1">
            Short Artist Bio (Optional)
          </label>
          <textarea
            rows={2}
            value={form.bio}
            onChange={(e) => setForm({ ...form, bio: e.target.value })}
            placeholder="Tell listeners about your sound, instruments, and production style..."
            className="w-full px-3.5 py-2 rounded-xl bg-white/[0.04] dark:bg-[#070708] border border-white/10 dark:border-white/10 text-sm focus:outline-none focus:border-amber-400"
          />
        </div>

        <button
          type="submit"
          disabled={loading}
          className="w-full py-3.5 rounded-xl btn-gold font-extrabold text-sm transition-all disabled:opacity-50"
        >
          {loading ? 'Creating Studio Account...' : 'Create Artist Account'}
        </button>
      </form>

      <p className="text-center text-xs text-neutral-400">
        Already registered?{' '}
        <Link to="/login" className="font-bold text-amber-500 dark:text-amber-300 hover:underline">
          Sign In Here
        </Link>
      </p>
    </AuthShell>
  );
}

export function ForgotPasswordPage() {
  const { notify } = useApp();
  const navigate = useNavigate();

  const [step, setStep] = useState(1); // 1: Request Code, 2: Verify & Reset
  const [email, setEmail] = useState('');
  const [resetCode, setResetCode] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleRequestCode = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await fetch('/api/auth/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      const data = await readJson(res);
      if (!res.ok) throw new Error(data.error || 'Failed to generate reset code');
      setStep(2);
      notify(data.message, 'info');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleResetPassword = async (e) => {
    e.preventDefault();
    setError('');
    if (newPassword !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }
    setLoading(true);
    try {
      const res = await fetch('/api/auth/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email,
          reset_code: resetCode,
          new_password: newPassword,
        }),
      });
      const data = await readJson(res);
      if (!res.ok) throw new Error(data.error || 'Password reset failed');
      notify(data.message, 'success');
      navigate('/login');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthShell
      title="Reset Studio Password"
      subtitle={
        step === 1
          ? 'Enter your account email to receive a 6-digit security verification code'
          : `Enter the verification code sent to ${email} and choose a new password`
      }
    >
      {error && (
        <div className="p-3.5 rounded-2xl bg-rose-500/10 border border-rose-500/30 text-rose-600 dark:text-rose-300 text-xs font-semibold flex items-start gap-2.5">
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      {step === 1 ? (
        <form onSubmit={handleRequestCode} className="space-y-4">
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-neutral-400 dark:text-neutral-400 mb-1.5">
              Registered Email Address
            </label>
            <div className="relative">
              <Mail className="w-4 h-4 text-neutral-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                className="field w-full pl-10 pr-4 py-3 text-sm"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full py-3.5 rounded-xl btn-gold font-extrabold text-sm transition-all"
          >
            {loading ? 'Generating Security Code...' : 'Send Verification Code'}
          </button>
        </form>
      ) : (
        <form onSubmit={handleResetPassword} className="space-y-4">
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-neutral-400 dark:text-neutral-400 mb-1.5">
              6-Digit Security Code
            </label>
            <div className="relative">
              <KeyRound className="w-4 h-4 text-neutral-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                required
                value={resetCode}
                onChange={(e) => setResetCode(e.target.value)}
                placeholder="123456"
                className="w-full pl-10 pr-4 py-3 rounded-xl bg-white/[0.04] dark:bg-[#070708] border border-white/10 dark:border-white/10 text-sm font-mono font-bold tracking-widest focus:outline-none focus:border-amber-400"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-neutral-400 dark:text-neutral-400 mb-1.5">
              New Password
            </label>
            <input
              type="password"
              required
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="Enter new password (min 6 chars)"
              className="w-full px-4 py-3 rounded-xl bg-white/[0.04] dark:bg-[#070708] border border-white/10 dark:border-white/10 text-sm focus:outline-none focus:border-amber-400"
            />
          </div>

          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-neutral-400 dark:text-neutral-400 mb-1.5">
              Confirm New Password
            </label>
            <input
              type="password"
              required
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="Confirm new password"
              className="w-full px-4 py-3 rounded-xl bg-white/[0.04] dark:bg-[#070708] border border-white/10 dark:border-white/10 text-sm focus:outline-none focus:border-amber-400"
            />
          </div>

          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setStep(1)}
              className="px-4 py-3 rounded-xl bg-white/10 dark:bg-white/10 text-xs font-bold"
            >
              Back
            </button>
            <button
              type="submit"
              disabled={loading}
              className="flex-1 py-3.5 rounded-xl btn-gold font-extrabold text-sm shadow-lg"
            >
              {loading ? 'Updating Password...' : 'Reset Password'}
            </button>
          </div>
        </form>
      )}

      <p className="text-center text-xs text-neutral-400">
        Remembered your password?{' '}
        <Link to="/login" className="font-bold text-amber-500 dark:text-amber-300 hover:underline">
          Back to Sign In
        </Link>
      </p>
    </AuthShell>
  );
}
