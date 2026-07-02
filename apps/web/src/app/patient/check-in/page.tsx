'use client';

import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import PatientLayout from '@/components/PatientLayout';
import { Card, CardContent } from '@/components/ui/card';
import { Star, ChevronRight, Loader2, QrCode } from 'lucide-react';

type Clinic = { id: string; name: string };
type Fav = { clinic_id: string; name: string };

/**
 * No-QR manual check-in: pick a clinic (favourites first) to start check-in from
 * anywhere — a patient can prepare their intake from home, then submit at the
 * clinic. Scanning a clinic QR still deep-links straight to /patient/check-in/[id].
 */
export default function CheckInPickerPage() {
  const router = useRouter();

  const { data: clinics, isLoading } = useQuery<Clinic[]>({
    queryKey: ['clinics'],
    queryFn: async () => (await fetch('/api/clinics')).json(),
  });
  const { data: favData } = useQuery<{ favorites: Fav[] }>({
    queryKey: ['favorites'],
    queryFn: async () => {
      const r = await fetch('/api/favorites');
      return r.ok ? r.json() : { favorites: [] };
    },
  });

  const favorites = favData?.favorites || [];
  const favIds = new Set(favorites.map((f) => f.clinic_id));
  const others = (Array.isArray(clinics) ? clinics : []).filter((c) => !favIds.has(c.id));

  const go = (id: string) => router.push(`/patient/check-in/${id}`);

  const Row = ({ id, name, fav }: { id: string; name: string; fav?: boolean }) => (
    <Card
      onClick={() => go(id)}
      className="bg-patient-card border-patient-border cursor-pointer hover:border-patient-accent transition-colors"
    >
      <CardContent className="p-4 flex items-center justify-between">
        <span className="font-medium text-patient-ink flex items-center gap-2">
          {fav && <Star className="w-4 h-4 text-patient-accent" />}
          {name}
        </span>
        <ChevronRight className="w-5 h-5 text-patient-muted" />
      </CardContent>
    </Card>
  );

  return (
    <PatientLayout>
      <div className="flex-1 p-6 flex flex-col gap-4">
        <div>
          <p className="mono-tag text-patient-muted mb-1">CHECK IN</p>
          <h1 className="text-2xl font-bold text-patient-ink">Choose your clinic</h1>
          <p className="text-patient-muted text-sm mt-1 flex items-center gap-1.5">
            <QrCode className="w-4 h-4" /> No QR needed — pick below, or scan your clinic&apos;s code.
          </p>
        </div>

        {isLoading ? (
          <div className="flex-1 flex items-center justify-center">
            <Loader2 className="animate-spin text-patient-accent w-6 h-6" />
          </div>
        ) : (
          <div className="space-y-4 flex-1 overflow-y-auto pb-8">
            {favorites.length > 0 && (
              <div className="space-y-2">
                <p className="mono-tag text-patient-muted text-[10px]">FAVOURITES</p>
                {favorites.map((f) => (
                  <Row key={f.clinic_id} id={f.clinic_id} name={f.name} fav />
                ))}
              </div>
            )}
            <div className="space-y-2">
              {favorites.length > 0 && <p className="mono-tag text-patient-muted text-[10px]">ALL CLINICS</p>}
              {others.map((c) => (
                <Row key={c.id} id={c.id} name={c.name} />
              ))}
              {others.length === 0 && favorites.length === 0 && (
                <p className="text-patient-muted text-sm">No clinics available yet.</p>
              )}
            </div>
          </div>
        )}
      </div>
    </PatientLayout>
  );
}
