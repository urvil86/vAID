'use client';

import { useRouter } from 'next/navigation';
import { authClient } from '@/lib/auth-client';
import { Card, CardContent } from '@/components/ui/card';
import { Stethoscope, User, Loader2 } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';

// Testing-phase auth bypass — see src/lib/dev-auth.ts. Off when the env var is unset.
const DEV_AUTH_BYPASS = process.env.NEXT_PUBLIC_DEV_AUTH_BYPASS === '1';

const STAFF_ROLES = ['doctor', 'receptionist', 'admin'];

export default function RootPage() {
  const router = useRouter();
  const { data: session } = authClient.useSession();

  const { isLoading: clinicsLoading } = useQuery({
    queryKey: ['clinics'],
    queryFn: async () => {
      const res = await fetch('/api/clinics');
      return res.json();
    },
  });

  // This page NEVER auto-redirects — the bare domain (vaid.vercel.app) always
  // shows the landing. Staff reach their console by tapping the card below
  // (signed-in staff go straight there; everyone else signs in first).
  const goToClinic = () => {
    const role = (session?.user as { role?: string } | undefined)?.role;
    const isStaff = !!role && STAFF_ROLES.includes(role);
    if (DEV_AUTH_BYPASS || isStaff) router.push('/clinic/queue');
    else router.push('/account/signin?callbackUrl=/clinic/queue');
  };

  if (clinicsLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#f6f1e9]">
        <Loader2 className="animate-spin text-[#d8693e] w-8 h-8" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#f6f1e9] text-[#211d17] flex flex-col items-center justify-center p-6">
      <div className="max-w-md w-full text-center space-y-8">
        <div>
          <h1 className="text-5xl font-bold mb-2 text-[#d8693e]">V-Aid</h1>
          <p className="text-lg text-[#6b6258]">Smart clinical intake for modern practices.</p>
        </div>

        <div className="grid gap-4">
          <Card
            className="bg-[#fcfaf5] border-[#ece4d6] hover:border-[#d8693e] transition-colors cursor-pointer"
            onClick={goToClinic}
          >
            <CardContent className="p-6 flex items-center gap-4">
              <div className="bg-[#d8693e]/10 p-3 rounded-full text-[#d8693e]">
                <Stethoscope className="w-6 h-6" />
              </div>
              <div className="text-left">
                <h3 className="font-bold text-lg">Doctor / Clinic Staff</h3>
                <p className="text-sm text-[#6b6258]">Access the queue and pre-reads.</p>
              </div>
            </CardContent>
          </Card>

          <Card
            className="bg-[#fcfaf5] border-[#ece4d6] hover:border-[#d8693e] transition-colors cursor-pointer"
            onClick={() => router.push('/patient/check-in')}
          >
            <CardContent className="p-6 flex items-center gap-4">
              <div className="bg-[#d8693e]/10 p-3 rounded-full text-[#d8693e]">
                <User className="w-6 h-6" />
              </div>
              <div className="text-left">
                <h3 className="font-bold text-lg">Patient Check-in</h3>
                <p className="text-sm text-[#6b6258]">Scan clinic QR to start intake.</p>
              </div>
            </CardContent>
          </Card>
        </div>

        <p className="text-xs text-[#6b6258] mono-tag">V-AID VERSION 1.0.0 · PHASE 1 CORE LOOP</p>
      </div>
    </div>
  );
}
