'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import PatientLayout from '@/components/PatientLayout';
import { Card, CardContent } from '@/components/ui/card';
import { authClient } from '@/lib/auth-client';
import { Loader2, Bell } from 'lucide-react';

type Visit = { id: string; token_no: string; status: string; created_at: string };
type Notif = { tone: 'amber' | 'accent' | 'muted'; title: string; body: string; onClick?: () => void };

export default function PatientNotificationsPage() {
  const router = useRouter();
  const { data: session, isPending } = authClient.useSession();
  const patientId = session?.user?.id;

  useEffect(() => {
    if (!isPending && !session) router.push('/account/signin?callbackUrl=/patient/notifications');
  }, [isPending, session, router]);

  const { data: visits } = useQuery<Visit[]>({
    queryKey: ['patient-visits-notif', patientId],
    queryFn: async () => {
      const r = await fetch(`/api/visits?patientId=${patientId}`);
      return r.ok ? r.json() : [];
    },
    enabled: !!patientId,
  });

  if (isPending) {
    return (
      <PatientLayout>
        <div className="flex-1 flex items-center justify-center">
          <Loader2 className="animate-spin text-patient-accent w-6 h-6" />
        </div>
      </PatientLayout>
    );
  }

  const list = Array.isArray(visits) ? visits : [];
  const notifs: Notif[] = [];
  for (const v of list) {
    if (v.status === 'INTAKE IN PROGRESS') {
      notifs.push({
        tone: 'amber',
        title: 'Finish your intake',
        body: `You started token ${v.token_no} but didn't finish — tap to resume.`,
        onClick: () => router.push(`/patient/intake/${v.id}`),
      });
    } else if (v.status === 'INTAKE COMPLETE') {
      notifs.push({
        tone: 'accent',
        title: 'Your turn is near',
        body: `Token ${v.token_no} — your pre-read is ready for the doctor.`,
      });
    } else if (v.status === 'CONSULT') {
      notifs.push({
        tone: 'accent',
        title: "You're being seen now",
        body: `Token ${v.token_no} is in consult.`,
      });
    }
  }

  const dot = (t: Notif['tone']) =>
    t === 'amber' ? 'bg-patient-gold' : t === 'accent' ? 'bg-patient-accent' : 'bg-patient-muted';

  return (
    <PatientLayout>
      <div className="flex-1 p-6 flex flex-col gap-4">
        <h1 className="text-2xl font-bold text-patient-ink">Notifications</h1>

        {notifs.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center text-center gap-3 text-patient-muted">
            <Bell className="w-9 h-9" />
            <p>Nothing right now. We&apos;ll let you know when your turn is near.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {notifs.map((n, i) => (
              <Card
                key={i}
                onClick={n.onClick}
                className={`bg-patient-card border-patient-border ${n.onClick ? 'cursor-pointer hover:border-patient-accent transition-colors' : ''}`}
              >
                <CardContent className="p-4 flex gap-3">
                  <span className={`mt-1.5 w-2 h-2 rounded-full shrink-0 ${dot(n.tone)}`} />
                  <div>
                    <p className="font-bold text-patient-ink">{n.title}</p>
                    <p className="text-sm text-patient-muted mt-0.5">{n.body}</p>
                    <p className="mono-tag text-patient-muted text-[9px] mt-2">PATIENT · now</p>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        <p className="mono-tag text-patient-muted text-[9px] text-center mt-auto pt-4">
          CHANNELS: IN-APP · WHATSAPP / SMS VIA PROVIDER (WHEN CONFIGURED)
        </p>
      </div>
    </PatientLayout>
  );
}
