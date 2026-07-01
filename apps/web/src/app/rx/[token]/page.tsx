'use client';

import { useParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { Loader2, Pill } from 'lucide-react';
import type { PrescriptionItem } from '@/lib/types';

type SharedRx = {
  id: string;
  items_json: PrescriptionItem[] | null;
  advice: string | null;
  follow_up_date: string | null;
  generated_at: string;
  patient_name: string;
  doctor_name: string;
  registration_no: string | null;
  specialty: string | null;
  clinic_name: string | null;
  clinic_address: string | null;
  rx_header_json: { clinic_name?: string; line1?: string; phone?: string; reg?: string } | null;
};

export default function SharedPrescriptionPage() {
  const { token } = useParams<{ token: string }>();

  const { data, isLoading, error } = useQuery<SharedRx>({
    queryKey: ['shared-rx', token],
    queryFn: async () => {
      const res = await fetch(`/api/rx/${token}`);
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error || 'This link is not available.');
      }
      return (await res.json()).prescription;
    },
    retry: false,
  });

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#f6f1e9]">
        <Loader2 className="animate-spin text-[#d8693e] w-8 h-8" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-[#f6f1e9] p-6 text-center">
        <p className="text-lg font-bold text-[#211d17]">
          {(error as Error)?.message || 'This link is not available.'}
        </p>
        <p className="text-sm text-[#6b6258] mt-2">
          Prescription links expire after 72 hours. Ask your clinic to re-share.
        </p>
      </div>
    );
  }

  const header = data.rx_header_json || {};
  const items = data.items_json || [];

  return (
    <div className="min-h-screen bg-[#f6f1e9] py-8 px-4">
      <div className="max-w-lg mx-auto bg-white rounded-2xl border border-[#ece4d6] shadow-sm overflow-hidden">
        {/* Clinic header */}
        <div className="p-6 border-b border-[#ece4d6]">
          <h1 className="text-xl font-bold text-[#211d17]">
            {header.clinic_name || data.clinic_name || 'Clinic'}
          </h1>
          {(header.line1 || data.clinic_address) && (
            <p className="text-sm text-[#6b6258]">{header.line1 || data.clinic_address}</p>
          )}
          {header.phone && <p className="text-sm text-[#6b6258]">{header.phone}</p>}
        </div>

        {/* Doctor + patient */}
        <div className="p-6 border-b border-[#ece4d6] text-sm space-y-1">
          <p className="font-semibold text-[#211d17]">Dr. {data.doctor_name}</p>
          {(data.registration_no || header.reg) && (
            <p className="text-[#6b6258]">Reg. No: {data.registration_no || header.reg}</p>
          )}
          {data.specialty && <p className="text-[#6b6258]">{data.specialty}</p>}
          <p className="text-[#211d17] pt-2">
            Patient: <span className="font-medium">{data.patient_name}</span>
          </p>
          <p className="text-[#6b6258]" suppressHydrationWarning>
            {new Date(data.generated_at).toLocaleDateString('en-IN', {
              day: '2-digit',
              month: 'short',
              year: 'numeric',
            })}
          </p>
        </div>

        {/* Medications */}
        <div className="p-6 space-y-3">
          <p className="mono-tag text-[10px] text-[#6b6258] flex items-center gap-1.5">
            <Pill className="w-3.5 h-3.5 text-[#d8693e]" /> MEDICATIONS
          </p>
          {items.length === 0 ? (
            <p className="text-sm text-[#6b6258]">No medications listed.</p>
          ) : (
            <ol className="space-y-3">
              {items.map((it, i) => (
                <li key={i} className="border border-[#ece4d6] rounded-xl p-3">
                  <p className="font-semibold text-[#211d17]">
                    {i + 1}. {it.drug} {it.strength}
                  </p>
                  <p className="text-sm text-[#6b6258]">
                    {[it.dose, it.frequency, it.duration].filter(Boolean).join(' · ')}
                  </p>
                  {it.instructions && (
                    <p className="text-sm text-[#6b6258] mt-1">{it.instructions}</p>
                  )}
                </li>
              ))}
            </ol>
          )}

          {data.advice && (
            <div className="pt-2">
              <p className="mono-tag text-[10px] text-[#6b6258]">ADVICE</p>
              <p className="text-sm text-[#211d17] whitespace-pre-wrap">{data.advice}</p>
            </div>
          )}
          {data.follow_up_date && (
            <p className="text-sm text-[#211d17]">
              Follow-up:{' '}
              <span className="font-medium" suppressHydrationWarning>
                {new Date(data.follow_up_date).toLocaleDateString('en-IN', {
                  day: '2-digit',
                  month: 'short',
                  year: 'numeric',
                })}
              </span>
            </p>
          )}
        </div>

        <p className="text-center text-[10px] text-[#6b6258] mono-tag pb-5">
          Shared securely via V-Aid · link expires 72h after creation
        </p>
      </div>
    </div>
  );
}
