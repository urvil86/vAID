/**
 * ⚠ ANYTHING PLATFORM — DO NOT REWRITE THIS FILE ⚠
 *
 * Shipped v2 auth scaffolding. The <form onSubmit>, e.preventDefault(), and
 * window.location.href redirect are load-bearing for the mobile WebView auth
 * flow (AuthWebView intercepts the navigation to capture the session). A
 * prior AI rewrite replaced <form onSubmit> with <button onClick> and broke
 * signup platform-wide — "credentials cleared" / "button does nothing" for
 * every user until a human reverted it. DO NOT repeat that mistake.
 *
 *   Safe:   restyle, rewrite copy, add form fields (pass `name` explicitly).
 *   Unsafe: replacing <form>, removing preventDefault, bypassing
 *           authClient.signUp.email, changing the callbackUrl redirect.
 */
'use client';

import { useSearchParams } from 'next/navigation';
import { type FormEvent, Suspense, useState } from 'react';
import { Stethoscope, Mail, Lock, User, Eye, EyeOff, Loader2, Languages } from 'lucide-react';
import { SocialSignInButtons } from '@/components/SocialSignInButtons';
import { authClient } from '@/lib/auth-client';
import { AVAILABLE_LANGUAGES, LANG_STORAGE_KEY, isLanguageEnabled } from '@/lib/i18n';

function friendlyError(message?: string | null): string | null {
  if (!message) return null;
  if (/origin/i.test(message))
    return 'Could not verify this site. Open the app at its main URL and try again.';
  if (/already exists|exists/i.test(message))
    return 'An account with this email already exists — try signing in instead.';
  if (/password/i.test(message)) return 'Password must be at least 8 characters.';
  return message;
}

function SignUpForm() {
  const searchParams = useSearchParams();
  const callbackUrl = searchParams.get('callbackUrl') || '/';
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [language, setLanguage] = useState('Hindi');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const onSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    // The server backfills `name` from the email local-part when it's blank,
    // so a name is optional but improves how the account shows on records.
    const { error: signUpError } = await authClient.signUp.email({
      email,
      password,
      name: name.trim(),
    });

    if (signUpError) {
      setError(signUpError.message ?? 'Sign up failed');
      setLoading(false);
      return;
    }

    // Persist the chosen language on the profile (and locally) so the whole
    // patient flow uses it instead of defaulting to English.
    try {
      if (typeof window !== 'undefined') localStorage.setItem(LANG_STORAGE_KEY, language);
      await fetch('/api/profile', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ preferredLanguage: language }),
      });
    } catch {
      /* non-blocking */
    }

    if (typeof window !== 'undefined') {
      window.location.href = callbackUrl;
    } else {
      console.warn('signup: window is undefined; cannot redirect to callbackUrl');
    }
  };

  return (
    <main className="min-h-screen w-full flex items-center justify-center bg-[#f6f1e9] p-4">
      <div className="w-full max-w-[420px]">
        <div className="text-center mb-7">
          <div className="inline-flex w-14 h-14 rounded-2xl bg-patient-accent/10 items-center justify-center mb-3">
            <Stethoscope className="w-7 h-7 text-patient-accent" />
          </div>
          <h1 className="text-3xl font-bold text-patient-ink tracking-tight">V-Aid</h1>
          <p className="text-patient-muted text-sm mt-1">Smart clinical intake for modern practices.</p>
        </div>

        <form
          onSubmit={(e) => void onSubmit(e)}
          className="bg-[#fcfaf5] border border-patient-border rounded-2xl p-6 shadow-sm flex flex-col gap-4"
        >
          <div>
            <h2 className="text-xl font-bold text-patient-ink">Create your account</h2>
            <p className="text-patient-muted text-sm mt-0.5">Get started with V-Aid</p>
          </div>

          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-medium text-patient-ink">Full name</span>
            <div className="relative">
              <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-patient-muted" />
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Your full name"
                className="w-full rounded-xl border border-patient-border bg-white pl-10 pr-3 h-12 text-[16px] text-patient-ink outline-none focus:border-patient-accent transition-colors"
              />
            </div>
          </label>

          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-medium text-patient-ink">Preferred language</span>
            <div className="relative">
              <Languages className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-patient-muted z-10" />
              <select
                value={language}
                onChange={(e) => setLanguage(e.target.value)}
                className="w-full rounded-xl border border-patient-border bg-white pl-10 pr-3 h-12 text-[16px] text-patient-ink outline-none focus:border-patient-accent transition-colors appearance-none"
              >
                {AVAILABLE_LANGUAGES.map((l) => (
                  <option key={l.code} value={l.code} disabled={!isLanguageEnabled(l.code)}>
                    {l.label} · {l.nativeLabel}
                    {isLanguageEnabled(l.code) ? '' : ' (coming soon)'}
                  </option>
                ))}
              </select>
            </div>
          </label>

          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-medium text-patient-ink">Email</span>
            <div className="relative">
              <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-patient-muted" />
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                className="w-full rounded-xl border border-patient-border bg-white pl-10 pr-3 h-12 text-[16px] text-patient-ink outline-none focus:border-patient-accent transition-colors"
              />
            </div>
          </label>

          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-medium text-patient-ink">Password</span>
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-patient-muted" />
              <input
                type={showPassword ? 'text' : 'password'}
                required
                minLength={8}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="At least 8 characters"
                className="w-full rounded-xl border border-patient-border bg-white pl-10 pr-10 h-12 text-[16px] text-patient-ink outline-none focus:border-patient-accent transition-colors"
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-patient-muted hover:text-patient-ink"
                aria-label={showPassword ? 'Hide password' : 'Show password'}
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </label>

          {error && (
            <div className="rounded-xl bg-red-50 border border-red-200 p-3 text-sm text-red-700">
              {friendlyError(error)}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="h-12 rounded-xl bg-patient-accent hover:bg-patient-accent/90 text-white text-[16px] font-bold transition-colors disabled:opacity-60 flex items-center justify-center gap-2"
          >
            {loading ? <Loader2 className="w-5 h-5" /> : 'Create account'}
          </button>

          <SocialSignInButtons callbackUrl={callbackUrl} />

          <p className="text-center text-sm text-patient-muted">
            Already have an account?{' '}
            <a
              href={`/account/signin?callbackUrl=${encodeURIComponent(callbackUrl)}`}
              className="font-semibold text-patient-accent hover:underline"
            >
              Sign in
            </a>
          </p>
        </form>

        <p className="text-center mono-tag text-patient-muted text-[10px] mt-6">
          V-AID VERSION 1.0.0 · SECURE HEALTHCARE PLATFORM
        </p>
      </div>
    </main>
  );
}

export default function SignUpPage() {
  return (
    <Suspense>
      <SignUpForm />
    </Suspense>
  );
}
