import React, { useState } from 'react';
import { AlertCircle, ArrowRight, Eye, EyeOff, Loader2, Lock, Shield } from 'lucide-react';
import { DEMO_PASSWORD, seedDatabase } from '@shared/demo/seed';
import { useApp } from '../../state/appContext';
import { useToast } from '../../components/ui/toast';

const DEMO_USER = seedDatabase().users[0];

const fieldClass =
  'w-full rounded border bg-slate-900/90 px-3 py-2 font-mono text-sm text-white placeholder:text-slate-600 focus:border-blue-500 focus:outline-none';

export const LoginPage: React.FC = () => {
  const { login, source } = useApp();
  const toast = useToast();

  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [errors, setErrors] = useState<{ identifier?: string; password?: string; form?: string }>({});
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const next: typeof errors = {};
    if (!identifier.trim()) next.identifier = 'Enter your employee ID or official email.';
    if (!password) next.password = 'Enter your password.';
    setErrors(next);
    if (next.identifier || next.password) return;

    setSubmitting(true);
    const result = await login(identifier, password);
    setSubmitting(false);
    if (!result.ok) {
      setErrors({ form: result.error });
      return;
    }
    // RedirectIfAuthenticated forwards to the originally requested page once the session exists.
    toast({ kind: 'success', title: 'Signed in' });
  };

  return (
    <div className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden bg-[#071524] px-4 py-8 text-slate-100">
      <div aria-hidden className="absolute inset-0 bg-[linear-gradient(to_right,#10375c0a_1px,transparent_1px),linear-gradient(to_bottom,#10375c0a_1px,transparent_1px)] bg-[size:32px_32px]" />

      <div className="relative z-10 w-full max-w-md">
        <div className="mb-8 text-center">
          <div className="mb-3 inline-flex h-14 w-14 items-center justify-center rounded-md bg-blue-600 text-white shadow-md">
            <Shield className="h-8 w-8" />
          </div>
          <h1 className="text-2xl font-black uppercase tracking-wider text-white">CSAP</h1>
          <p className="mt-1 text-xs font-medium tracking-wide text-blue-300">Central Statutory Authentication Platform</p>
          <div className="mt-2 font-mono text-[11px] text-slate-400">CHENNAI PETROLEUM CORPORATION LIMITED (CPCL)</div>
        </div>

        <div className="rounded-lg border border-slate-700/80 bg-[#0A2540] p-6 shadow-xl">
          <div className="mb-4 flex items-center justify-between border-b border-slate-700/60 pb-4 text-xs">
            <span className="font-semibold uppercase tracking-wider text-slate-300">Procurement Officer Login</span>
            <span className="text-[11px] font-medium uppercase tracking-wide text-slate-400">Prototype</span>
          </div>

          {errors.form && (
            <div role="alert" className="mb-4 flex items-start gap-2 rounded border border-rose-500/40 bg-rose-950/40 p-2.5 text-xs text-rose-200">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{errors.form}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} noValidate className="space-y-4">
            <div>
              <label htmlFor="identifier" className="mb-1 block text-xs font-medium text-slate-300">
                Employee ID or Officer Email
              </label>
              <input
                id="identifier"
                autoComplete="username"
                value={identifier}
                onChange={(e) => setIdentifier(e.target.value)}
                aria-invalid={!!errors.identifier}
                aria-describedby={errors.identifier ? 'identifier-error' : undefined}
                placeholder="CPCL10421 or officer@cpcl.co.in"
                className={`${fieldClass} ${errors.identifier ? 'border-rose-400' : 'border-slate-600'}`}
              />
              {errors.identifier && <p id="identifier-error" className="mt-1 text-xs text-rose-300">{errors.identifier}</p>}
            </div>

            <div>
              <label htmlFor="password" className="mb-1 block text-xs font-medium text-slate-300">
                Password
              </label>
              <div className="relative">
                <input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  aria-invalid={!!errors.password}
                  aria-describedby={errors.password ? 'password-error' : undefined}
                  placeholder="Enter password"
                  className={`${fieldClass} pr-10 ${errors.password ? 'border-rose-400' : 'border-slate-600'}`}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                  aria-pressed={showPassword}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 p-0.5 text-slate-400 hover:text-slate-200"
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              {errors.password && <p id="password-error" className="mt-1 text-xs text-rose-300">{errors.password}</p>}
            </div>

            <button
              type="submit"
              disabled={submitting}
              className="flex w-full items-center justify-center gap-2 rounded bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white shadow-xs transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {submitting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" /> Signing In...
                </>
              ) : (
                <>
                  Sign In <ArrowRight className="h-4 w-4" />
                </>
              )}
            </button>
          </form>

          <div className="mt-4 rounded border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-200">
            <p className="font-semibold">Demo account</p>
            <p className="mt-1 font-mono text-[11px]">
              {DEMO_USER.employeeId} or {DEMO_USER.email} · Password: {DEMO_PASSWORD}
            </p>
            <button
              type="button"
              onClick={() => {
                setIdentifier(DEMO_USER.employeeId);
                setPassword(DEMO_PASSWORD);
                setErrors({});
              }}
              className="mt-2 font-semibold text-amber-100 underline hover:no-underline"
            >
              Fill demo credentials
            </button>
          </div>

          <div className="mt-4 flex items-center justify-center gap-1.5 border-t border-slate-800 pt-3 text-center">
            <Lock className="h-3 w-3 shrink-0 text-slate-500" />
            <p className="text-[10px] leading-normal text-slate-400">
              Prototype system — {source === 'api' ? 'connected to the CSAP test database' : 'running on built-in demo data'}. Not for use with real tender information.
            </p>
          </div>
          {source === 'api' && (
            <p className="mt-2 text-center text-[11px] text-slate-400">
              Bidder?{' '}
              <a href="/gem" className="font-medium text-blue-300 hover:underline">
                Submit a bid on the simulated GeM portal
              </a>
            </p>
          )}
        </div>
      </div>
    </div>
  );
};
