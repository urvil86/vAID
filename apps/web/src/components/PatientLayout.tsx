'use client';

import React from 'react';
import { useRouter } from 'next/navigation';
import { Home, LogOut, Settings, Bell, ChevronLeft } from 'lucide-react';
import { authClient } from '@/lib/auth-client';

export default function PatientLayout({
  children,
  showBack = true,
  backHref,
}: {
  children: React.ReactNode;
  /** Show the header back arrow. Off for the patient home (history). */
  showBack?: boolean;
  /** Force a specific back target instead of popping browser history. */
  backHref?: string;
}) {
  const router = useRouter();

  const handleBack = () => {
    if (backHref) {
      router.push(backHref);
      return;
    }
    // Pop history when we can, else fall back to the patient home so a
    // directly-opened page never dead-ends or escapes to the marketing site.
    if (typeof window !== 'undefined' && window.history.length > 1) router.back();
    else router.push('/patient/history');
  };

  return (
    <div className="min-h-screen bg-patient-bg text-patient-ink selection:bg-patient-accent/20">
      <div className="max-w-md mx-auto min-h-screen flex flex-col">
        <header className="flex items-center justify-between px-4 h-12 border-b border-patient-border/60 shrink-0">
          <div className="flex items-center gap-1">
            {showBack && (
              <button
                onClick={handleBack}
                className="-ml-1 p-1 text-patient-muted hover:text-patient-ink"
                title="Back"
              >
                <ChevronLeft className="w-5 h-5" />
                <span className="sr-only">Back</span>
              </button>
            )}
            <button
              onClick={() => router.push('/patient/history')}
              className="flex items-center gap-1.5 font-bold text-patient-ink"
              title="Home"
            >
              <Home className="w-4 h-4 text-patient-accent" />
              <span className="tracking-tight">V-Aid</span>
            </button>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={() => router.push('/patient/notifications')}
              className="text-patient-muted hover:text-patient-ink"
              title="Notifications"
            >
              <Bell className="w-4 h-4" />
              <span className="sr-only">Notifications</span>
            </button>
            <button
              onClick={() => router.push('/patient/settings')}
              className="text-patient-muted hover:text-patient-ink"
              title="Settings"
            >
              <Settings className="w-4 h-4" />
              <span className="sr-only">Settings</span>
            </button>
            <button
              onClick={async () => {
                await authClient.signOut();
                router.push('/');
              }}
              className="flex items-center gap-1 text-patient-muted text-sm hover:text-patient-ink"
              title="Sign out"
            >
              <LogOut className="w-4 h-4" />
              <span className="sr-only">Sign out</span>
            </button>
          </div>
        </header>
        {children}
      </div>
    </div>
  );
}
