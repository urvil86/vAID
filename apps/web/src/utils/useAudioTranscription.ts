'use client';

import { useRef, useState } from 'react';

/**
 * Records a single answer via MediaRecorder and transcribes it server-side
 * (Sarvam). Returns { transcript: null, fallback: true } whenever ASR is
 * unavailable or fails, so the caller degrades to the browser Web Speech path
 * and tags the answer asr_source:'browser'. Gated by NEXT_PUBLIC_SARVAM_ENABLED
 * so the existing Web Speech capture stays the default until a key is provisioned.
 */
export function sarvamEnabled(): boolean {
  return process.env.NEXT_PUBLIC_SARVAM_ENABLED === '1';
}

export function useAudioTranscription(visitId: string, language?: string) {
  const [recording, setRecording] = useState(false);
  const [processing, setProcessing] = useState(false);
  const mediaRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  const start = async (): Promise<boolean> => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mr = new MediaRecorder(stream);
      chunksRef.current = [];
      mr.ondataavailable = (e) => {
        if (e.data.size) chunksRef.current.push(e.data);
      };
      mr.start();
      mediaRef.current = mr;
      setRecording(true);
      return true;
    } catch {
      return false; // mic denied → caller falls back
    }
  };

  const stopAndTranscribe = async (): Promise<{
    transcript: string | null;
    asrSource: string;
    fallback?: boolean;
  }> => {
    const mr = mediaRef.current;
    if (!mr) return { transcript: null, asrSource: 'none', fallback: true };
    setRecording(false);
    setProcessing(true);
    const blob: Blob = await new Promise((resolve) => {
      mr.onstop = () => resolve(new Blob(chunksRef.current, { type: 'audio/webm' }));
      mr.stop();
      mr.stream.getTracks().forEach((t) => t.stop());
    });
    try {
      const form = new FormData();
      form.append('file', blob, 'audio.webm');
      form.append('visitId', visitId);
      if (language) form.append('language', language);
      const res = await fetch('/api/intake/transcribe', { method: 'POST', body: form });
      if (!res.ok) return { transcript: null, asrSource: 'browser', fallback: true };
      const j = await res.json();
      return { transcript: j.transcript ?? null, asrSource: j.asr_source ?? 'sarvam' };
    } catch {
      return { transcript: null, asrSource: 'browser', fallback: true };
    } finally {
      setProcessing(false);
    }
  };

  return { recording, processing, start, stopAndTranscribe };
}
