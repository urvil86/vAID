'use client';

import { useRef, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Mic, Square, Loader2, Trash2, FileText, ShieldCheck } from 'lucide-react';

/* eslint-disable @typescript-eslint/no-explicit-any */

export type ConsultNote = {
  summary: string;
  subjective: string;
  objective: string;
  assessment: string;
  plan: string[];
  medications_discussed: string[];
  follow_up: string;
};

/**
 * Ambient consult scribe. Transcribes the consultation in-browser (Web Speech),
 * structures it into an English EMR note via /api/consult/scribe, and shows the
 * result. The raw transcript never leaves the browser once structured — it is
 * discarded here; only the structured note is stored.
 */
export default function ConsultScribe({
  visitId,
  initial,
}: {
  visitId: string;
  initial?: ConsultNote | null;
}) {
  const [recording, setRecording] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [note, setNote] = useState<ConsultNote | null>(initial || null);
  const [err, setErr] = useState('');
  const recRef = useRef<any>(null);
  const finalRef = useRef('');

  const start = () => {
    setErr('');
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) {
      setErr('Live transcription is not supported in this browser (try Chrome).');
      return;
    }
    const rec = new SR();
    rec.lang = 'en-IN';
    rec.interimResults = true;
    rec.continuous = true;
    rec.onresult = (e: any) => {
      let interim = '';
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const chunk = e.results[i][0].transcript;
        if (e.results[i].isFinal) finalRef.current += chunk + ' ';
        else interim += chunk;
      }
      setTranscript((finalRef.current + interim).trim());
    };
    rec.onerror = (e: any) => {
      if (e?.error === 'not-allowed' || e?.error === 'service-not-allowed') {
        setErr('Microphone access was blocked. Allow it to record the consult.');
      }
      setRecording(false);
    };
    rec.onend = () => setRecording(false);
    recRef.current = rec;
    finalRef.current = '';
    setTranscript('');
    try {
      rec.start();
      setRecording(true);
    } catch {
      setErr('Could not start recording.');
    }
  };

  const stop = () => {
    try {
      recRef.current?.stop();
    } catch {
      /* ignore */
    }
    setRecording(false);
  };

  const discard = () => {
    setTranscript('');
    finalRef.current = '';
  };

  const scribe = useMutation({
    mutationFn: async () => {
      const text = (finalRef.current || transcript).trim();
      if (!text) throw new Error('Nothing recorded yet.');
      const res = await fetch('/api/consult/scribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ visitId, transcript: text }),
      });
      if (!res.ok) {
        throw new Error(
          ((await res.json().catch(() => ({}))) as { error?: string }).error ||
            'Could not structure the consult.'
        );
      }
      return (await res.json()).consultNote as ConsultNote;
    },
    onSuccess: (n) => {
      setNote(n);
      // The recording/transcript is deleted now that the EMR note is saved.
      setTranscript('');
      finalRef.current = '';
    },
    onError: (e) => setErr((e as Error).message),
  });

  return (
    <Card className="bg-doctor-raised border-doctor-muted/20 mb-4">
      <CardContent className="p-4 space-y-3">
        <div className="flex items-center justify-between">
          <p className="mono-tag text-doctor-muted text-[10px] flex items-center gap-1.5">
            <Mic className="w-3.5 h-3.5 text-doctor-accent" /> CONSULT SCRIBE
          </p>
          <span className="mono-tag text-doctor-muted/70 text-[9px] flex items-center gap-1">
            <ShieldCheck className="w-3 h-3" /> AUDIO NOT STORED
          </span>
        </div>

        {/* Controls */}
        <div className="flex flex-wrap items-center gap-2">
          {!recording ? (
            <Button
              size="sm"
              onClick={start}
              className="bg-doctor-accent text-doctor-bg font-bold gap-1.5"
            >
              <Mic className="w-3.5 h-3.5" /> {transcript ? 'Resume' : 'Record consult'}
            </Button>
          ) : (
            <Button size="sm" onClick={stop} className="bg-red-500 text-white font-bold gap-1.5">
              <Square className="w-3 h-3" /> Stop
            </Button>
          )}
          {!!transcript && !recording && (
            <>
              <Button
                size="sm"
                onClick={() => scribe.mutate()}
                disabled={scribe.isPending}
                className="bg-doctor-accent/90 text-doctor-bg font-bold gap-1.5"
              >
                {scribe.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <FileText className="w-3.5 h-3.5" />}
                Save to EMR
              </Button>
              <Button size="sm" variant="ghost" onClick={discard} className="text-doctor-muted gap-1.5">
                <Trash2 className="w-3.5 h-3.5" /> Discard
              </Button>
            </>
          )}
        </div>

        {recording && (
          <div className="flex items-center gap-2">
            <span className="inline-block w-2 h-2 bg-red-500 rounded-full animate-pulse" />
            <span className="mono-tag text-red-400 text-[10px]">RECORDING · TRANSCRIBING</span>
          </div>
        )}

        {/* Live transcript (working text only; discarded after structuring) */}
        {!!transcript && (
          <div className="rounded-lg border border-doctor-muted/20 bg-doctor-bg p-3 max-h-32 overflow-y-auto">
            <p className="text-doctor-text-secondary text-sm leading-relaxed whitespace-pre-wrap">
              {transcript}
            </p>
          </div>
        )}

        {err && <p className="text-amber-400 text-xs">{err}</p>}

        {/* Structured EMR result */}
        {note && (
          <div className="rounded-lg border border-doctor-accent/25 bg-doctor-bg p-3 space-y-2">
            <p className="mono-tag text-doctor-accent text-[9px]">CONSULT NOTE (FROM RECORDING)</p>
            {note.summary && <Field label="Summary" value={note.summary} />}
            {note.subjective && <Field label="Subjective" value={note.subjective} />}
            {note.objective && <Field label="Objective" value={note.objective} />}
            {note.assessment && <Field label="Assessment" value={note.assessment} />}
            {note.plan?.length > 0 && <Field label="Plan" value={note.plan.map((p) => `• ${p}`).join('\n')} />}
            {note.medications_discussed?.length > 0 && (
              <Field label="Medications discussed" value={note.medications_discussed.join(', ')} />
            )}
            {note.follow_up && <Field label="Follow-up" value={note.follow_up} />}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="mono-tag text-doctor-muted text-[9px]">{label}</p>
      <p className="text-doctor-text text-sm leading-relaxed whitespace-pre-wrap">{value}</p>
    </div>
  );
}
