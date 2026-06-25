'use client';

import { useParams, useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { format, parseISO } from 'date-fns';
import ClinicLayout from '@/components/ClinicLayout';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Loader2, ArrowLeft, Calendar, FileText, ChevronRight } from 'lucide-react';
import { StructuredNote } from '@/lib/types';

const STATUS_COLOR: Record<string, string> = {
  DONE: 'border-l-emerald-500',
  CONSULT: 'border-l-[#56b3c9]',
  'INTAKE COMPLETE': 'border-l-amber-500',
  'INTAKE IN PROGRESS': 'border-l-amber-400',
  'CHECKED IN': 'border-l-doctor-muted',
};

function safeFormat(isoString: string): string {
  try {
    return format(parseISO(isoString), 'dd MMM yyyy · HH:mm');
  } catch {
    return isoString;
  }
}

function VisitCard({ visit, isFirst }: { visit: Record<string, unknown>; isFirst: boolean }) {
  const router = useRouter();
  const note = visit.structured_note_json as StructuredNote | null;
  const dateLabel = safeFormat(visit.created_at as string);

  return (
    <Card
      className={`bg-doctor-raised border-doctor-muted/20 border-l-4 ${STATUS_COLOR[visit.status as string] || 'border-l-doctor-muted'} cursor-pointer hover:bg-doctor-raised/80 transition-colors`}
      onClick={() => {
        if (visit.status !== 'CHECKED IN') {
          router.push(`/clinic/consult/${visit.id}`);
        }
      }}
    >
      <CardContent className="p-6">
        <div className="flex items-start justify-between">
          <div className="space-y-2 flex-1">
            <div className="flex items-center gap-3 flex-wrap">
              <Badge className="bg-doctor-accent/10 text-doctor-accent border-doctor-accent/20 font-mono">
                {visit.token_no as string}
              </Badge>
              <Badge
                variant="outline"
                className="border-doctor-muted/30 text-doctor-muted font-mono text-[10px]"
              >
                {visit.status as string}
              </Badge>
              {isFirst && (
                <Badge className="bg-emerald-500/10 text-emerald-400 border-emerald-500/20 text-[10px]">
                  Latest
                </Badge>
              )}
            </div>

            <div className="flex items-center gap-2 text-doctor-muted">
              <Calendar className="w-3 h-3" />
              <span className="mono-tag text-[10px]">{dateLabel}</span>
              {visit.clinic_name && (
                <span className="mono-tag text-[10px] text-doctor-muted/60">
                  · {visit.clinic_name as string}
                </span>
              )}
            </div>

            {note?.chief_complaint && (
              <div className="mt-3 space-y-1">
                <div className="flex items-center gap-2">
                  <FileText className="w-3 h-3 text-doctor-muted" />
                  <p className="mono-tag text-[10px] text-doctor-muted">Chief Complaint</p>
                </div>
                <p className="text-doctor-text font-semibold">{note.chief_complaint}</p>
                {note.associated_symptoms && note.associated_symptoms.length > 0 && (
                  <p className="text-doctor-muted text-sm">
                    {note.associated_symptoms.slice(0, 3).join(' · ')}
                  </p>
                )}
              </div>
            )}

            {note && (
              <div className="flex gap-4 mt-3 pt-3 border-t border-doctor-muted/10">
                {note.duration && (
                  <div>
                    <p className="mono-tag text-[9px] text-doctor-muted">Duration</p>
                    <p className="text-xs text-doctor-text">{note.duration}</p>
                  </div>
                )}
                {note.current_medications && note.current_medications.length > 0 && (
                  <div>
                    <p className="mono-tag text-[9px] text-doctor-muted">Medications</p>
                    <p className="text-xs text-doctor-text">
                      {note.current_medications.length} listed
                    </p>
                  </div>
                )}
                {note.allergies && note.allergies.length > 0 && (
                  <div>
                    <p className="mono-tag text-[9px] text-doctor-muted">Allergies</p>
                    <p className="text-xs text-doctor-text">
                      {note.allergies.slice(0, 2).join(', ')}
                    </p>
                  </div>
                )}
              </div>
            )}
          </div>
          {visit.status !== 'CHECKED IN' && (
            <ChevronRight className="w-5 h-5 text-doctor-muted ml-4 shrink-0 mt-1" />
          )}
        </div>
      </CardContent>
    </Card>
  );
}

export default function PatientHistoryPage() {
  const params = useParams();
  const router = useRouter();
  const patientId = params.patientId as string;

  const { data: visits, isLoading } = useQuery({
    queryKey: ['patient-history', patientId],
    queryFn: async () => {
      const res = await fetch(`/api/visits?patientId=${patientId}`);
      if (!res.ok) throw new Error('Failed to load history');
      return res.json();
    },
  });

  const patientName = visits?.[0]?.patient_name || 'Patient';

  return (
    <ClinicLayout>
      <div className="mb-6 flex items-center gap-4">
        <Button
          variant="ghost"
          className="text-doctor-muted hover:text-doctor-text"
          onClick={() => router.back()}
        >
          <ArrowLeft className="w-4 h-4 mr-2" /> Back
        </Button>
        <div>
          <p className="mono-tag text-doctor-muted text-[10px]">Longitudinal Record</p>
          <h1 className="text-2xl font-bold text-doctor-text">{patientName}</h1>
        </div>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-20">
          <Loader2 className="animate-spin text-doctor-accent" />
        </div>
      ) : !visits || visits.length === 0 ? (
        <Card className="bg-doctor-raised border-doctor-muted/20">
          <CardContent className="p-12 text-center">
            <p className="text-doctor-muted">No visit history found.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {visits.map((visit: Record<string, unknown>, i: number) => (
            <VisitCard key={visit.id as string} visit={visit} isFirst={i === 0} />
          ))}
        </div>
      )}
    </ClinicLayout>
  );
}
