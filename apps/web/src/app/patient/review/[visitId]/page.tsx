'use client';

import { useParams, useRouter } from 'next/navigation';
import PatientLayout from '@/components/PatientLayout';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { useQuery, useMutation } from '@tanstack/react-query';
import { Loader2, Camera } from 'lucide-react';
import { StructuredNote } from '@/lib/types';
import { useState, useEffect, useRef } from 'react';
import { getStrings, LANG_STORAGE_KEY } from '@/lib/i18n';
import { fileToCompactDataUrl } from '@/lib/image';

type ReviewForm = {
  chief_complaint: string;
  duration: string;
  severity: string;
  medications: string; // one per line
  allergies: string; // one per line
};

export default function PatientReviewPage() {
  const params = useParams();
  const router = useRouter();
  const visitId = params.visitId as string;
  const [language, setLanguage] = useState('Hindi');
  const [form, setForm] = useState<ReviewForm | null>(null);
  const [saving, setSaving] = useState(false);
  const [uploads, setUploads] = useState<string[]>([]);
  const [uploadingDoc, setUploadingDoc] = useState(false);
  const triggered = useRef(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const lang = localStorage.getItem(LANG_STORAGE_KEY);
    if (lang) setLanguage(lang);
  }, []);

  const s = getStrings(language);
  const isHindi = language === 'Hindi';

  const { data: session, isLoading } = useQuery({
    queryKey: ['intake-session', visitId],
    queryFn: async () => {
      const res = await fetch(`/api/intake/session?visitId=${visitId}`);
      if (!res.ok) throw new Error('Session not found');
      return res.json();
    },
  });

  const note: StructuredNote | null = session?.structured_note_json || null;

  const structureMutation = useMutation({
    mutationFn: async (sessionId: string) => {
      const res = await fetch('/api/intake/structure', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId }),
      });
      return res.json() as Promise<StructuredNote>;
    },
  });

  // Generate the note once if the session has a transcript but no note yet.
  useEffect(() => {
    if (session && !note && !triggered.current) {
      triggered.current = true;
      structureMutation.mutate(session.id);
    }
  }, [session, note, structureMutation]);

  const finalNote: StructuredNote | null = note || structureMutation.data || null;

  // Seed the editable form once the note is available.
  useEffect(() => {
    if (finalNote && !form) {
      setForm({
        chief_complaint: finalNote.chief_complaint || '',
        duration: finalNote.duration || '',
        severity: finalNote.severity || '',
        medications: (finalNote.current_medications || []).join('\n'),
        allergies: (finalNote.allergies || []).join('\n'),
      });
    }
  }, [finalNote, form]);

  const onConfirm = async () => {
    if (!form || !session) return;
    setSaving(true);
    const toList = (v: string) =>
      v
        .split('\n')
        .map((x) => x.trim())
        .filter(Boolean);
    const updated: StructuredNote = {
      ...(finalNote as StructuredNote),
      chief_complaint: form.chief_complaint.trim(),
      duration: form.duration.trim(),
      severity: form.severity.trim(),
      current_medications: toList(form.medications),
      allergies: toList(form.allergies),
    };
    try {
      // Persist the patient's edits before submitting (non-blocking on failure).
      await fetch('/api/intake/structure', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId: session.id, note: updated }),
      });
    } catch {
      /* ignore — don't trap the patient if the save fails */
    }
    router.push('/patient/success');
  };

  const onPickFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingDoc(true);
    try {
      const dataUrl = await fileToCompactDataUrl(file);
      // Server derives the patient from the visit; the doc shows in the clinic
      // console's Documents tab for this visit.
      await fetch('/api/documents', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ visitId, type: 'patient_upload', fileRef: dataUrl }),
      });
      setUploads((u) => [...u, dataUrl]);
    } catch {
      /* ignore — attaching a report is optional */
    } finally {
      setUploadingDoc(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  if (isLoading || !finalNote || !form) {
    return (
      <PatientLayout>
        <div className="flex-1 flex flex-col items-center justify-center p-6 text-center space-y-4">
          <Loader2 className="w-10 h-10 text-patient-accent animate-spin" />
          <p className={`text-xl font-bold ${isHindi ? 'hindi' : ''}`}>{s.organizingText}</p>
          <p className="text-patient-muted">{s.organizingSubtext}</p>
        </div>
      </PatientLayout>
    );
  }

  const set =
    (k: keyof ReviewForm) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      setForm({ ...form, [k]: e.target.value });

  return (
    <PatientLayout>
      <div className="flex-1 p-6 flex flex-col">
        <div className="mb-6">
          <p className="mono-tag text-patient-muted mb-2">{s.reviewLabel}</p>
          <h1 className={`text-2xl font-bold ${isHindi ? 'hindi' : ''}`}>{s.reviewHeading}</h1>
          <p className={`text-patient-muted mt-1 ${isHindi ? 'hindi text-base' : 'text-sm'}`}>
            {s.reviewSubheading} {isHindi ? '(आप यहाँ बदल सकते हैं)' : '(you can edit it here)'}
          </p>
        </div>

        <div className="flex-1 space-y-4 overflow-y-auto pb-8">
          <EditField label={s.chiefComplaint} value={form.chief_complaint} onChange={set('chief_complaint')} isHindi={isHindi} />
          <EditField label={s.duration} value={form.duration} onChange={set('duration')} isHindi={isHindi} />
          <EditField label={s.severity} value={form.severity} onChange={set('severity')} isHindi={isHindi} multiline />
          <EditField label={s.medications} value={form.medications} onChange={set('medications')} isHindi={isHindi} multiline />
          <EditField label={s.allergies} value={form.allergies} onChange={set('allergies')} isHindi={isHindi} multiline />

          {/* Attach reports (optional) — saved to this visit for the doctor */}
          <div className="space-y-3 pt-2">
            <p className="mono-tag text-patient-muted text-[10px]">
              {isHindi ? 'रिपोर्ट जोड़ें (वैकल्पिक)' : 'ATTACH REPORTS (OPTIONAL)'}
            </p>
            {uploads.length > 0 && (
              <div className="grid grid-cols-3 gap-2">
                {uploads.map((u, i) => (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    key={i}
                    src={u}
                    alt="report"
                    className="w-full h-24 object-cover rounded-xl border border-patient-border"
                  />
                ))}
              </div>
            )}
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploadingDoc}
              className="w-full h-14 rounded-2xl border-2 border-dashed border-patient-border text-patient-muted flex items-center justify-center gap-2 hover:border-patient-accent hover:text-patient-accent transition-colors disabled:opacity-60"
            >
              {uploadingDoc ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : (
                <>
                  <Camera className="w-5 h-5" />
                  <span className={isHindi ? 'hindi' : ''}>
                    {isHindi ? 'रिपोर्ट की फ़ोटो लें या अपलोड करें' : 'Take or upload a report photo'}
                  </span>
                </>
              )}
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              capture="environment"
              className="hidden"
              onChange={onPickFile}
            />
          </div>
        </div>

        <div className="pt-4">
          <Button
            onClick={onConfirm}
            disabled={saving}
            className={`w-full h-14 bg-patient-accent hover:bg-patient-accent/90 text-white text-lg font-bold rounded-full disabled:opacity-60 ${isHindi ? 'hindi' : ''}`}
          >
            {saving ? <Loader2 className="w-5 h-5 animate-spin" /> : s.confirmButton}
          </Button>
        </div>
      </div>
    </PatientLayout>
  );
}

function EditField({
  label,
  value,
  onChange,
  isHindi,
  multiline,
}: {
  label: string;
  value: string;
  onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => void;
  isHindi: boolean;
  multiline?: boolean;
}) {
  return (
    <Card className="bg-patient-card border-patient-border focus-within:border-patient-accent transition-colors">
      <CardContent className="p-4">
        <p className="mono-tag text-patient-muted text-[10px] mb-2">{label}</p>
        {multiline ? (
          <textarea
            value={value}
            onChange={onChange}
            rows={Math.max(1, value.split('\n').length)}
            placeholder="—"
            className={`w-full bg-transparent resize-none text-lg font-medium text-patient-ink placeholder:text-patient-muted/40 outline-none leading-relaxed ${isHindi ? 'hindi' : ''}`}
          />
        ) : (
          <input
            value={value}
            onChange={onChange}
            placeholder="—"
            className={`w-full bg-transparent text-lg font-medium text-patient-ink placeholder:text-patient-muted/40 outline-none ${isHindi ? 'hindi' : ''}`}
          />
        )}
      </CardContent>
    </Card>
  );
}
