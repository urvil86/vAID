'use client';

import { useSearchParams } from 'next/navigation';
import { Suspense, useState } from 'react';
import { Stethoscope, Phone, Loader2, ArrowLeft } from 'lucide-react';
import { authClient } from '@/lib/auth-client';

/** Normalise to E.164-ish: keep a leading +, else assume India (+91) for a
 * 10-digit number, otherwise just prefix +. */
function normalisePhone(raw: string): string {
  const v = raw.replace(/[\s-]/g, '');
  if (v.startsWith('+')) return v;
  const digits = v.replace(/\D/g, '');
  if (digits.length === 10) return `+91${digits}`;
  return `+${digits}`;
}

function PhoneAuth() {
  const searchParams = useSearchParams();
  const callbackUrl = searchParams.get('callbackUrl') || '/';
  const [step, setStep] = useState<'phone' | 'code'>('phone');
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const sendCode = async () => {
    setLoading(true);
    setError(null);
    const phoneNumber = normalisePhone(phone);
    const { error: e } = await authClient.phoneNumber.sendOtp({ phoneNumber });
    setLoading(false);
    if (e) {
      setError(e.message ?? 'Could not send the code. Check the number and try again.');
      return;
    }
    setStep('code');
  };

  const verify = async () => {
    setLoading(true);
    setError(null);
    const phoneNumber = normalisePhone(phone);
    const { error: e } = await authClient.phoneNumber.verify({ phoneNumber, code });
    if (e) {
      setError(e.message ?? 'That code did not match. Please try again.');
      setLoading(false);
      return;
    }
    // Verified → signed in (account created on first verify). Redirect.
    if (typeof window !== 'undefined') window.location.href = callbackUrl;
  };

  return (
    <main className="min-h-screen w-full flex items-center justify-center bg-[#f6f1e9] p-4">
      <div className="w-full max-w-[420px]">
        <div className="text-center mb-7">
          <div className="inline-flex w-14 h-14 rounded-2xl bg-patient-accent/10 items-center justify-center mb-3">
            <Stethoscope className="w-7 h-7 text-patient-accent" />
          </div>
          <h1 className="text-3xl font-bold text-patient-ink tracking-tight">V-Aid</h1>
          <p className="text-patient-muted text-sm mt-1">Sign in with your phone number.</p>
        </div>

        <div className="bg-[#fcfaf5] border border-patient-border rounded-2xl p-6 shadow-sm flex flex-col gap-4">
          {step === 'phone' ? (
            <>
              <div>
                <h2 className="text-xl font-bold text-patient-ink">Enter your phone</h2>
                <p className="text-patient-muted text-sm mt-0.5">We&apos;ll text you a 6-digit code</p>
              </div>
              <label className="flex flex-col gap-1.5">
                <span className="text-sm font-medium text-patient-ink">Phone number</span>
                <div className="relative">
                  <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-patient-muted" />
                  <input
                    type="tel"
                    inputMode="tel"
                    autoFocus
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && phone && void sendCode()}
                    placeholder="+91 98765 43210"
                    className="w-full rounded-xl border border-patient-border bg-white pl-10 pr-3 h-12 text-[16px] text-patient-ink outline-none focus:border-patient-accent transition-colors"
                  />
                </div>
              </label>
              {error && (
                <div className="rounded-xl bg-red-50 border border-red-200 p-3 text-sm text-red-700">
                  {error}
                </div>
              )}
              <button
                onClick={() => void sendCode()}
                disabled={loading || !phone}
                className="h-12 rounded-xl bg-patient-accent hover:bg-patient-accent/90 text-white text-[16px] font-bold transition-colors disabled:opacity-60 flex items-center justify-center"
              >
                {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : 'Send code'}
              </button>
            </>
          ) : (
            <>
              <button
                onClick={() => {
                  setStep('phone');
                  setError(null);
                }}
                className="flex items-center gap-1 text-sm text-patient-muted hover:text-patient-ink w-fit"
              >
                <ArrowLeft className="w-4 h-4" /> Change number
              </button>
              <div>
                <h2 className="text-xl font-bold text-patient-ink">Enter the code</h2>
                <p className="text-patient-muted text-sm mt-0.5">
                  Sent to {normalisePhone(phone)}
                </p>
              </div>
              <input
                type="text"
                inputMode="numeric"
                autoFocus
                maxLength={6}
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
                onKeyDown={(e) => e.key === 'Enter' && code.length >= 4 && void verify()}
                placeholder="••••••"
                className="w-full rounded-xl border border-patient-border bg-white px-3 h-14 text-center text-2xl tracking-[0.4em] text-patient-ink outline-none focus:border-patient-accent transition-colors"
              />
              {error && (
                <div className="rounded-xl bg-red-50 border border-red-200 p-3 text-sm text-red-700">
                  {error}
                </div>
              )}
              <button
                onClick={() => void verify()}
                disabled={loading || code.length < 4}
                className="h-12 rounded-xl bg-patient-accent hover:bg-patient-accent/90 text-white text-[16px] font-bold transition-colors disabled:opacity-60 flex items-center justify-center"
              >
                {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : 'Verify & continue'}
              </button>
              <button
                onClick={() => void sendCode()}
                disabled={loading}
                className="text-sm text-patient-accent font-semibold hover:underline disabled:opacity-60"
              >
                Resend code
              </button>
            </>
          )}

          <p className="text-center text-sm text-patient-muted pt-1">
            Prefer email?{' '}
            <a
              href={`/account/signin?callbackUrl=${encodeURIComponent(callbackUrl)}`}
              className="font-semibold text-patient-accent hover:underline"
            >
              Sign in with email
            </a>
          </p>
        </div>

        <p className="text-center mono-tag text-patient-muted text-[10px] mt-6">
          V-AID VERSION 1.0.0 · SECURE HEALTHCARE PLATFORM
        </p>
      </div>
    </main>
  );
}

export default function PhoneAuthPage() {
  return (
    <Suspense>
      <PhoneAuth />
    </Suspense>
  );
}
