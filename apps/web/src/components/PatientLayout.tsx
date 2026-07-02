'use client';

import React from 'react';
import { useRouter } from 'next/navigation';
import { Home, LogOut, Settings, Bell } from 'lucide-react';
import { authClient } from '@/lib/auth-client';

export default function PatientLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();

  return (
    <div className="min-h-screen bg-patient-bg text-patient-ink selection:bg-patient-accent/20">
      <div className="max-w-md mx-auto min-h-screen flex flex-col">
        <header className="flex items-center justify-between px-4 h-12 border-b border-patient-border/60 shrink-0">
          <button
            onClick={() => router.push('/patient/history')}
            className="flex items-center gap-1.5 font-bold text-patient-ink"
            title="Home"
          >
            <Home className="w-4 h-4 text-patient-accent" />
            <span className="tracking-tight">V-Aid</span>
          </button>
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
