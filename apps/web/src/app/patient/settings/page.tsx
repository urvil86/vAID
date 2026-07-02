'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import PatientLayout from '@/components/PatientLayout';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { authClient } from '@/lib/auth-client';
import { AVAILABLE_LANGUAGES, LANG_STORAGE_KEY } from '@/lib/i18n';
import { Loader2, Star, Trash2, Plus, LogOut, Download, BadgeCheck } from 'lucide-react';

type Clinic = { id: string; name: string };
type Fav = { clinic_id: string; name: string };

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
  const [dob, setDob] = useState('');
  const [sex, setSex] = useState('');
  const [lang, setLang] = useState('Hindi');
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (!profile) return;
    setName(profile.name || '');
    setDob(profile.date_of_birth ? String(profile.date_of_birth).slice(0, 10) : '');
    setSex(profile.sex || '');
    setLang(profile.preferred_language || 'Hindi');
  }, [profile]);

  const saveProfile = useMutation({
    mutationFn: async () => {
      await fetch('/api/profile', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, dateOfBirth: dob || null, sex: sex || null, preferredLanguage: lang }),
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
              <label className="block space-y-1">
                <span className="text-sm font-medium text-patient-ink">Date of birth</span>
                <input type="date" value={dob} onChange={(e) => setDob(e.target.value)} className={inputCls} />
              </label>
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
                  <option key={l.code} value={l.code}>
                    {l.label} · {l.nativeLabel}
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
            {otherClinics.length > 0 && (
              <div className="pt-2 border-t border-patient-border space-y-2">
                <p className="mono-tag text-patient-muted text-[10px]">ADD A CLINIC</p>
                {otherClinics.map((c) => (
                  <button
                    key={c.id}
                    onClick={() => addFav.mutate(c.id)}
                    className="flex items-center gap-2 text-sm text-patient-accent font-semibold hover:underline"
                  >
                    <Plus className="w-4 h-4" /> {c.name}
                  </button>
                ))}
              </div>
            )}
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
              onClick={async () => {
                const res = await fetch('/api/my-record');
                if (!res.ok) return;
                const data = await res.json();
                const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = 'my-vaid-record.json';
                a.click();
                URL.revokeObjectURL(url);
              }}
              className="flex items-center gap-2 text-sm font-semibold text-patient-ink hover:text-patient-accent"
            >
              <Download className="w-4 h-4" /> Download my record
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
