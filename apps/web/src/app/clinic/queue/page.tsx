'use client';

import { useQuery } from '@tanstack/react-query';
import ClinicLayout from '@/components/ClinicLayout';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Loader2, Users, Clock, AlertCircle, Flag } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { useRouter } from 'next/navigation';

export default function ClinicQueuePage() {
  const router = useRouter();

  // Fetch visits for the first clinic (demo)
  const { data: clinics } = useQuery({
    queryKey: ['clinics'],
    queryFn: async () => {
      const res = await fetch('/api/clinics');
      return res.json();
    },
  });

  const clinicId = clinics?.[0]?.id;

  const { data: visits, isLoading } = useQuery({
    queryKey: ['visits', clinicId],
    queryFn: async () => {
      const res = await fetch(`/api/visits?clinicId=${clinicId}`);
      return res.json();
    },
    enabled: !!clinicId,
    refetchInterval: 5000, // Poll every 5s
  });

  if (isLoading) {
    return (
      <ClinicLayout showBack={false}>
        <div className="flex h-screen items-center justify-center">
          <Loader2 className="animate-spin text-doctor-accent" />
        </div>
      </ClinicLayout>
    );
  }

  const waitingCount = visits?.filter((v: any) => v.status !== 'DONE').length || 0;

  return (
    <ClinicLayout showBack={false}>
      <div className="mb-8 flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <div className="w-2 h-2 bg-doctor-accent rounded-full animate-pulse" />
            <h1 className="text-2xl font-bold">Live Queue</h1>
          </div>
          <p className="text-doctor-muted mono-tag">
            {waitingCount} Patients waiting · {clinics?.[0]?.name}
          </p>
        </div>
        <Badge variant="outline" className="border-doctor-accent text-doctor-accent px-3 py-1">
          <Users className="w-4 h-4 mr-2" /> RECEPTION VIEW
        </Badge>
      </div>

      <div className="space-y-4">
        {visits?.map((visit: any) => (
          <Card
            key={visit.id}
            className="bg-doctor-raised border-doctor-muted/20 hover:border-doctor-accent transition-colors cursor-pointer overflow-hidden group"
            onClick={() => router.push(`/clinic/consult/${visit.id}`)}
          >
            <div className={`absolute left-0 top-0 bottom-0 w-1 ${getStatusColor(visit.status)}`} />
            <CardContent className="p-5 flex items-center justify-between">
              <div className="flex items-center gap-6">
                <div className="text-center">
                  <p className="mono-tag text-doctor-muted text-[10px]">Token</p>
                  <p className="text-xl font-bold font-mono-tag">{visit.token_no}</p>
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-lg font-bold text-doctor-text group-hover:text-doctor-accent transition-colors">
                      {visit.patient_name || 'Unknown Patient'}
                    </h3>
                    {/* Silent-screen flag glyph — doctor-only attention marker */}
                    {Array.isArray(visit.screen_flags_json) && visit.screen_flags_json.length > 0 && (
                      <span
                        title="For your attention"
                        className="inline-flex items-center justify-center w-5 h-5 rounded-full border border-[#56b3c9]/40 bg-[#56b3c9]/10 text-[#56b3c9]"
                      >
                        <Flag className="w-3 h-3" />
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-3 mt-1">
                    <span className="flex items-center text-xs text-doctor-muted">
                      <Clock className="w-3 h-3 mr-1" />{' '}
                      {formatDistanceToNow(new Date(visit.created_at))} ago
                    </span>
                    <Badge
                      className={`${getStatusBg(visit.status)} text-[10px] font-bold px-2 py-0`}
                    >
                      {visit.status}
                    </Badge>
                  </div>
                </div>
              </div>

              {visit.status === 'INTAKE COMPLETE' && (
                <div className="bg-doctor-accent/10 text-doctor-accent px-4 py-2 rounded-lg flex items-center gap-2">
                  <AlertCircle className="w-4 h-4" />
                  <span className="text-sm font-bold">PRE-READ READY</span>
                </div>
              )}
            </CardContent>
          </Card>
        ))}

        {visits?.length === 0 && (
          <div className="text-center py-20 border-2 border-dashed border-doctor-muted/20 rounded-xl">
            <Users className="w-12 h-12 text-doctor-muted mx-auto mb-4" />
            <p className="text-doctor-muted">No patients in the queue</p>
          </div>
        )}
      </div>
    </ClinicLayout>
  );
}

function getStatusColor(status: string) {
  switch (status) {
    case 'CHECKED IN':
      return 'bg-doctor-muted';
    case 'INTAKE IN PROGRESS':
      return 'bg-yellow-500';
    case 'INTAKE COMPLETE':
      return 'bg-doctor-accent';
    case 'CONSULT':
      return 'bg-cyan-400';
    case 'DONE':
      return 'bg-green-500';
    default:
      return 'bg-doctor-muted';
  }
}

function getStatusBg(status: string) {
  switch (status) {
    case 'CHECKED IN':
      return 'bg-doctor-muted/20 text-doctor-muted';
    case 'INTAKE IN PROGRESS':
      return 'bg-yellow-500/20 text-yellow-500';
    case 'INTAKE COMPLETE':
      return 'bg-doctor-accent/20 text-doctor-accent';
    case 'CONSULT':
      return 'bg-cyan-400/20 text-cyan-400';
    case 'DONE':
      return 'bg-green-500/20 text-green-500';
    default:
      return 'bg-doctor-muted/20 text-doctor-muted';
  }
}
