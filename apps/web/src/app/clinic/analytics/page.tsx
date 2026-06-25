'use client';

import { useQuery } from '@tanstack/react-query';
import ClinicLayout from '@/components/ClinicLayout';
import { Card, CardContent } from '@/components/ui/card';
import { Loader2, Users, Clock, Stethoscope, ClipboardCheck, Target } from 'lucide-react';

type Analytics = {
  totalVisits: number;
  todayVisits: number;
  doneVisits: number;
  consultedVisits: number;
  intakeCompletedCount: number;
  intakeCompletionRate: number;
  avgWaitMin: number | null;
  avgConsultMin: number | null;
  intakeBeforeRoomPct: number;
  intakeBeforeRoomCount: number;
  intakeBeforeRoomDenom: number;
};

export default function ClinicAnalyticsPage() {
  const { data: clinics } = useQuery({
    queryKey: ['clinics'],
    queryFn: async () => (await fetch('/api/clinics')).json(),
  });
  const clinicId = clinics?.[0]?.id;

  const { data, isLoading } = useQuery<Analytics>({
    queryKey: ['analytics', clinicId],
    queryFn: async () => (await fetch(`/api/analytics?clinicId=${clinicId}`)).json(),
    enabled: !!clinicId,
    refetchInterval: 15000,
  });

  if (isLoading || !data) {
    return (
      <ClinicLayout>
        <div className="flex h-[60vh] items-center justify-center">
          <Loader2 className="animate-spin text-doctor-accent" />
        </div>
      </ClinicLayout>
    );
  }

  const fmtMin = (m: number | null) => (m == null ? '—' : `${m} min`);

  return (
    <ClinicLayout>
      <div className="mb-8">
        <h1 className="text-2xl font-bold">Analytics</h1>
        <p className="text-doctor-muted mono-tag mt-1">{clinics?.[0]?.name}</p>
      </div>

      {/* Headline proof metric */}
      <Card className="bg-gradient-to-br from-doctor-accent/15 to-doctor-raised border-doctor-accent/30 mb-6">
        <CardContent className="p-6">
          <p className="mono-tag text-doctor-accent text-[10px] flex items-center gap-2 mb-2">
            <Target className="w-3.5 h-3.5" /> PROOF OF VALUE
          </p>
          <div className="flex items-end gap-3">
            <span className="text-6xl font-bold text-doctor-text leading-none">
              {data.intakeBeforeRoomPct}%
            </span>
            <span className="text-doctor-muted text-sm pb-1">
              of consults had the pre-read ready
              <br />
              before the patient entered the room
            </span>
          </div>
          <p className="mono-tag text-doctor-muted text-[10px] mt-3">
            {data.intakeBeforeRoomCount} of {data.intakeBeforeRoomDenom} consulted visits
          </p>
        </CardContent>
      </Card>

      {/* Metric grid */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        <Metric icon={<Users className="w-4 h-4" />} label="Patients today" value={String(data.todayVisits)} />
        <Metric icon={<Users className="w-4 h-4" />} label="Total visits" value={String(data.totalVisits)} />
        <Metric
          icon={<ClipboardCheck className="w-4 h-4" />}
          label="Intake completion"
          value={`${data.intakeCompletionRate}%`}
          sub={`${data.intakeCompletedCount} completed`}
        />
        <Metric icon={<Clock className="w-4 h-4" />} label="Avg wait" value={fmtMin(data.avgWaitMin)} />
        <Metric
          icon={<Stethoscope className="w-4 h-4" />}
          label="Avg consult"
          value={fmtMin(data.avgConsultMin)}
        />
        <Metric icon={<ClipboardCheck className="w-4 h-4" />} label="Visits done" value={String(data.doneVisits)} />
      </div>

      <p className="text-doctor-muted/70 text-xs mt-6 mono-tag">
        Wait & consult times populate as visits move through CONSULT → DONE.
      </p>
    </ClinicLayout>
  );
}

function Metric({
  icon,
  label,
  value,
  sub,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  sub?: string;
}) {
  return (
    <Card className="bg-doctor-raised border-doctor-muted/20">
      <CardContent className="p-5">
        <p className="mono-tag text-doctor-muted text-[10px] flex items-center gap-2 mb-2">
          {icon} {label}
        </p>
        <p className="text-3xl font-bold text-doctor-text leading-none">{value}</p>
        {sub && <p className="text-doctor-muted text-xs mt-1.5">{sub}</p>}
      </CardContent>
    </Card>
  );
}
