'use client';

import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { Card, CardContent } from '@/components/ui/card';
import { Languages, Loader2 } from 'lucide-react';
import { AVAILABLE_LANGUAGES } from '@/lib/i18n';
import type { StructuredNote } from '@/lib/types';

/**
 * Doctor-side "read the note in my language". The stored note is always English;
 * this translates it on demand into whatever the doctor prefers, read-only, so a
 * patient's Hindi intake can be reviewed in (say) Tamil or English. Editing stays
 * on the English note elsewhere on the page.
 */
export default function DoctorNoteTranslate({ note }: { note: StructuredNote | null }) {
  const [lang, setLang] = useState('English');
  const [translated, setTranslated] = useState<StructuredNote | null>(null);

  const m = useMutation({
    mutationFn: async (target: string) => {
      const res = await fetch('/api/notes/translate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ note, language: target }),
      });
      if (!res.ok) throw new Error('translate failed');
      return (await res.json()).note as StructuredNote;
    },
    onSuccess: (n) => setTranslated(n),
  });

  const onPick = (target: string) => {
    setLang(target);
    setTranslated(null);
    if (target !== 'English' && note) m.mutate(target);
  };

  const show = lang === 'English' ? note : translated;
  const rows: [string, string | undefined][] = show
    ? [
        ['Chief complaint', show.chief_complaint],
        ['History', show.history_of_present_illness],
        ['Duration', show.duration],
        ['Severity', show.severity],
        ['Associated symptoms', (show.associated_symptoms || []).join(', ')],
        ['Current medications', (show.current_medications || []).join(', ')],
        ['Allergies', (show.allergies || []).join(', ')],
        ['Past history', (show.past_history || []).join(', ')],
      ]
    : [];

  return (
    <Card className="bg-doctor-raised border-doctor-muted/20 mb-4">
      <CardContent className="p-4">
        <div className="flex items-center justify-between gap-3">
          <p className="mono-tag text-doctor-muted text-[10px] flex items-center gap-1.5">
            <Languages className="w-3.5 h-3.5 text-doctor-accent" /> READ IN
          </p>
          <select
            value={lang}
            onChange={(e) => onPick(e.target.value)}
            className="bg-doctor-bg border border-doctor-muted/20 rounded px-2 py-1 text-sm text-doctor-text outline-none focus:border-doctor-accent"
          >
            {AVAILABLE_LANGUAGES.map((l) => (
              <option key={l.code} value={l.code}>
                {l.label} · {l.nativeLabel}
              </option>
            ))}
          </select>
        </div>

        {lang !== 'English' && (
          <div className="mt-3">
            {m.isPending ? (
              <div className="flex items-center gap-2 text-doctor-muted text-sm">
                <Loader2 className="w-4 h-4 animate-spin" /> Translating…
              </div>
            ) : m.isError ? (
              <p className="text-amber-400 text-sm">
                Translation unavailable right now — the English note above is unchanged.
              </p>
            ) : (
              <div className="space-y-2">
                {rows
                  .filter(([, v]) => v && v.trim())
                  .map(([k, v]) => (
                    <div key={k}>
                      <p className="mono-tag text-doctor-muted text-[9px]">{k}</p>
                      <p className="text-doctor-text text-sm leading-relaxed">{v}</p>
                    </div>
                  ))}
                <p className="mono-tag text-doctor-muted/70 text-[9px] pt-1">
                  MACHINE TRANSLATION · CLINICAL RECORD REMAINS IN ENGLISH
                </p>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
