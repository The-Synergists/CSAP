// Officer sign-in, styled after the Atlassian Design System: neutral background, a white card with
// a soft raised shadow, 14px text in neutral-1000 (#172B4D), labels in neutral-800, inputs with a
// 2px border that turns brand blue (#0C66E4) on focus, and a full-width primary button.

import React, { useState } from 'react';
import { Eye, EyeOff, Loader2, Lock, Shield, XCircle } from 'lucide-react';
import { useApp } from '../../state/appContext';
import { useToast } from '../../components/ui/toast';

const input =
  'block w-full rounded-[3px] border-2 bg-[#F7F8F9] px-2 py-[7px] text-sm text-[#172B4D] placeholder:text-[#626F86] transition-colors hover:bg-[#F1F2F4] focus:border-[#388BFF] focus:bg-white focus:outline-none';

export const LoginPage: React.FC = () => {
  const { login } = useApp();
  const toast = useToast();

  // Pre-filled with the demo officer's credentials so a visitor can sign in with one click (demo/recording use).
  const [identifier, setIdentifier] = useState('CPCL10421');
  const [password, setPassword] = useState('Cpcl@2026');
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
    <div
      className="flex min-h-screen flex-col items-center justify-center bg-[#F7F8F9] px-4 py-10 text-[#172B4D]"
      style={{ fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Noto Sans", Ubuntu, "Helvetica Neue", sans-serif' }}
    >
      <main className="w-full max-w-[400px] rounded-[3px] bg-white px-6 py-8 shadow-[0_0_1px_rgba(9,30,66,0.31),0_8px_12px_rgba(9,30,66,0.15)] sm:px-10">
        <div className="flex flex-col items-center text-center">
          <div className="flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-[3px] bg-[#0C66E4] text-white">
              <Shield aria-hidden className="h-5 w-5" />
            </span>
            <span className="text-[22px] font-bold tracking-tight text-[#172B4D]">CSAP</span>
          </div>
          <p className="mt-1 text-xs text-[#626F86]">Central Statutory Authentication Platform</p>
          <h1 className="mt-6 text-base font-semibold text-[#172B4D]">Log in to continue</h1>
        </div>

        {errors.form && (
          <div role="alert" className="mt-5 flex items-start gap-2 rounded-[3px] bg-[#FFECEB] px-3 py-2.5 text-sm text-[#AE2E24]">
            <XCircle aria-hidden className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{errors.form}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} noValidate className="mt-5 space-y-4">
          <div>
            <label htmlFor="identifier" className="mb-1 block text-xs font-semibold text-[#44546F]">
              Employee ID or official email <span className="text-[#AE2E24]" aria-hidden>*</span>
            </label>
            <input
              id="identifier"
              autoComplete="username"
              value={identifier}
              onChange={(e) => setIdentifier(e.target.value)}
              aria-invalid={!!errors.identifier}
              aria-describedby={errors.identifier ? 'identifier-error' : undefined}
              placeholder="Enter your employee ID or email"
              className={`${input} ${errors.identifier ? 'border-[#E2483D]' : 'border-[#DCDFE4]'}`}
            />
            {errors.identifier && <p id="identifier-error" className="mt-1 text-xs text-[#AE2E24]">{errors.identifier}</p>}
          </div>

          <div>
            <label htmlFor="password" className="mb-1 block text-xs font-semibold text-[#44546F]">
              Password <span className="text-[#AE2E24]" aria-hidden>*</span>
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
                className={`${input} pr-10 ${errors.password ? 'border-[#E2483D]' : 'border-[#DCDFE4]'}`}
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                aria-label={showPassword ? 'Hide password' : 'Show password'}
                aria-pressed={showPassword}
                className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded-[3px] p-1 text-[#44546F] hover:bg-[#091E420F]"
              >
                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
            {errors.password && <p id="password-error" className="mt-1 text-xs text-[#AE2E24]">{errors.password}</p>}
          </div>

          <button
            type="submit"
            disabled={submitting}
            className="flex h-10 w-full items-center justify-center gap-2 rounded-[3px] bg-[#0C66E4] text-sm font-medium text-white transition-colors hover:bg-[#0055CC] active:bg-[#09326C] disabled:cursor-not-allowed disabled:bg-[#091E4208] disabled:text-[#091E424F]"
          >
            {submitting ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" /> Signing in…
              </>
            ) : (
              'Sign in'
            )}
          </button>
        </form>

        <div className="mt-6 border-t border-[#091E4224] pt-4 text-center">
          <p className="flex items-center justify-center gap-1.5 text-xs text-[#626F86]">
            <Lock aria-hidden className="h-3 w-3 shrink-0" /> Restricted to authorized procurement reviewers.
          </p>
          <p className="mt-1 text-xs text-[#626F86]">All access and actions are logged and subject to audit.</p>
        </div>
      </main>

      <p className="mt-6 text-xs text-[#626F86]">CSAP · Procurement bid verification</p>
    </div>
  );
};
