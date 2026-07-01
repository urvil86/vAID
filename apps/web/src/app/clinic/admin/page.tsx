'use client';

import { useEffect, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import ClinicLayout from '@/components/ClinicLayout';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Loader2, Save, UserPlus, CheckCircle, Stethoscope, GitMerge } from 'lucide-react';
import { AVAILABLE_LANGUAGES } from '@/lib/i18n';

type Staff = {
  id: string;
  name: string;
  email: string;
  role: string;
  registration_no?: string;
  specialty?: string;
};

export default function ClinicAdminPage() {
  const queryClient = useQueryClient();

  const { data: clinics } = useQuery({
    queryKey: ['clinics'],
    queryFn: async () => (await fetch('/api/clinics')).json(),
  });
  const clinicId = clinics?.[0]?.id;
  // The public list is a minimal DTO; fetch the FULL record (rx header, address)
  // for the settings form now that we're an authenticated admin.
  const { data: fullClinic } = useQuery({
    queryKey: ['clinic-full', clinicId],
    queryFn: async () => (await fetch(`/api/clinics/${clinicId}`)).json(),
    enabled: !!clinicId,
  });
  const clinic = fullClinic ?? clinics?.[0];

  // ── Clinic settings form ────────────────────────────────────────────────
  const [name, setName] = useState('');
  const [address, setAddress] = useState('');
  const [defaultLanguage, setDefaultLanguage] = useState('Hindi');
  const [rxClinicName, setRxClinicName] = useState('');
  const [rxLine1, setRxLine1] = useState('');
  const [rxPhone, setRxPhone] = useState('');
  const [rxReg, setRxReg] = useState('');
  const [savedClinic, setSavedClinic] = useState(false);

  useEffect(() => {
    if (!clinic) return;
    setName(clinic.name || '');
    setAddress(clinic.address || '');
    setDefaultLanguage(clinic.default_language || 'Hindi');
    const rx = clinic.rx_header_json || {};
    setRxClinicName(rx.clinic_name || clinic.name || '');
    setRxLine1(rx.line1 || clinic.address || '');
    setRxPhone(rx.phone || '');
    setRxReg(rx.reg || '');
  }, [clinic]);

  const saveClinic = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/clinics/${clinicId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          address,
          default_language: defaultLanguage,
          rx_header_json: { clinic_name: rxClinicName, line1: rxLine1, phone: rxPhone, reg: rxReg },
        }),
      });
      if (!res.ok) throw new Error('Failed to save');
      return res.json();
    },
    onSuccess: () => {
      setSavedClinic(true);
      queryClient.invalidateQueries({ queryKey: ['clinics'] });
      setTimeout(() => setSavedClinic(false), 2000);
    },
  });

  // ── Staff management ────────────────────────────────────────────────────
  const { data: staffData } = useQuery<{ staff: Staff[] }>({
    queryKey: ['staff', clinicId],
    queryFn: async () => (await fetch(`/api/admin/staff?clinicId=${clinicId}`)).json(),
    enabled: !!clinicId,
  });

  const [email, setEmail] = useState('');
  const [role, setRole] = useState('doctor');
  const [regNo, setRegNo] = useState('');
  const [specialty, setSpecialty] = useState('');
  const [staffError, setStaffError] = useState('');

  const assignStaff = useMutation({
    mutationFn: async () => {
      setStaffError('');
      const res = await fetch('/api/admin/staff', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email,
          role,
          clinicId,
          registrationNo: regNo || undefined,
          specialty: specialty || undefined,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Failed');
      return json;
    },
    onSuccess: () => {
      setEmail('');
      setRegNo('');
      setSpecialty('');
      queryClient.invalidateQueries({ queryKey: ['staff', clinicId] });
    },
    onError: (e: Error) => setStaffError(e.message),
  });

  // ── Merge duplicate patients ────────────────────────────────────────────
  const [mergeCanonical, setMergeCanonical] = useState('');
  const [mergeDuplicate, setMergeDuplicate] = useState('');
  const [confirmMerge, setConfirmMerge] = useState(false);
  const [mergeMsg, setMergeMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const mergeMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch('/api/admin/merge-patients', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ canonical: mergeCanonical, duplicate: mergeDuplicate }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Merge failed');
      return json;
    },
    onSuccess: () => {
      setMergeMsg({ ok: true, text: 'Merged. The duplicate was folded into the kept patient.' });
      setMergeCanonical('');
      setMergeDuplicate('');
      setConfirmMerge(false);
    },
    onError: (e: Error) => setMergeMsg({ ok: false, text: e.message }),
  });

  if (!clinic) {
    return (
      <ClinicLayout>
        <div className="flex h-[60vh] items-center justify-center">
          <Loader2 className="animate-spin text-doctor-accent" />
        </div>
      </ClinicLayout>
    );
  }

  const inputCls =
    'bg-doctor-bg border-doctor-muted/20 text-doctor-text placeholder:text-doctor-muted text-sm';

  return (
    <ClinicLayout>
      <div className="mb-8">
        <h1 className="text-2xl font-bold">Admin</h1>
        <p className="text-doctor-muted mono-tag mt-1">Clinic settings &amp; staff</p>
      </div>

      {/* Clinic settings */}
      <Card className="bg-doctor-raised border-doctor-muted/20 mb-6">
        <CardContent className="p-6 space-y-4">
          <p className="mono-tag text-doctor-muted text-[10px]">Clinic Profile</p>
          <div className="grid md:grid-cols-2 gap-3">
            <Field label="Clinic name"><Input className={inputCls} value={name} onChange={(e) => setName(e.target.value)} /></Field>
            <Field label="Default language">
              <select
                value={defaultLanguage}
                onChange={(e) => setDefaultLanguage(e.target.value)}
                className="w-full bg-doctor-bg border border-doctor-muted/20 rounded-md text-doctor-text text-sm px-3 py-2"
              >
                {AVAILABLE_LANGUAGES.map((l) => (
                  <option key={l.code} value={l.code}>
                    {l.label} · {l.nativeLabel}
                  </option>
                ))}
              </select>
            </Field>
            <div className="md:col-span-2">
              <Field label="Address"><Input className={inputCls} value={address} onChange={(e) => setAddress(e.target.value)} /></Field>
            </div>
          </div>

          <p className="mono-tag text-doctor-muted text-[10px] pt-2">Prescription Header</p>
          <div className="grid md:grid-cols-2 gap-3">
            <Field label="Header clinic name"><Input className={inputCls} value={rxClinicName} onChange={(e) => setRxClinicName(e.target.value)} /></Field>
            <Field label="Address line"><Input className={inputCls} value={rxLine1} onChange={(e) => setRxLine1(e.target.value)} /></Field>
            <Field label="Phone"><Input className={inputCls} value={rxPhone} onChange={(e) => setRxPhone(e.target.value)} /></Field>
            <Field label="Registration / Reg no."><Input className={inputCls} value={rxReg} onChange={(e) => setRxReg(e.target.value)} /></Field>
          </div>

          <div className="flex justify-end pt-2">
            <Button
              onClick={() => saveClinic.mutate()}
              disabled={saveClinic.isPending}
              className="bg-doctor-accent hover:bg-doctor-accent/90 text-doctor-bg font-bold gap-2"
            >
              {saveClinic.isPending ? <Loader2 className="w-4 h-4" /> : savedClinic ? <CheckCircle className="w-4 h-4" /> : <Save className="w-4 h-4" />}
              {savedClinic ? 'Saved' : 'Save settings'}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Staff */}
      <Card className="bg-doctor-raised border-doctor-muted/20">
        <CardContent className="p-6 space-y-4">
          <p className="mono-tag text-doctor-muted text-[10px]">Staff</p>

          <div className="space-y-2">
            {(staffData?.staff ?? []).map((m) => (
              <div
                key={m.id}
                className="flex items-center justify-between bg-doctor-bg rounded-lg px-4 py-3 border border-doctor-muted/10"
              >
                <div>
                  <p className="text-doctor-text font-semibold text-sm flex items-center gap-2">
                    {m.role === 'doctor' && <Stethoscope className="w-3.5 h-3.5 text-doctor-accent" />}
                    {m.name || m.email}
                  </p>
                  <p className="mono-tag text-[10px] text-doctor-muted">
                    {m.email} {m.registration_no ? `· ${m.registration_no}` : ''}{' '}
                    {m.specialty ? `· ${m.specialty}` : ''}
                  </p>
                </div>
                <span className="mono-tag text-[10px] text-doctor-accent uppercase">{m.role}</span>
              </div>
            ))}
            {(staffData?.staff ?? []).length === 0 && (
              <p className="text-doctor-muted text-sm">No staff assigned yet.</p>
            )}
          </div>

          {/* Assign a role to an existing account */}
          <div className="pt-3 border-t border-doctor-muted/10 space-y-3">
            <p className="mono-tag text-doctor-muted text-[10px]">Assign role to an account (by email)</p>
            <div className="grid md:grid-cols-2 gap-3">
              <Input className={inputCls} placeholder="email@clinic.test" value={email} onChange={(e) => setEmail(e.target.value)} />
              <select
                value={role}
                onChange={(e) => setRole(e.target.value)}
                className="bg-doctor-bg border border-doctor-muted/20 rounded-md text-doctor-text text-sm px-3 py-2"
              >
                <option value="doctor">Doctor</option>
                <option value="receptionist">Receptionist</option>
                <option value="admin">Admin</option>
              </select>
              {role === 'doctor' && (
                <>
                  <Input className={inputCls} placeholder="Registration no." value={regNo} onChange={(e) => setRegNo(e.target.value)} />
                  <Input className={inputCls} placeholder="Specialty" value={specialty} onChange={(e) => setSpecialty(e.target.value)} />
                </>
              )}
            </div>
            {staffError && <p className="text-red-400 text-sm">{staffError}</p>}
            <div className="flex justify-end">
              <Button
                onClick={() => assignStaff.mutate()}
                disabled={assignStaff.isPending || !email}
                className="bg-doctor-accent hover:bg-doctor-accent/90 text-doctor-bg font-bold gap-2"
              >
                {assignStaff.isPending ? <Loader2 className="w-4 h-4" /> : <UserPlus className="w-4 h-4" />}
                Assign role
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Merge duplicate patients */}
      <Card className="bg-doctor-raised border-doctor-muted/20 mt-6">
        <CardContent className="p-6 space-y-4">
          <div>
            <p className="mono-tag text-doctor-muted text-[10px]">Merge duplicate patients</p>
            <p className="text-doctor-muted text-xs mt-1">
              Fold a duplicate account into the one you want to keep — use email or V-Aid ID. This
              repoints all visits, documents and consent to the kept patient and can&apos;t be undone.
            </p>
          </div>
          <div className="grid md:grid-cols-2 gap-3">
            <Field label="Keep this patient (canonical)">
              <Input
                className={inputCls}
                placeholder="email or VAID-000123"
                value={mergeCanonical}
                onChange={(e) => {
                  setMergeCanonical(e.target.value);
                  setConfirmMerge(false);
                  setMergeMsg(null);
                }}
              />
            </Field>
            <Field label="Merge & retire this one (duplicate)">
              <Input
                className={inputCls}
                placeholder="email or VAID-000124"
                value={mergeDuplicate}
                onChange={(e) => {
                  setMergeDuplicate(e.target.value);
                  setConfirmMerge(false);
                  setMergeMsg(null);
                }}
              />
            </Field>
          </div>
          {mergeMsg && (
            <p className={`text-sm ${mergeMsg.ok ? 'text-emerald-400' : 'text-red-400'}`}>
              {mergeMsg.text}
            </p>
          )}
          <div className="flex justify-end gap-2">
            {!confirmMerge ? (
              <Button
                onClick={() => {
                  setMergeMsg(null);
                  setConfirmMerge(true);
                }}
                disabled={!mergeCanonical || !mergeDuplicate}
                className="bg-doctor-accent hover:bg-doctor-accent/90 text-doctor-bg font-bold gap-2"
              >
                <GitMerge className="w-4 h-4" /> Merge…
              </Button>
            ) : (
              <>
                <Button
                  variant="ghost"
                  onClick={() => setConfirmMerge(false)}
                  className="text-doctor-muted hover:text-doctor-text"
                >
                  Cancel
                </Button>
                <Button
                  onClick={() => mergeMutation.mutate()}
                  disabled={mergeMutation.isPending}
                  className="bg-red-600 hover:bg-red-700 text-white font-bold gap-2"
                >
                  {mergeMutation.isPending ? (
                    <Loader2 className="w-4 h-4" />
                  ) : (
                    <GitMerge className="w-4 h-4" />
                  )}
                  Confirm merge
                </Button>
              </>
            )}
          </div>
        </CardContent>
      </Card>
    </ClinicLayout>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-1">
      <span className="mono-tag text-doctor-muted text-[10px]">{label}</span>
      {children}
    </label>
  );
}
