'use client';

import { useRouter } from 'next/navigation';
import { Stethoscope, User, ArrowRight, QrCode } from 'lucide-react';

/**
 * Account chooser — the landing's "Book a demo" / "Get early access" CTAs land
 * here so the visitor picks their path before auth. Doctor/Clinic and Patient
 * share the same email/password forms; only the post-auth callbackUrl differs
 * (clinic console vs patient app), so each card just carries the right target.
 */
const DOCTOR_CB = '/clinic/queue';
const PATIENT_CB = '/patient/history';

function Mark() {
  return (
    <svg width={34} height={34} viewBox="0 0 100 100" fill="none">
      <path d="M20 24 L50 76 L80 24" stroke="#211D17" strokeWidth={9} strokeLinecap="round" strokeLinejoin="round" />
      <path d="M20 24 C30 44 36 54 50 76" stroke="#D8693E" strokeWidth={9} strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={50} cy={76} r={7} fill="#D8693E" />
    </svg>
  );
}

export default function AccountChoosePage() {
  const router = useRouter();
  const signin = (cb: string) => router.push(`/account/signin?callbackUrl=${encodeURIComponent(cb)}`);
  const signup = (cb: string) => router.push(`/account/signup?callbackUrl=${encodeURIComponent(cb)}`);

  return (
    <main className="min-h-screen w-full flex items-center justify-center bg-patient-bg p-4">
      <div className="w-full max-w-3xl">
        {/* Brand */}
        <button
          onClick={() => router.push('/')}
          className="flex items-center gap-2.5 mx-auto mb-8"
          aria-label="Back to home"
        >
          <Mark />
          <span className="text-xl font-extrabold text-patient-ink tracking-tight">
            V<span className="text-patient-accent">·</span>Aid
          </span>
        </button>

        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-patient-ink tracking-tight">
            Get started <span className="hindi text-patient-muted font-semibold">· शुरू करें</span>
          </h1>
          <p className="text-patient-muted mt-1.5">Choose how you&apos;ll use V-Aid.</p>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          {/* Doctor / Clinic */}
          <div className="bg-patient-card border border-patient-border rounded-2xl p-6 flex flex-col shadow-sm">
            <div className="w-12 h-12 rounded-2xl bg-patient-accent/10 flex items-center justify-center text-patient-accent mb-4">
              <Stethoscope className="w-6 h-6" />
            </div>
            <h2 className="text-xl font-bold text-patient-ink">Doctor / Clinic staff</h2>
            <p className="text-sm text-patient-muted mt-1.5 flex-1">
              Access your queue, patient pre-reads, and consults.
            </p>
            <div className="flex flex-col gap-2.5 mt-5">
              <button
                onClick={() => signin(DOCTOR_CB)}
                className="h-12 rounded-xl bg-patient-accent hover:bg-patient-accent/90 text-white text-[15px] font-bold transition-colors flex items-center justify-center gap-2"
              >
                Sign in <ArrowRight className="w-4 h-4" />
              </button>
              <button
                onClick={() => signup(DOCTOR_CB)}
                className="h-12 rounded-xl border border-patient-border bg-white hover:border-patient-accent text-patient-ink text-[15px] font-semibold transition-colors"
              >
                Create account
              </button>
            </div>
          </div>

          {/* Patient */}
          <div className="bg-patient-card border border-patient-border rounded-2xl p-6 flex flex-col shadow-sm">
            <div className="w-12 h-12 rounded-2xl bg-patient-accent/10 flex items-center justify-center text-patient-accent mb-4">
              <User className="w-6 h-6" />
            </div>
            <h2 className="text-xl font-bold text-patient-ink">Patient</h2>
            <p className="text-sm text-patient-muted mt-1.5 flex-1">
              Check in, tell your story in your language, and keep your visit records.
            </p>
            <div className="flex flex-col gap-2.5 mt-5">
              <button
                onClick={() => signin(PATIENT_CB)}
                className="h-12 rounded-xl bg-patient-accent hover:bg-patient-accent/90 text-white text-[15px] font-bold transition-colors flex items-center justify-center gap-2"
              >
                Sign in <ArrowRight className="w-4 h-4" />
              </button>
              <button
                onClick={() => signup(PATIENT_CB)}
                className="h-12 rounded-xl border border-patient-border bg-white hover:border-patient-accent text-patient-ink text-[15px] font-semibold transition-colors"
              >
                Create account
              </button>
              <button
                onClick={() => router.push('/patient/check-in')}
                className="text-sm font-semibold text-patient-accent hover:underline flex items-center justify-center gap-1.5 mt-1"
              >
                <QrCode className="w-4 h-4" /> or check in at a clinic
              </button>
            </div>
          </div>
        </div>

        <p className="text-center mono-tag text-patient-muted text-[10px] mt-8">
          V-AID VERSION 1.0.0 · SECURE HEALTHCARE PLATFORM
        </p>
      </div>
    </main>
  );
}
