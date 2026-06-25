'use client';

import React from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { ListChecks, BarChart3, Settings } from 'lucide-react';

const NAV = [
  { href: '/clinic/queue', label: 'Queue', icon: ListChecks },
  { href: '/clinic/analytics', label: 'Analytics', icon: BarChart3 },
  { href: '/clinic/admin', label: 'Admin', icon: Settings },
];

export default function ClinicLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();

  return (
    <div className="min-h-screen bg-doctor-bg text-doctor-text selection:bg-doctor-accent/20">
      <header className="border-b border-doctor-muted/15 bg-doctor-bg/80 backdrop-blur sticky top-0 z-20">
        <div className="max-w-4xl mx-auto px-6 h-14 flex items-center justify-between">
          <button
            onClick={() => router.push('/clinic/queue')}
            className="flex items-center gap-2 font-bold tracking-tight"
          >
            <span className="text-doctor-accent">V-Aid</span>
            <span className="mono-tag text-[10px] text-doctor-muted">CLINIC CONSOLE</span>
          </button>
          <nav className="flex items-center gap-1">
            {NAV.map(({ href, label, icon: Icon }) => {
              const active = pathname?.startsWith(href);
              return (
                <button
                  key={href}
                  onClick={() => router.push(href)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                    active
                      ? 'bg-doctor-accent/15 text-doctor-accent'
                      : 'text-doctor-muted hover:text-doctor-text'
                  }`}
                >
                  <Icon className="w-3.5 h-3.5" /> {label}
                </button>
              );
            })}
          </nav>
        </div>
      </header>
      <div className="max-w-4xl mx-auto p-6">{children}</div>
    </div>
  );
}
