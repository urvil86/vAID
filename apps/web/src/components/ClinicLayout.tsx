'use client';

import React, { useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { ListChecks, BarChart3, Settings, Loader2, LogOut, ChevronLeft } from 'lucide-react';
import { authClient } from '@/lib/auth-client';

const NAV = [
  { href: '/clinic/queue', label: 'Queue', icon: ListChecks },
  { href: '/clinic/analytics', label: 'Analytics', icon: BarChart3 },
  { href: '/clinic/admin', label: 'Admin', icon: Settings },
];

const STAFF_ROLES = ['doctor', 'receptionist', 'admin'];
// Local dev super-user bypass — mirrors the server guard so the console is
// reachable without a real login while testing.
const DEV_BYPASS = process.env.NEXT_PUBLIC_DEV_AUTH_BYPASS === '1';

export default function ClinicLayout({
  children,
  showBack = true,
  backHref,
}: {
  children: React.ReactNode;
  /** Show the header back arrow. Off for the top-level nav pages (queue/analytics/admin). */
  showBack?: boolean;
  /** Force a specific back target instead of popping browser history. */
  backHref?: string;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const { data: session, isPending } = authClient.useSession();

  const handleBack = () => {
    if (backHref) {
      router.push(backHref);
      return;
    }
    // Pop history when possible, else fall back to the queue (clinic home) so a
    // directly-opened drill-down never dead-ends.
    if (typeof window !== 'undefined' && window.history.length > 1) router.back();
    else router.push('/clinic/queue');
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const role = (session?.user as any)?.role as string | undefined;
  const isStaff = !!role && STAFF_ROLES.includes(role);
  const allowed = DEV_BYPASS || isStaff;

  // Clinic console is staff-only. Patients (or signed-out users) are bounced so
  // the doctor side is never visible to a patient after login.
  useEffect(() => {
    if (DEV_BYPASS || isPending) return;
    if (!session) {
      router.replace(`/account/signin?callbackUrl=${encodeURIComponent(pathname)}`);
    } else if (!isStaff) {
      router.replace('/patient/history');
    }
  }, [isPending, session, isStaff, router, pathname]);

  if (!allowed) {
    return (
      <div className="min-h-screen bg-doctor-bg flex items-center justify-center">
        <Loader2 className="animate-spin text-doctor-accent" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-doctor-bg text-doctor-text selection:bg-doctor-accent/20">
      <header className="border-b border-doctor-muted/15 bg-doctor-bg/80 backdrop-blur sticky top-0 z-20">
        <div className="max-w-4xl mx-auto px-6 h-14 flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            {showBack && (
              <button
                onClick={handleBack}
                className="-ml-1.5 p-1 text-doctor-muted hover:text-doctor-text"
                title="Back"
              >
                <ChevronLeft className="w-5 h-5" />
                <span className="sr-only">Back</span>
              </button>
            )}
            <button
              onClick={() => router.push('/clinic/queue')}
              className="flex items-center gap-2 font-bold tracking-tight"
            >
              <span className="text-doctor-accent">V-Aid</span>
              <span className="mono-tag text-[10px] text-doctor-muted">CLINIC CONSOLE</span>
            </button>
          </div>
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
            <span className="w-px h-5 bg-doctor-muted/20 mx-1" />
            <button
              onClick={async () => {
                await authClient.signOut();
                router.push('/account/signin');
              }}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium text-doctor-muted hover:text-doctor-text transition-colors"
              title="Sign out"
            >
              <LogOut className="w-3.5 h-3.5" /> Sign out
            </button>
          </nav>
        </div>
      </header>
      <div className="max-w-4xl mx-auto p-6">{children}</div>
    </div>
  );
}
