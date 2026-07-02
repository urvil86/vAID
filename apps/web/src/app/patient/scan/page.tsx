'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import PatientLayout from '@/components/PatientLayout';
import { Loader2, QrCode, CameraOff } from 'lucide-react';

/* eslint-disable @typescript-eslint/no-explicit-any */

// A clinic QR encodes the check-in deep link. Pull the clinic id out of a full
// URL, a bare path, or a raw id.
function extractClinicId(text: string): string | null {
  if (!text) return null;
  const m = text.match(/\/patient\/check-in\/([0-9a-fA-F-]{8,})/);
  if (m) return m[1];
  const u = text.trim().match(/^[0-9a-fA-F-]{8,}$/);
  return u ? u[0] : null;
}

type Status = 'starting' | 'scanning' | 'unsupported' | 'denied';

export default function PatientScanPage() {
  const router = useRouter();
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number | null>(null);
  const [status, setStatus] = useState<Status>('starting');

  useEffect(() => {
    let cancelled = false;
    const BD = (window as any).BarcodeDetector;

    const cleanup = () => {
      cancelled = true;
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };

    if (!BD || !navigator.mediaDevices?.getUserMedia) {
      setStatus('unsupported');
      return cleanup;
    }

    const detector = new BD({ formats: ['qr_code'] });

    (async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'environment' },
        });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play().catch(() => {});
        }
        setStatus('scanning');

        const tick = async () => {
          if (cancelled || !videoRef.current) return;
          try {
            const codes = await detector.detect(videoRef.current);
            if (codes && codes.length) {
              const id = extractClinicId(codes[0].rawValue || '');
              if (id) {
                cleanup();
                router.push(`/patient/check-in/${id}`);
                return;
              }
            }
          } catch {
            /* transient decode error — keep scanning */
          }
          rafRef.current = requestAnimationFrame(tick);
        };
        rafRef.current = requestAnimationFrame(tick);
      } catch {
        setStatus('denied');
      }
    })();

    return cleanup;
  }, [router]);

  return (
    <PatientLayout>
      <div className="flex-1 p-6 flex flex-col gap-4">
        <div>
          <p className="mono-tag text-patient-muted mb-1">CHECK IN</p>
          <h1 className="text-2xl font-bold text-patient-ink">Scan clinic QR</h1>
          <p className="text-patient-muted text-sm mt-1">
            Point your camera at the QR code on the clinic&apos;s reception desk.
          </p>
        </div>

        {(status === 'starting' || status === 'scanning') && (
          <div className="relative rounded-2xl overflow-hidden bg-black aspect-[3/4] max-h-[60vh] flex items-center justify-center">
            <video ref={videoRef} playsInline muted className="w-full h-full object-cover" />
            {/* viewfinder frame */}
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
              <div className="w-52 h-52 border-2 border-white/80 rounded-2xl" />
            </div>
            {status === 'starting' && (
              <div className="absolute inset-0 flex items-center justify-center bg-black/40">
                <Loader2 className="w-6 h-6 animate-spin text-white" />
              </div>
            )}
            {status === 'scanning' && (
              <p className="absolute bottom-3 left-0 right-0 text-center mono-tag text-[10px] text-white/90">
                SCANNING…
              </p>
            )}
          </div>
        )}

        {(status === 'unsupported' || status === 'denied') && (
          <div className="rounded-2xl border border-patient-border bg-patient-card p-5 flex flex-col items-center text-center gap-3">
            <CameraOff className="w-8 h-8 text-patient-muted" />
            <p className="text-patient-ink font-semibold">
              {status === 'denied' ? 'Camera access was blocked' : "In-app scanning isn't available here"}
            </p>
            <p className="text-patient-muted text-sm">
              {status === 'denied'
                ? 'Allow camera access in your browser, or open your phone camera app and point it at the clinic QR — it will open V-Aid directly.'
                : 'Open your phone camera app and point it at the clinic QR — it opens V-Aid directly. Or pick your clinic from the list.'}
            </p>
          </div>
        )}

        <button
          onClick={() => router.push('/patient/check-in')}
          className="flex items-center justify-center gap-2 text-sm font-semibold text-patient-accent hover:underline mt-1"
        >
          <QrCode className="w-4 h-4" /> Pick a clinic from the list instead
        </button>
      </div>
    </PatientLayout>
  );
}
