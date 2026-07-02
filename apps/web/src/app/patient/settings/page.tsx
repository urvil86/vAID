'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import PatientLayout from '@/components/PatientLayout';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { authClient } from '@/lib/auth-client';
import { AVAILABLE_LANGUAGES, LANG_STORAGE_KEY, isLanguageEnabled } from '@/lib/i18n';
import { downloadRecordPdf } from '@/lib/record-pdf';
import { Loader2, Star, Trash2, Plus, LogOut, Download, BadgeCheck } from 'lucide-react';

type Clinic = { id: string; name: string };
type Fav = { clinic_id: string; name: string };

const CURRENT_YEAR = new Date().getFullYear();

export default function PatientSettingsPage() {
  const router = useRouter();
  const qc = useQueryClient();
  const { data: session, isPending } = authClient.useSession();

  useEffect(() => {
    if (!isPending && !session) router.push('/account/signin?callbackUrl=/patient/settings');
  }, [isPending, session, router]);

  const { data: profile } = useQuery<{
    name?: string;
    date_of_birth?: string;
    sex?: string;
    preferred_language?: string;
  } | null>({
    queryKey: ['profile-settings'],
    queryFn: async () => (await fetch('/api/profile')).json().then((j) => j.profile),
    enabled: !!session,
  });
  const { data: favData } = useQuery<{ favorites: Fav[] }>({
    queryKey: ['favorites'],
    queryFn: async () => (await fetch('/api/favorites')).json(),
    enabled: !!session,
  });
  const { data: clinics } = useQuery<Clinic[]>({
    queryKey: ['clinics'],
    queryFn: async () => (await fetch('/api/clinics')).json(),
  });

  const [name, setName] = useState('');
  // DOB is captured as day / month / year (Indian date order) and composed
  // into an ISO date only on save.
  const [dobD, setDobD] = useState('');
  const [dobM, setDobM] = useState('');
  const [dobY, setDobY] = useState('');
  const [sex, setSex] = useState('');
  const [lang, setLang] = useState('Hindi');
  const [saved, setSaved] = useState(false);
  const [addSel, setAddSel] = useState('');

  useEffect(() => {
    if (!profile) return;
    setName(profile.name || '');
    const iso = profile.date_of_birth ? String(profile.date_of_birth).slice(0, 10) : '';
    const [y, m, d] = iso ? iso.split('-') : ['', '', ''];
    setDobY(y || '');
    setDobM(m ? String(Number(m)) : '');
    setDobD(d ? String(Number(d)) : '');
    setSex(profile.sex || '');
    setLang(profile.preferred_language || 'Hindi');
  }, [profile]);

  const saveProfile = useMutation({
    mutationFn: async () => {
      const dob =
        dobY && dobM && dobD
          ? `${dobY}-${dobM.padStart(2, '0')}-${dobD.padStart(2, '0')}`
          : null;
      await fetch('/api/profile', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, dateOfBirth: dob, sex: sex || null, preferredLanguage: lang }),
      });
      if (typeof window !== 'undefined') localStorage.setItem(LANG_STORAGE_KEY, lang);
    },
    onSuccess: () => {
      setSaved(true);
      qc.invalidateQueries({ queryKey: ['profile-settings'] });
      setTimeout(() => setSaved(false), 2000);
    },
  });

  const addFav = useMutation({
    mutationFn: async (clinicId: string) => {
      await fetch('/api/favorites', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clinicId }),
      });
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['favorites'] }),
  });
  const removeFav = useMutation({
    mutationFn: async (clinicId: string) => {
      await fetch(`/api/favorites?clinicId=${clinicId}`, { method: 'DELETE' });
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['favorites'] }),
  });

  if (isPending) {
    return (
      <PatientLayout>
        <div className="flex-1 flex items-center justify-center">
          <Loader2 className="animate-spin text-patient-accent w-6 h-6" />
        </div>
      </PatientLayout>
    );
  }

  const favorites = favData?.favorites || [];
  const favIds = new Set(favorites.map((f) => f.clinic_id));
  const otherClinics = (Array.isArray(clinics) ? clinics : []).filter((c) => !favIds.has(c.id));
  const inputCls =
    'w-full rounded-xl border border-patient-border bg-white px-3 h-12 text-[16px] text-patient-ink outline-none focus:border-patient-accent transition-colors';

  return (
    <PatientLayout>
      <div className="flex-1 p-6 flex flex-col gap-5 overflow-y-auto pb-10">
        <div>
          <p className="mono-tag text-patient-muted mb-1">ACCOUNT</p>
          <h1 className="text-2xl font-bold text-patient-ink">Settings</h1>
        </div>

        {/* Profile + language */}
        <Card className="bg-patient-card border-patient-border">
          <CardContent className="p-4 space-y-3">
            <p className="mono-tag text-patient-muted text-[10px]">YOUR DETAILS</p>
            <label className="block space-y-1">
              <span className="text-sm font-medium text-patient-ink">Name</span>
              <input value={name} onChange={(e) => setName(e.target.value)} className={inputCls} />
            </label>
            <div className="grid grid-cols-2 gap-3">
              <div className="block space-y-1">
                <span className="text-sm font-medium text-patient-ink">Date of birth</span>
                <div className="grid grid-cols-3 gap-2">
                  <select value={dobD} onChange={(e) => setDobD(e.target.value)} className={inputCls} aria-label="Day">
                    <option value="">Day</option>
                    {Array.from({ length: 31 }, (_, i) => String(i + 1)).map((d) => (
                      <option key={d} value={d}>{d}</option>
                    ))}
                  </select>
                  <select value={dobM} onChange={(e) => setDobM(e.target.value)} className={inputCls} aria-label="Month">
                    <option value="">Month</option>
                    {['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'].map(
                      (label, i) => (
                        <option key={label} value={String(i + 1)}>{label}</option>
                      )
                    )}
                  </select>
                  <select value={dobY} onChange={(e) => setDobY(e.target.value)} className={inputCls} aria-label="Year">
                    <option value="">Year</option>
                    {Array.from({ length: 110 }, (_, i) => String(CURRENT_YEAR - i)).map((y) => (
                      <option key={y} value={y}>{y}</option>
                    ))}
                  </select>
                </div>
              </div>
              <label className="block space-y-1">
                <span className="text-sm font-medium text-patient-ink">Sex</span>
                <select value={sex} onChange={(e) => setSex(e.target.value)} className={inputCls}>
                  <option value="">—</option>
                  <option value="Male">Male</option>
                  <option value="Female">Female</option>
                  <option value="Other">Other</option>
                </select>
              </label>
            </div>
            <label className="block space-y-1">
              <span className="text-sm font-medium text-patient-ink">Preferred language</span>
              <select value={lang} onChange={(e) => setLang(e.target.value)} className={inputCls}>
                {AVAILABLE_LANGUAGES.map((l) => (
                  <option key={l.code} value={l.code} disabled={!isLanguageEnabled(l.code)}>
                    {l.label} · {l.nativeLabel}
                    {isLanguageEnabled(l.code) ? '' : ' (coming soon)'}
                  </option>
                ))}
              </select>
            </label>
            <Button
              onClick={() => saveProfile.mutate()}
              disabled={saveProfile.isPending}
              className="w-full h-12 bg-patient-accent hover:bg-patient-accent/90 text-white font-bold rounded-full"
            >
              {saveProfile.isPending ? <Loader2 className="w-5 h-5 animate-spin" /> : saved ? 'Saved ✓' : 'Save'}
            </Button>
          </CardContent>
        </Card>

        {/* Favourite clinics */}
        <Card className="bg-patient-card border-patient-border">
          <CardContent className="p-4 space-y-3">
            <p className="mono-tag text-patient-muted text-[10px] flex items-center gap-1.5">
              <Star className="w-3.5 h-3.5 text-patient-accent" /> FAVOURITE CLINICS
            </p>
            {favorites.length === 0 && (
              <p className="text-patient-muted text-sm">No favourites yet. Add one below for quick check-in.</p>
            )}
            {favorites.map((f) => (
              <div key={f.clinic_id} className="flex items-center justify-between gap-2">
                <button
                  onClick={() => router.push(`/patient/check-in/${f.clinic_id}`)}
                  className="text-left text-patient-ink font-medium hover:text-patient-accent"
                >
                  {f.name}
                </button>
                <button
                  onClick={() => removeFav.mutate(f.clinic_id)}
                  className="text-patient-muted hover:text-red-600"
                  aria-label={`Remove ${f.name}`}
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))}
            <div className="pt-3 border-t border-patient-border space-y-2">
              <p className="mono-tag text-patient-muted text-[10px]">ADD A CLINIC</p>
              {otherClinics.length > 0 ? (
                <div className="flex gap-2">
                  <select
                    value={addSel}
                    onChange={(e) => setAddSel(e.target.value)}
                    className={inputCls}
                    aria-label="Choose a clinic to add"
                  >
                    <option value="">Choose a clinic…</option>
                    {otherClinics.map((c) => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                  <button
                    onClick={() => {
                      if (addSel) {
                        addFav.mutate(addSel);
                        setAddSel('');
                      }
                    }}
                    disabled={!addSel}
                    className="shrink-0 h-12 px-4 rounded-xl bg-patient-accent text-white font-semibold flex items-center gap-1.5 disabled:opacity-40"
                  >
                    <Plus className="w-4 h-4" /> Add
                  </button>
                </div>
              ) : (
                <p className="text-sm text-patient-muted">
                  All available clinics are already in your favourites.
                </p>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Account actions */}
        <Card className="bg-patient-card border-patient-border">
          <CardContent className="p-4 space-y-3">
            <p className="mono-tag text-patient-muted text-[10px]">ACCOUNT</p>
            <button
              onClick={() => router.push('/patient/abdm')}
              className="flex items-center gap-2 text-sm font-semibold text-patient-ink hover:text-patient-accent"
            >
              <BadgeCheck className="w-4 h-4" /> Health ID (ABHA)
            </button>
            <button
              onClick={() => void downloadRecordPdf()}
              className="flex items-center gap-2 text-sm font-semibold text-patient-ink hover:text-patient-accent"
            >
              <Download className="w-4 h-4" /> Download my record (PDF)
            </button>
            <button
              onClick={async () => {
                await authClient.signOut();
                router.push('/');
              }}
              className="flex items-center gap-2 text-sm font-semibold text-red-600 hover:underline"
            >
              <LogOut className="w-4 h-4" /> Sign out
            </button>
          </CardContent>
        </Card>
      </div>
    </PatientLayout>
  );
}
