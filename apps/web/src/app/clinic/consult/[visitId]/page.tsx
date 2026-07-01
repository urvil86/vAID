'use client';

import { useState, useRef, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import ClinicLayout from '@/components/ClinicLayout';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  Loader2,
  ArrowLeft,
  AlertTriangle,
  Pill,
  Printer,
  Plus,
  Trash2,
  Upload,
  FileText,
  History,
  CheckCircle,
  Search,
  X,
} from 'lucide-react';
import { StructuredNote, PrescriptionItem } from '@/lib/types';
import { FORMULARY, FREQUENCIES, DURATIONS, FormularyDrug } from '@/data/formulary';
import { fileToCompactDataUrl } from '@/lib/image';

type ConsultTab = 'note' | 'rx' | 'docs';

const EMPTY_ITEM: PrescriptionItem = {
  drug: '',
  strength: '',
  dose: '1 tablet',
  frequency: 'BD',
  duration: '5 days',
  instructions: '',
};

export default function DoctorConsultPage() {
  const params = useParams();
  const router = useRouter();
  const queryClient = useQueryClient();
  const visitId = params.visitId as string;

  const [viewMode, setViewMode] = useState<'English' | 'Native'>('English');
  const [activeTab, setActiveTab] = useState<ConsultTab>('note');
  const [rxItems, setRxItems] = useState<PrescriptionItem[]>([{ ...EMPTY_ITEM }]);
  const [advice, setAdvice] = useState('');
  const [followUpDate, setFollowUpDate] = useState('');
  const [drugSearch, setDrugSearch] = useState('');
  const [focusedRow, setFocusedRow] = useState<number | null>(null);
  const [rxSaved, setRxSaved] = useState(false);
  const [patientAge, setPatientAge] = useState<string>('');
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  // Data fetching
  const { data: visit, isLoading: visitLoading } = useQuery({
    queryKey: ['visit', visitId],
    queryFn: async () => {
      const res = await fetch(`/api/visits/${visitId}`);
      if (!res.ok) throw new Error('Visit not found');
      return res.json();
    },
  });

  const { data: session, isLoading: sessionLoading } = useQuery({
    queryKey: ['intake-session', visitId],
    queryFn: async () => {
      const res = await fetch(`/api/intake/session?visitId=${visitId}`);
      if (!res.ok) throw new Error('Session not found');
      return res.json();
    },
  });

  const { data: existingRx } = useQuery({
    queryKey: ['prescription', visitId],
    queryFn: async () => {
      const res = await fetch(`/api/prescriptions?visitId=${visitId}`);
      if (!res.ok) return { prescription: null };
      return res.json();
    },
  });

  const { data: docs, refetch: refetchDocs } = useQuery({
    queryKey: ['documents', visitId],
    queryFn: async () => {
      const res = await fetch(`/api/documents?visitId=${visitId}`);
      if (!res.ok) return { documents: [] };
      return res.json();
    },
  });

  const { data: historyVisits } = useQuery({
    queryKey: ['patient-history-strip', visit?.patient_id],
    queryFn: async () => {
      const res = await fetch(`/api/visits?patientId=${visit.patient_id}`);
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!visit?.patient_id,
  });

  const { data: patientProfile } = useQuery<{ uhid?: string; abha_id?: string } | null>({
    queryKey: ['consult-patient-profile', visit?.patient_id],
    queryFn: async () => {
      const res = await fetch(`/api/profile?userId=${visit.patient_id}`);
      if (!res.ok) return null;
      return (await res.json()).profile;
    },
    enabled: !!visit?.patient_id,
  });

  // Populate Rx form when existing prescription loads
  useEffect(() => {
    if (existingRx?.prescription) {
      const rx = existingRx.prescription;
      setRxItems(rx.items_json?.length ? rx.items_json : [{ ...EMPTY_ITEM }]);
      setAdvice(rx.advice || '');
      setFollowUpDate(rx.follow_up_date || '');
      setRxSaved(true);
    }
  }, [existingRx]);

  // Compute patient age client-side to avoid hydration mismatch
  useEffect(() => {
    if (visit?.date_of_birth) {
      const dob = new Date(visit.date_of_birth).getTime();
      const ageYears = Math.floor((Date.now() - dob) / 31557600000);
      setPatientAge(`${ageYears} yrs`);
    } else {
      setPatientAge('Age unknown');
    }
  }, [visit?.date_of_birth]);

  // When the doctor opens a ready pre-read, mark the visit CONSULT — this
  // records "patient entered the room" (consult_started_at), which powers the
  // analytics "intake complete before the patient entered" metric.
  const consultStartedRef = useRef(false);
  useEffect(() => {
    if (visit?.status === 'INTAKE COMPLETE' && !consultStartedRef.current) {
      consultStartedRef.current = true;
      fetch(`/api/visits/${visitId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'CONSULT' }),
      })
        .then(() => queryClient.invalidateQueries({ queryKey: ['visit', visitId] }))
        .catch(() => {});
    }
  }, [visit?.status, visitId, queryClient]);

  // Mark visit done
  const markDoneMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/visits/${visitId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'DONE' }),
      });
      if (!res.ok) throw new Error('Failed to update visit');
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['visit', visitId] });
      router.push('/clinic/queue');
    },
  });

  // ── Note authoring: draft → doctor edit → sign ──────────────────────────
  const [editingNote, setEditingNote] = useState(false);
  const [noteDraft, setNoteDraft] = useState<{
    chief_complaint: string;
    history_of_present_illness: string;
    duration: string;
    severity: string;
    current_medications: string;
    allergies: string;
    past_history: string;
  } | null>(null);
  const [confirmedFlags, setConfirmedFlags] = useState<string[]>([]);
  const [signError, setSignError] = useState<string | null>(null);

  const saveNoteMutation = useMutation({
    mutationFn: async (updated: StructuredNote) => {
      const res = await fetch('/api/intake/note', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId: session?.id, note: updated }),
      });
      if (!res.ok) {
        throw new Error(
          ((await res.json().catch(() => ({}))) as { error?: string }).error || 'Failed to save note'
        );
      }
      return res.json();
    },
    onSuccess: () => {
      setEditingNote(false);
      queryClient.invalidateQueries({ queryKey: ['intake-session', visitId] });
    },
  });

  const signMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch('/api/intake/sign', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId: session?.id }),
      });
      if (!res.ok) {
        throw new Error(
          ((await res.json().catch(() => ({}))) as { error?: string }).error || 'Failed to sign'
        );
      }
      return res.json();
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['intake-session', visitId] }),
    onError: (e: Error) => setSignError(e.message),
  });

  // Save prescription
  const saveRxMutation = useMutation({
    mutationFn: async () => {
      const validItems = rxItems.filter((item) => item.drug.trim());
      const existingPrescription = existingRx?.prescription;

      if (existingPrescription?.id) {
        const res = await fetch(`/api/prescriptions/${existingPrescription.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ items: validItems, advice, followUpDate }),
        });
        if (!res.ok) throw new Error('Failed to update prescription');
        return res.json();
      } else {
        const res = await fetch('/api/prescriptions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ visitId, items: validItems, advice, followUpDate }),
        });
        if (!res.ok) throw new Error('Failed to create prescription');
        return res.json();
      }
    },
    onSuccess: () => {
      setRxSaved(true);
      queryClient.invalidateQueries({ queryKey: ['prescription', visitId] });
    },
  });

  // Upload document
  const handleDocUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !visit) return;
    setUploading(true);
    try {
      const dataUrl = await fileToCompactDataUrl(file);
      await fetch('/api/documents', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          patientId: visit.patient_id,
          visitId,
          type: file.type.startsWith('image/') ? 'image' : 'lab_report',
          fileRef: dataUrl,
        }),
      });
      refetchDocs();
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  if (visitLoading || sessionLoading) {
    return (
      <ClinicLayout>
        <div className="flex h-screen items-center justify-center">
          <Loader2 className="w-6 h-6 text-doctor-accent" />
        </div>
      </ClinicLayout>
    );
  }

  const note: StructuredNote | null = session?.structured_note_json || null;
  // confidence_flags name the specific uncertain field (e.g.
  // "current_medications: name vague"); a matching flag marks that field's
  // third dot hollow with a "check" tag so the doctor knows to verify it.
  const confidenceFlags = note?.confidence_flags ?? [];
  const fieldFlagged = (field: string) =>
    confidenceFlags.some((f) => f.toLowerCase().includes(field.toLowerCase()));

  // Note lifecycle
  const noteStatus: string = (session?.note_status as string) ?? 'ai_draft';
  const isSigned = noteStatus === 'signed';
  const startEditing = () => {
    setNoteDraft({
      chief_complaint: note?.chief_complaint || '',
      history_of_present_illness: note?.history_of_present_illness || '',
      duration: note?.duration || '',
      severity: note?.severity || '',
      current_medications: (note?.current_medications || []).join('\n'),
      allergies: (note?.allergies || []).join('\n'),
      past_history: (note?.past_history || []).join('\n'),
    });
    setEditingNote(true);
  };
  const saveEditing = () => {
    if (!noteDraft || !note) return;
    const toList = (s: string) =>
      s
        .split('\n')
        .map((x) => x.trim())
        .filter(Boolean);
    saveNoteMutation.mutate({
      ...note,
      chief_complaint: noteDraft.chief_complaint.trim(),
      history_of_present_illness: noteDraft.history_of_present_illness.trim(),
      duration: noteDraft.duration.trim(),
      severity: noteDraft.severity.trim(),
      current_medications: toList(noteDraft.current_medications),
      allergies: toList(noteDraft.allergies),
      past_history: toList(noteDraft.past_history),
    });
  };
  // Confidence-flagged fields must be edited or explicitly confirmed before sign.
  const flaggedFields = [
    ...new Set(confidenceFlags.map((f) => String(f).split(':')[0].trim()).filter(Boolean)),
  ];
  const allFlagsConfirmed = flaggedFields.every((f) => confirmedFlags.includes(f));
  const canSign = !!note && allFlagsConfirmed && !editingNote;

  const pastVisits = (historyVisits || []).filter((v: Record<string, unknown>) => v.id !== visitId);
  const filteredDrugs = FORMULARY.filter(
    (d) =>
      d.name.toLowerCase().includes(drugSearch.toLowerCase()) ||
      d.category.toLowerCase().includes(drugSearch.toLowerCase())
  ).slice(0, 8);

  const addRxItem = (drug?: FormularyDrug) => {
    if (drug) {
      const newItem: PrescriptionItem = {
        drug: drug.name,
        strength: drug.strengths[0],
        dose: drug.defaultDose,
        frequency: drug.defaultFrequency,
        duration: drug.defaultDuration,
        instructions: '',
      };
      const idx = focusedRow !== null ? focusedRow : rxItems.length - 1;
      const updated = [...rxItems];
      updated[idx] = newItem;
      setRxItems(updated);
    } else {
      setRxItems([...rxItems, { ...EMPTY_ITEM }]);
    }
    setDrugSearch('');
    setFocusedRow(null);
    setRxSaved(false);
  };

  const updateItem = (idx: number, field: keyof PrescriptionItem, val: string) => {
    const updated = [...rxItems];
    updated[idx] = { ...updated[idx], [field]: val };
    setRxItems(updated);
    setRxSaved(false);
  };

  const removeItem = (idx: number) => {
    setRxItems(rxItems.filter((_, i) => i !== idx));
    setRxSaved(false);
  };

  const existingPrescription = existingRx?.prescription;
  const isDone = visit?.status === 'DONE';
  const docCount = docs?.documents?.length || 0;
  const tabLabel = `Documents (${docCount})`;

  return (
    <ClinicLayout>
      {/* Top Bar */}
      <div className="mb-4 flex items-center justify-between">
        <Button
          variant="ghost"
          className="text-doctor-muted hover:text-doctor-text"
          onClick={() => router.back()}
        >
          <ArrowLeft className="w-4 h-4 mr-2" /> Back to Queue
        </Button>
        <div className="flex items-center gap-2">
          <Badge className="bg-doctor-accent/10 text-doctor-accent border-doctor-accent/20 font-mono">
            {visit?.token_no}
          </Badge>
          <Badge
            variant={isDone ? 'default' : 'outline'}
            className={
              isDone
                ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30'
                : 'border-doctor-muted/20 text-doctor-muted'
            }
          >
            {visit?.status}
          </Badge>
        </div>
      </div>

      {/* Patient History Strip */}
      {pastVisits.length > 0 && (
        <div className="mb-4 flex items-center gap-2 overflow-x-auto pb-1">
          <span className="mono-tag text-[10px] text-doctor-muted shrink-0">History</span>
          <Button
            variant="ghost"
            size="sm"
            className="text-doctor-muted hover:text-doctor-accent text-xs shrink-0 h-7 px-2 font-mono"
            onClick={() => router.push(`/clinic/history/${visit?.patient_id}`)}
          >
            <History className="w-3 h-3 mr-1" /> All visits ({pastVisits.length})
          </Button>
          {pastVisits.slice(0, 4).map((v: Record<string, unknown>) => {
            const n = v.structured_note_json as StructuredNote | null;
            return (
              <button
                key={v.id as string}
                onClick={() => router.push(`/clinic/consult/${v.id}`)}
                className="shrink-0 bg-doctor-raised border border-doctor-muted/20 rounded-lg px-3 py-1.5 text-left hover:border-doctor-accent/40 transition-colors"
              >
                <p className="mono-tag text-[9px] text-doctor-muted">{v.token_no as string}</p>
                <p className="text-xs text-doctor-text truncate max-w-[120px]">
                  {n?.chief_complaint || '—'}
                </p>
              </button>
            );
          })}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left: Patient Profile + Pre-read */}
        <div className="lg:col-span-1 space-y-4">
          <Card className="bg-doctor-raised border-doctor-muted/20">
            <CardContent className="p-6">
              <p className="mono-tag text-doctor-muted text-[10px] mb-3">Patient Profile</p>
              <h2 className="text-2xl font-bold text-doctor-text mb-1">{visit?.patient_name}</h2>
              <p className="text-doctor-muted text-sm mb-2" suppressHydrationWarning>
                {visit?.sex || 'Not specified'} · {patientAge}
              </p>
              <div className="flex flex-wrap items-center gap-2 mb-4">
                {patientProfile?.uhid && (
                  <span className="mono-tag text-[10px] text-doctor-text bg-doctor-bg px-2 py-1 rounded">
                    {patientProfile.uhid}
                  </span>
                )}
                {patientProfile?.abha_id ? (
                  <span className="mono-tag text-[10px] text-doctor-accent bg-doctor-accent/10 px-2 py-1 rounded">
                    ABHA · {patientProfile.abha_id}
                  </span>
                ) : (
                  <span className="mono-tag text-[10px] text-doctor-muted">No ABHA linked</span>
                )}
              </div>

              <div className="space-y-3 pt-4 border-t border-doctor-muted/10">
                <div className="bg-doctor-bg p-4 rounded-lg">
                  <p className="mono-tag text-doctor-muted text-[10px] mb-2">Chief Complaint</p>
                  <p className="text-xl font-bold text-doctor-accent leading-tight">
                    {note?.chief_complaint || 'Loading...'}
                  </p>
                  {note?.associated_symptoms && note.associated_symptoms.length > 0 && (
                    <p className="text-doctor-muted text-xs mt-1">
                      {note.associated_symptoms.slice(0, 2).join(', ')}
                    </p>
                  )}
                </div>

                {note?.screen_flags && note.screen_flags.length > 0 && (
                  <div className="border border-[#56b3c9]/30 bg-[#56b3c9]/5 p-3 rounded-lg">
                    <p className="mono-tag text-[#56b3c9] text-[10px] flex items-center gap-1 mb-1">
                      <AlertTriangle className="w-3 h-3" /> For Your Attention · Doctor Only
                    </p>
                    <p className="text-sm font-bold text-doctor-text">{note.screen_flags[0]}</p>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          <div className="grid grid-cols-2 gap-3">
            <SummaryBox label="Duration" value={note?.duration} />
            <SummaryBox label="Severity" value={note?.severity} meter />
            <SummaryBox
              label="Meds"
              value={
                note?.current_medications?.length
                  ? `${note.current_medications.length} listed`
                  : 'None'
              }
            />
            <SummaryBox
              label="Allergies"
              value={note?.allergies?.length ? note.allergies[0] : 'None stated'}
            />
          </div>
        </div>

        {/* Right: Tabbed Panel */}
        <div className="lg:col-span-2 space-y-4">
          {/* Tab Bar */}
          <div className="flex gap-1 bg-doctor-raised border border-doctor-muted/20 p-1 rounded-lg">
            {[
              {
                id: 'note' as ConsultTab,
                label: 'Clinical Note',
                icon: <FileText className="w-3 h-3" />,
              },
              {
                id: 'rx' as ConsultTab,
                label: existingPrescription ? 'Rx Builder ✓' : 'Rx Builder',
                icon: <Pill className="w-3 h-3" />,
              },
              { id: 'docs' as ConsultTab, label: tabLabel, icon: <Upload className="w-3 h-3" /> },
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-1.5 flex-1 justify-center px-3 py-2 rounded-md text-xs font-mono transition-colors ${
                  activeTab === tab.id
                    ? 'bg-doctor-accent text-doctor-bg font-bold'
                    : 'text-doctor-muted hover:text-doctor-text'
                }`}
              >
                {tab.icon} {tab.label}
              </button>
            ))}
          </div>

          {/* Tab: Clinical Note */}
          {activeTab === 'note' && (
            <Card className="bg-doctor-raised border-doctor-muted/20">
              <CardContent className="p-6 space-y-2">
                {/* Note status + author controls */}
                <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
                  <div className="flex items-center gap-2">
                    {noteStatus === 'ai_draft' && (
                      <span className="mono-tag text-[10px] px-2 py-1 rounded bg-amber-500/15 text-amber-400 border border-amber-500/30">
                        AI DRAFT · NOT REVIEWED
                      </span>
                    )}
                    {noteStatus === 'doctor_reviewed' && (
                      <span className="mono-tag text-[10px] px-2 py-1 rounded bg-doctor-accent/15 text-doctor-accent border border-doctor-accent/30">
                        REVIEWED · UNSIGNED
                      </span>
                    )}
                    {isSigned && (
                      <span className="mono-tag text-[10px] px-2 py-1 rounded bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
                        SIGNED
                      </span>
                    )}
                  </div>
                  {!isSigned &&
                    viewMode === 'English' &&
                    (editingNote ? (
                      <div className="flex items-center gap-2">
                        <Button
                          size="sm"
                          onClick={saveEditing}
                          disabled={saveNoteMutation.isPending}
                          className="bg-doctor-accent text-doctor-bg font-bold gap-1"
                        >
                          {saveNoteMutation.isPending ? (
                            <Loader2 className="w-3.5 h-3.5" />
                          ) : (
                            <CheckCircle className="w-3.5 h-3.5" />
                          )}
                          Save
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => setEditingNote(false)}
                          className="text-doctor-muted"
                        >
                          Cancel
                        </Button>
                      </div>
                    ) : (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={startEditing}
                        className="border-doctor-muted/30 text-doctor-text gap-1"
                      >
                        <FileText className="w-3.5 h-3.5" /> Edit note
                      </Button>
                    ))}
                </div>

                {/* Mirror Toggle */}
                <div className="flex justify-end mb-4">
                  <div className="flex bg-doctor-bg p-1 rounded-lg border border-doctor-muted/20">
                    {(['Native', 'English'] as const).map((mode) => (
                      <button
                        key={mode}
                        onClick={() => setViewMode(mode)}
                        className={`px-3 py-1 text-xs rounded-md font-mono transition-colors ${
                          viewMode === mode
                            ? 'bg-doctor-accent text-doctor-bg font-bold'
                            : 'text-doctor-muted hover:text-doctor-text'
                        }`}
                      >
                        {mode === 'Native' ? session?.language || 'HINDI' : 'ENGLISH'}
                      </button>
                    ))}
                  </div>
                </div>

                {viewMode === 'Native' ? (
                  <div className="hindi text-xl leading-relaxed whitespace-pre-wrap text-doctor-text">
                    {session?.transcript_native || 'Transcription pending...'}
                  </div>
                ) : editingNote && noteDraft ? (
                  <div className="space-y-4">
                    <EditNoteField
                      label="Chief Complaint"
                      value={noteDraft.chief_complaint}
                      onChange={(v) => setNoteDraft({ ...noteDraft, chief_complaint: v })}
                    />
                    <EditNoteField
                      label="History of Present Illness"
                      value={noteDraft.history_of_present_illness}
                      onChange={(v) => setNoteDraft({ ...noteDraft, history_of_present_illness: v })}
                      multiline
                    />
                    <div className="grid grid-cols-2 gap-4">
                      <EditNoteField
                        label="Duration"
                        value={noteDraft.duration}
                        onChange={(v) => setNoteDraft({ ...noteDraft, duration: v })}
                      />
                      <EditNoteField
                        label="Severity"
                        value={noteDraft.severity}
                        onChange={(v) => setNoteDraft({ ...noteDraft, severity: v })}
                      />
                    </div>
                    <EditNoteField
                      label="Current Medications (one per line)"
                      value={noteDraft.current_medications}
                      onChange={(v) => setNoteDraft({ ...noteDraft, current_medications: v })}
                      multiline
                    />
                    <EditNoteField
                      label="Known Allergies (one per line)"
                      value={noteDraft.allergies}
                      onChange={(v) => setNoteDraft({ ...noteDraft, allergies: v })}
                      multiline
                    />
                    <EditNoteField
                      label="Past Medical History (one per line)"
                      value={noteDraft.past_history}
                      onChange={(v) => setNoteDraft({ ...noteDraft, past_history: v })}
                      multiline
                    />
                    <p className="text-[11px] text-doctor-muted">
                      You are editing the note as the treating doctor. The patient&apos;s transcript
                      (MIRROR) stays unchanged.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-6">
                    <NoteSection
                      title="History of Present Illness"
                      value={note?.history_of_present_illness}
                      flagged={fieldFlagged('history_of_present_illness')}
                    />
                    <NoteSection
                      title="Associated Symptoms"
                      items={note?.associated_symptoms}
                      flagged={fieldFlagged('associated_symptoms')}
                    />
                    <div className="grid grid-cols-2 gap-6">
                      <NoteSection
                        title="Current Medications"
                        items={note?.current_medications}
                        icon={<Pill className="w-3 h-3" />}
                        flagged={fieldFlagged('current_medications') || fieldFlagged('medication')}
                      />
                      <NoteSection
                        title="Known Allergies"
                        items={note?.allergies}
                        flagged={fieldFlagged('allergies')}
                      />
                    </div>
                    <NoteSection
                      title="Past Medical History"
                      items={note?.past_history}
                      flagged={fieldFlagged('past_history')}
                    />
                    {note?.icd10_suggestions && note.icd10_suggestions.length > 0 && (
                      <div className="pt-4 border-t border-doctor-muted/10">
                        <p className="mono-tag text-doctor-muted text-[10px] mb-3">
                          Coding Hints · ICD-10
                        </p>
                        <div className="flex flex-wrap gap-2">
                          {note.icd10_suggestions.map((hint, i) => (
                            <Badge
                              key={i}
                              variant="outline"
                              className="border-doctor-muted/30 text-doctor-muted bg-doctor-bg px-2 py-1 font-mono text-[10px]"
                            >
                              {hint.code} · {hint.term}
                            </Badge>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* Tab: Rx Builder */}
          {activeTab === 'rx' && (
            <div className="space-y-4">
              {/* Formulary Search */}
              <Card className="bg-doctor-raised border-doctor-muted/20">
                <CardContent className="p-4">
                  <p className="mono-tag text-doctor-muted text-[10px] mb-3">Formulary Search</p>
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-doctor-muted" />
                    <Input
                      value={drugSearch}
                      onChange={(e) => setDrugSearch(e.target.value)}
                      placeholder="Search drug or category..."
                      className="pl-10 bg-doctor-bg border-doctor-muted/20 text-doctor-text placeholder:text-doctor-muted text-sm"
                    />
                    {drugSearch && (
                      <button
                        onClick={() => setDrugSearch('')}
                        className="absolute right-3 top-1/2 -translate-y-1/2"
                      >
                        <X className="w-4 h-4 text-doctor-muted" />
                      </button>
                    )}
                  </div>
                  {drugSearch && filteredDrugs.length > 0 && (
                    <div className="mt-2 grid grid-cols-2 gap-2">
                      {filteredDrugs.map((drug) => (
                        <button
                          key={drug.name}
                          onClick={() => addRxItem(drug)}
                          className="text-left bg-doctor-bg border border-doctor-muted/20 rounded-lg p-3 hover:border-doctor-accent/40 transition-colors"
                        >
                          <p className="text-sm font-semibold text-doctor-text">{drug.name}</p>
                          <p className="mono-tag text-[10px] text-doctor-muted">
                            {drug.category} · {drug.strengths.join(', ')}
                          </p>
                        </button>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Prescription Items */}
              <Card className="bg-doctor-raised border-doctor-muted/20">
                <CardContent className="p-4 space-y-3">
                  <div className="flex items-center justify-between mb-2">
                    <p className="mono-tag text-doctor-muted text-[10px]">Prescription Items</p>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => addRxItem()}
                      className="text-doctor-accent hover:text-doctor-accent/80 text-xs h-7 gap-1"
                    >
                      <Plus className="w-3 h-3" /> Add Row
                    </Button>
                  </div>

                  {rxItems.map((item, idx) => (
                    <div
                      key={idx}
                      className="bg-doctor-bg rounded-lg p-3 border border-doctor-muted/10 space-y-2"
                    >
                      <div className="flex gap-2 items-start">
                        <span className="mono-tag text-[10px] text-doctor-muted w-4 pt-2 shrink-0">
                          {idx + 1}.
                        </span>
                        <div className="flex-1 grid grid-cols-2 gap-2">
                          <Input
                            value={item.drug}
                            onChange={(e) => updateItem(idx, 'drug', e.target.value)}
                            onFocus={() => setFocusedRow(idx)}
                            placeholder="Drug name"
                            className="bg-doctor-raised border-doctor-muted/20 text-doctor-text placeholder:text-doctor-muted text-sm col-span-2"
                          />
                          <Input
                            value={item.strength}
                            onChange={(e) => updateItem(idx, 'strength', e.target.value)}
                            placeholder="Strength"
                            className="bg-doctor-raised border-doctor-muted/20 text-doctor-text placeholder:text-doctor-muted text-sm"
                          />
                          <Input
                            value={item.dose}
                            onChange={(e) => updateItem(idx, 'dose', e.target.value)}
                            placeholder="Dose"
                            className="bg-doctor-raised border-doctor-muted/20 text-doctor-text placeholder:text-doctor-muted text-sm"
                          />
                          <div className="flex gap-2">
                            <select
                              value={item.frequency}
                              onChange={(e) => updateItem(idx, 'frequency', e.target.value)}
                              className="flex-1 bg-doctor-raised border border-doctor-muted/20 rounded-md text-doctor-text text-sm px-2 py-1.5"
                            >
                              {FREQUENCIES.map((f) => (
                                <option key={f} value={f}>
                                  {f}
                                </option>
                              ))}
                            </select>
                            <select
                              value={item.duration}
                              onChange={(e) => updateItem(idx, 'duration', e.target.value)}
                              className="flex-1 bg-doctor-raised border border-doctor-muted/20 rounded-md text-doctor-text text-sm px-2 py-1.5"
                            >
                              {DURATIONS.map((d) => (
                                <option key={d} value={d}>
                                  {d}
                                </option>
                              ))}
                            </select>
                          </div>
                          <Input
                            value={item.instructions}
                            onChange={(e) => updateItem(idx, 'instructions', e.target.value)}
                            placeholder="Instructions (e.g., after meals)"
                            className="bg-doctor-raised border-doctor-muted/20 text-doctor-text placeholder:text-doctor-muted text-sm col-span-2"
                          />
                        </div>
                        <button
                          onClick={() => removeItem(idx)}
                          className="pt-2 text-doctor-muted hover:text-red-400 transition-colors"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  ))}
                </CardContent>
              </Card>

              {/* Advice + Follow-up */}
              <Card className="bg-doctor-raised border-doctor-muted/20">
                <CardContent className="p-4 space-y-3">
                  <div>
                    <p className="mono-tag text-doctor-muted text-[10px] mb-2">General Advice</p>
                    <Textarea
                      value={advice}
                      onChange={(e) => {
                        setAdvice(e.target.value);
                        setRxSaved(false);
                      }}
                      placeholder="e.g., Take rest, drink plenty of fluids, avoid cold food..."
                      className="bg-doctor-bg border-doctor-muted/20 text-doctor-text placeholder:text-doctor-muted text-sm min-h-[80px]"
                    />
                  </div>
                  <div>
                    <p className="mono-tag text-doctor-muted text-[10px] mb-2">Follow-up Date</p>
                    <Input
                      type="date"
                      value={followUpDate}
                      onChange={(e) => {
                        setFollowUpDate(e.target.value);
                        setRxSaved(false);
                      }}
                      className="bg-doctor-bg border-doctor-muted/20 text-doctor-text text-sm max-w-[200px]"
                    />
                  </div>
                </CardContent>
              </Card>

              {/* Rx Actions */}
              <div className="flex gap-3 justify-end">
                {existingPrescription?.id && (
                  <Button
                    variant="outline"
                    className="border-doctor-muted/20 text-doctor-text gap-2"
                    onClick={() =>
                      window.open(`/clinic/prescription/${existingPrescription.id}`, '_blank')
                    }
                  >
                    <Printer className="w-4 h-4" /> Print / Share
                  </Button>
                )}
                <Button
                  onClick={() => saveRxMutation.mutate()}
                  disabled={saveRxMutation.isPending}
                  className="bg-doctor-accent hover:bg-doctor-accent/90 text-doctor-bg font-bold gap-2"
                >
                  {saveRxMutation.isPending ? (
                    <Loader2 className="w-4 h-4" />
                  ) : rxSaved ? (
                    <CheckCircle className="w-4 h-4" />
                  ) : (
                    <Pill className="w-4 h-4" />
                  )}
                  {rxSaved ? 'Prescription Saved' : 'Save Prescription'}
                </Button>
              </div>
            </div>
          )}

          {/* Tab: Documents */}
          {activeTab === 'docs' && (
            <div className="space-y-4">
              <Card className="bg-doctor-raised border-doctor-muted/20">
                <CardContent className="p-6">
                  <p className="mono-tag text-doctor-muted text-[10px] mb-4">
                    Upload Lab Report / Document
                  </p>
                  <div
                    className="border-2 border-dashed border-doctor-muted/20 rounded-xl p-8 text-center cursor-pointer hover:border-doctor-accent/40 transition-colors"
                    onClick={() => fileRef.current?.click()}
                  >
                    <Upload className="w-8 h-8 text-doctor-muted mx-auto mb-3" />
                    <p className="text-doctor-text font-semibold mb-1">Click to upload</p>
                    <p className="text-doctor-muted text-sm">
                      Lab reports, images, prescriptions · PDF, PNG, JPG
                    </p>
                    {uploading && (
                      <div className="flex items-center justify-center gap-2 mt-3 text-doctor-accent">
                        <Loader2 className="w-4 h-4" />
                        <span className="text-sm">Uploading...</span>
                      </div>
                    )}
                  </div>
                  <input
                    ref={fileRef}
                    type="file"
                    accept="image/*,.pdf"
                    className="hidden"
                    onChange={handleDocUpload}
                  />
                </CardContent>
              </Card>

              {docs?.documents && docs.documents.length > 0 ? (
                <div className="space-y-3">
                  <p className="mono-tag text-doctor-muted text-[10px]">Uploaded Documents</p>
                  {docs.documents.map((doc: Record<string, unknown>) => {
                    const ref = doc.file_ref as string;
                    const docType = (doc.type as string) || '';
                    const isImage =
                      docType.includes('image') ||
                      docType.includes('upload') ||
                      ref?.startsWith('data:image');
                    return (
                      <Card
                        key={doc.id as string}
                        className="bg-doctor-raised border-doctor-muted/20 overflow-hidden"
                      >
                        <CardContent className="p-4 space-y-3">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-3">
                              <div className="w-10 h-10 bg-doctor-bg rounded-lg flex items-center justify-center">
                                <FileText className="w-5 h-5 text-doctor-accent" />
                              </div>
                              <div>
                                <p className="text-doctor-text text-sm font-semibold capitalize">
                                  {docType.replace('_', ' ') || 'Document'}
                                </p>
                                <p className="mono-tag text-[10px] text-doctor-muted">
                                  {(doc.created_at as string).slice(0, 10)}
                                </p>
                              </div>
                            </div>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="text-doctor-accent hover:text-doctor-accent/80 text-xs"
                              onClick={() => window.open(ref, '_blank')}
                            >
                              Open
                            </Button>
                          </div>
                          {isImage && (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={ref}
                              alt="patient document"
                              className="w-full max-h-72 object-contain rounded-lg border border-doctor-muted/20 bg-doctor-bg"
                            />
                          )}
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>
              ) : (
                <Card className="bg-doctor-raised border-doctor-muted/20">
                  <CardContent className="p-8 text-center">
                    <p className="text-doctor-muted text-sm">
                      No documents uploaded for this visit.
                    </p>
                  </CardContent>
                </Card>
              )}
            </div>
          )}

          {/* Bottom Action — two-step: Review & Sign, then Close Visit */}
          {!isDone && (
            <div className="pb-12 space-y-3">
              {!isSigned && flaggedFields.length > 0 && (
                <div className="bg-doctor-raised border border-amber-500/30 rounded-lg p-4">
                  <p className="mono-tag text-amber-400 text-[10px] mb-2">
                    CONFIRM LOW-CONFIDENCE FIELDS BEFORE SIGNING
                  </p>
                  <div className="flex flex-col gap-2">
                    {flaggedFields.map((f) => (
                      <label
                        key={f}
                        className="flex items-center gap-2 text-sm text-doctor-text cursor-pointer"
                      >
                        <input
                          type="checkbox"
                          checked={confirmedFlags.includes(f)}
                          onChange={(e) =>
                            setConfirmedFlags((prev) =>
                              e.target.checked ? [...prev, f] : prev.filter((x) => x !== f)
                            )
                          }
                        />
                        <span className="capitalize">{f.replace(/_/g, ' ')}</span>
                        <span className="text-doctor-muted text-xs">— checked / corrected</span>
                      </label>
                    ))}
                  </div>
                </div>
              )}

              {signError && <p className="text-sm text-red-400 text-right">{signError}</p>}

              <div className="flex justify-end">
                {!isSigned ? (
                  <Button
                    onClick={() => {
                      setSignError(null);
                      signMutation.mutate();
                    }}
                    disabled={signMutation.isPending || !canSign}
                    className="bg-doctor-accent hover:bg-doctor-accent/90 text-doctor-bg font-bold gap-2 disabled:opacity-50"
                    title={
                      editingNote
                        ? 'Save your edits first'
                        : !canSign
                          ? 'Confirm the flagged fields first'
                          : 'Sign the note'
                    }
                  >
                    {signMutation.isPending ? (
                      <Loader2 className="w-4 h-4" />
                    ) : (
                      <CheckCircle className="w-4 h-4" />
                    )}
                    Review &amp; Sign Note
                  </Button>
                ) : (
                  <Button
                    onClick={() => markDoneMutation.mutate()}
                    disabled={markDoneMutation.isPending}
                    className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold gap-2"
                  >
                    {markDoneMutation.isPending ? (
                      <Loader2 className="w-4 h-4" />
                    ) : (
                      <CheckCircle className="w-4 h-4" />
                    )}
                    Close Visit
                  </Button>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </ClinicLayout>
  );
}

function EditNoteField({
  label,
  value,
  onChange,
  multiline,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  multiline?: boolean;
}) {
  return (
    <div>
      <p className="mono-tag text-doctor-muted text-[10px] mb-1.5">{label}</p>
      {multiline ? (
        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          rows={Math.max(2, value.split('\n').length)}
          className="w-full bg-doctor-bg border border-doctor-muted/20 rounded-lg px-3 py-2 text-sm text-doctor-text outline-none focus:border-doctor-accent resize-none leading-relaxed"
        />
      ) : (
        <input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="w-full bg-doctor-bg border border-doctor-muted/20 rounded-lg px-3 py-2 text-sm text-doctor-text outline-none focus:border-doctor-accent"
        />
      )}
    </div>
  );
}

function SummaryBox({ label, value, meter }: { label: string; value?: string; meter?: boolean }) {
  return (
    <div className="bg-doctor-raised border border-doctor-muted/20 p-4 rounded-lg">
      <p className="mono-tag text-doctor-muted text-[10px] mb-2">{label}</p>
      <p className="text-sm font-bold text-doctor-text leading-tight">{value || '—'}</p>
      {meter && (
        <div className="flex gap-1 mt-2">
          {[1, 2, 3, 4].map((i) => (
            <div
              key={i}
              className={`h-1 flex-1 rounded-full ${i <= 3 ? 'bg-doctor-accent' : 'bg-doctor-muted/20'}`}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function NoteSection({
  title,
  value,
  items,
  flagged,
  icon,
}: {
  title: string;
  value?: string;
  items?: string[];
  flagged?: boolean;
  icon?: React.ReactNode;
}) {
  if (!value && (!items || items.length === 0)) return null;
  // Three-dot confidence meter: solid when the model was confident; a hollow
  // third dot + "check" tag when this field is in confidence_flags.
  const solidDots = flagged ? 2 : 3;
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <p className="mono-tag text-doctor-muted text-[10px] flex items-center gap-2">
          {icon} {title}
        </p>
        <div className="flex items-center gap-1.5">
          {flagged && (
            <span className="mono-tag text-[9px] text-amber-400/90">check</span>
          )}
          <div className="flex gap-0.5">
            {[1, 2, 3].map((i) => (
              <div
                key={i}
                className={`w-1.5 h-1.5 rounded-full ${
                  i <= solidDots ? 'bg-doctor-accent' : 'border border-amber-400/70'
                }`}
              />
            ))}
          </div>
        </div>
      </div>
      {value && <p className="text-doctor-text leading-relaxed">{value}</p>}
      {items && items.length > 0 && (
        <ul className="list-disc list-inside text-doctor-text space-y-1">
          {items.map((item, i) => (
            <li key={i}>{item}</li>
          ))}
        </ul>
      )}
    </div>
  );
}
