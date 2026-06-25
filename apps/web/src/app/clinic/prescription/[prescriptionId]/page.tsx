'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { Loader2, Printer, Share2, MessageCircle, Smartphone } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { PrescriptionItem } from '@/lib/types';

export default function PrescriptionPrintPage() {
  const params = useParams();
  const prescriptionId = params.prescriptionId as string;
  const [today, setToday] = useState('');
  const [followUpFormatted, setFollowUpFormatted] = useState('');
  const [shareNotice, setShareNotice] = useState('');

  const shareVia = async (channel: 'whatsapp' | 'sms') => {
    setShareNotice('');
    try {
      const res = await fetch('/api/share', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prescriptionId, channel }),
      });
      const json = await res.json();
      // Honest fallback: copy the link when no provider is connected.
      if (json.shareUrl) {
        try {
          await navigator.clipboard.writeText(json.shareUrl);
        } catch {
          /* ignore */
        }
      }
      setShareNotice(
        json.delivered
          ? `Sent via ${channel}.`
          : `${channel === 'whatsapp' ? 'WhatsApp' : 'SMS'} provider not connected — link copied to clipboard.`
      );
    } catch {
      setShareNotice('Could not share — please try again.');
    }
  };

  const { data, isLoading } = useQuery({
    queryKey: ['prescription-print', prescriptionId],
    queryFn: async () => {
      const res = await fetch(`/api/prescriptions/${prescriptionId}`);
      if (!res.ok) throw new Error('Failed to fetch prescription');
      return res.json();
    },
  });

  useEffect(() => {
    setToday(
      new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'long', year: 'numeric' })
    );
  }, []);

  useEffect(() => {
    if (data?.prescription?.follow_up_date) {
      setFollowUpFormatted(
        new Date(data.prescription.follow_up_date).toLocaleDateString('en-IN', {
          day: '2-digit',
          month: 'long',
          year: 'numeric',
        })
      );
    }
  }, [data]);

  if (isLoading) {
    return (
      <div className="flex h-screen items-center justify-center bg-white">
        <Loader2 className="animate-spin text-gray-400" />
      </div>
    );
  }

  const rx = data?.prescription;
  if (!rx) return <div className="p-8 text-center text-gray-400">Prescription not found.</div>;

  const items: PrescriptionItem[] = rx.items_json || [];

  return (
    <>
      <style jsx global>{`
        @import url('https://fonts.googleapis.com/css2?family=Space+Mono:wght@400;700&family=Hanken+Grotesk:wght@400;600;700;800&display=swap');
        @media print {
          .no-print {
            display: none !important;
          }
          body {
            margin: 0;
          }
          .print-page {
            box-shadow: none !important;
          }
        }
      `}</style>

      {/* Controls - hidden on print */}
      <div className="no-print py-4 bg-gray-100">
        <div className="flex flex-wrap gap-3 justify-center">
          <Button onClick={() => window.print()} className="bg-[#0c0e11] text-white gap-2">
            <Printer className="w-4 h-4" /> Print
          </Button>
          <Button variant="outline" onClick={() => shareVia('whatsapp')} className="gap-2">
            <MessageCircle className="w-4 h-4" /> WhatsApp
          </Button>
          <Button variant="outline" onClick={() => shareVia('sms')} className="gap-2">
            <Smartphone className="w-4 h-4" /> SMS
          </Button>
          <Button
            variant="outline"
            onClick={() => {
              const url = window.location.href;
              if (navigator.share) navigator.share({ title: 'V-Aid Prescription', url });
              else navigator.clipboard.writeText(url);
            }}
            className="gap-2"
          >
            <Share2 className="w-4 h-4" /> Copy Link
          </Button>
        </div>
        {shareNotice && (
          <p className="text-center text-sm text-gray-600 mt-3">{shareNotice}</p>
        )}
      </div>

      {/* Prescription Document */}
      <div className="print-page mx-auto max-w-[794px] bg-white shadow-lg min-h-[1123px] p-10 font-[Hanken_Grotesk]">
        {/* Header */}
        <div className="border-b-2 border-black pb-4 mb-6 flex justify-between items-start">
          <div>
            <h1 className="text-2xl font-extrabold tracking-tight text-black">
              {rx.clinic_name || 'V-Aid Clinic'}
            </h1>
            <p className="text-sm text-gray-500">{rx.clinic_address || ''}</p>
          </div>
          <div className="text-right">
            <p className="font-bold text-black">{rx.doctor_name || 'Doctor'}</p>
            {rx.registration_no && (
              <p className="text-xs text-gray-500 font-mono">Reg. No: {rx.registration_no}</p>
            )}
            {rx.specialty && <p className="text-xs text-gray-600">{rx.specialty}</p>}
          </div>
        </div>

        {/* Patient & Date Row */}
        <div className="flex justify-between items-center mb-6 pb-4 border-b border-gray-200">
          <div>
            <span className="text-xs font-mono uppercase tracking-widest text-gray-400">
              Patient
            </span>
            <p className="text-lg font-bold text-black">{rx.patient_name}</p>
            <p className="text-xs font-mono text-gray-400">{rx.token_no}</p>
          </div>
          <div className="text-right">
            <span className="text-xs font-mono uppercase tracking-widest text-gray-400">Date</span>
            <p className="text-sm font-semibold text-black" suppressHydrationWarning>
              {today}
            </p>
          </div>
        </div>

        {/* Rx Symbol */}
        <div className="mb-4">
          <span className="text-3xl font-extrabold text-black italic">℞</span>
        </div>

        {/* Medications Table */}
        {items.length > 0 ? (
          <table className="w-full mb-8 text-sm">
            <thead>
              <tr className="border-b border-gray-300">
                <th className="text-left py-2 font-mono uppercase text-xs tracking-wider text-gray-400 pr-4">
                  #
                </th>
                <th className="text-left py-2 font-mono uppercase text-xs tracking-wider text-gray-400 pr-4">
                  Drug
                </th>
                <th className="text-left py-2 font-mono uppercase text-xs tracking-wider text-gray-400 pr-4">
                  Dose
                </th>
                <th className="text-left py-2 font-mono uppercase text-xs tracking-wider text-gray-400 pr-4">
                  Freq.
                </th>
                <th className="text-left py-2 font-mono uppercase text-xs tracking-wider text-gray-400 pr-4">
                  Duration
                </th>
                <th className="text-left py-2 font-mono uppercase text-xs tracking-wider text-gray-400">
                  Instructions
                </th>
              </tr>
            </thead>
            <tbody>
              {items.map((item, i) => (
                <tr key={i} className="border-b border-gray-100">
                  <td className="py-3 pr-4 font-mono text-gray-400">{i + 1}.</td>
                  <td className="py-3 pr-4 font-semibold">
                    {item.drug}
                    {item.strength && (
                      <span className="font-normal text-gray-500 ml-1">({item.strength})</span>
                    )}
                  </td>
                  <td className="py-3 pr-4">{item.dose}</td>
                  <td className="py-3 pr-4 font-mono font-bold">{item.frequency}</td>
                  <td className="py-3 pr-4">{item.duration}</td>
                  <td className="py-3 text-gray-500">{item.instructions || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="text-gray-400 mb-8">No medications prescribed.</p>
        )}

        {/* General Advice */}
        {rx.advice && (
          <div className="mb-8 bg-gray-50 rounded-lg p-4 border border-gray-200">
            <p className="text-xs font-mono uppercase tracking-widest text-gray-400 mb-2">
              General Advice
            </p>
            <p className="text-sm text-black whitespace-pre-wrap">{rx.advice}</p>
          </div>
        )}

        {/* Follow-up */}
        {followUpFormatted && (
          <div className="mb-8">
            <p className="text-xs font-mono uppercase tracking-widest text-gray-400 mb-1">
              Follow-up Date
            </p>
            <p className="font-bold text-black" suppressHydrationWarning>
              {followUpFormatted}
            </p>
          </div>
        )}

        {/* Footer */}
        <div className="mt-16 pt-6 border-t border-gray-200 flex justify-between items-end">
          <div>
            <p className="text-xs text-gray-400 font-mono">
              Generated via V-Aid · AI-assisted clinical intake
            </p>
            <p className="text-xs text-gray-300 font-mono">
              This prescription is issued under the authority of the prescribing physician.
            </p>
          </div>
          <div className="text-right">
            <div className="w-32 border-t border-black mt-8 pt-1">
              <p className="text-xs font-mono text-gray-400">Doctor&#39;s Signature</p>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
