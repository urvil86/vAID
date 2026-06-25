'use client';

import { useEffect, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import ClinicLayout from '@/components/ClinicLayout';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Loader2, Save, UserPlus, CheckCircle, Stethoscope } from 'lucide-react';
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
  const clinic = clinics?.[0];
  const clinicId = clinic?.id;

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
