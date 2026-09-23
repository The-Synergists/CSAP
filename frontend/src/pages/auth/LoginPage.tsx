import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Shield,
  Lock,
  ArrowRight,
  Eye,
  EyeOff,
  AlertCircle,
  Loader2,
} from 'lucide-react';

const DEMO_EMAIL = 'rk.ramanathan@cpcl.co.in';
const DEMO_PASSWORD = 'Cpcl@2026';

export const LoginPage: React.FC = () => {
  const navigate = useNavigate();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    setError('');

    if (!email.trim() || !password) {
      setError('Email and password are both required.');
      return;
    }

    setIsSubmitting(true);

    // Demo authentication for CSAP prototype
    setTimeout(() => {
      const validEmail =
        email.trim().toLowerCase() === DEMO_EMAIL.toLowerCase();

      const validPassword = password === DEMO_PASSWORD;

      if (!validEmail || !validPassword) {
        setError('Invalid login credentials');
        setIsSubmitting(false);
        return;
      }

      // Store login state
      sessionStorage.setItem('csap_logged_in', 'true');

      // Notify ProcurementContext
      window.dispatchEvent(new Event('csap-auth-change'));

      setIsSubmitting(false);

      // Open dashboard
      navigate('/dashboard', { replace: true });
    }, 500);
  };

  return (
    <div className="min-h-screen bg-[#071524] text-white flex items-center justify-center px-4 py-8">

      {/* Background */}
      <div className="absolute inset-0 pointer-events-none bg-[linear-gradient(to_right,#10375c12_1px,transparent_1px),linear-gradient(to_bottom,#10375c12_1px,transparent_1px)] bg-[size:32px_32px]" />

      <div className="relative z-10 w-full max-w-md">

        {/* Logo / Header */}
        <div className="text-center mb-7">

          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-xl bg-blue-600 shadow-lg">
            <Shield className="h-9 w-9 text-white" />
          </div>

          <h1 className="text-3xl font-bold tracking-wide">
            CSAP
          </h1>

          <p className="mt-1 text-sm text-blue-300">
            Central Statutory Authentication Platform
          </p>

          <p className="mt-2 text-xs text-slate-400">
            CPCL Procurement Portal
          </p>
        </div>

        {/* Login Card */}
        <div className="rounded-xl border border-slate-600 bg-[#0b2947] p-7 shadow-2xl">

          <div className="mb-5 border-b border-slate-600 pb-5">
            <h2 className="text-lg font-semibold">
              Procurement Officer Login
            </h2>

            <p className="mt-1 text-sm text-slate-400">
              Sign in to access procurement workspaces.
            </p>
          </div>

          {/* Error */}
          {error && (
            <div className="mb-5 flex items-center gap-2 rounded-md border border-red-400/50 bg-red-950/40 px-3 py-3 text-sm text-red-200">
              <AlertCircle className="h-4 w-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-5">

            {/* Email */}
            <div>
              <label
                htmlFor="email"
                className="mb-2 block text-sm font-medium text-slate-200"
              >
                Officer Email
              </label>

              <input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="officer@cpcl.co.in"
                autoComplete="username"
                className="w-full rounded-md border border-slate-600 bg-[#111c30] px-3 py-3 text-sm text-white outline-none placeholder:text-slate-500 focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
              />
            </div>

            {/* Password */}
            <div>
              <label
                htmlFor="password"
                className="mb-2 block text-sm font-medium text-slate-200"
              >
                Password
              </label>

              <div className="relative">

                <input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter password"
                  autoComplete="current-password"
                  className="w-full rounded-md border border-slate-600 bg-[#111c30] px-3 py-3 pr-11 text-sm text-white outline-none placeholder:text-slate-500 focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                />

                <button
                  type="button"
                  onClick={() =>
                    setShowPassword((previous) => !previous)
                  }
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white"
                  aria-label={
                    showPassword
                      ? 'Hide password'
                      : 'Show password'
                  }
                >
                  {showPassword ? (
                    <EyeOff className="h-5 w-5" />
                  ) : (
                    <Eye className="h-5 w-5" />
                  )}
                </button>

              </div>
            </div>

            {/* Sign In */}
            <button
              type="submit"
              disabled={isSubmitting}
              className="flex w-full items-center justify-center gap-2 rounded-md bg-blue-600 px-4 py-3 text-sm font-semibold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="h-5 w-5 animate-spin" />
                  Signing In...
                </>
              ) : (
                <>
                  Sign In
                  <ArrowRight className="h-5 w-5" />
                </>
              )}
            </button>

          </form>

          {/* Security message */}
          <div className="mt-6 flex items-center justify-center gap-2 border-t border-slate-700 pt-5">
            <Lock className="h-4 w-4 text-slate-500" />

            <p className="text-xs text-slate-400">
              Authorized procurement access only.
            </p>
          </div>

        </div>

        {/* Footer */}
        <div className="mt-4 flex justify-between text-xs text-slate-500">
          <span>CPCL Procurement System</span>
          <span>Prototype Access</span>
        </div>

      </div>
    </div>
  );
};

export default LoginPage;