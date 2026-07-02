'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Loader2, Plus, Users, Baby } from 'lucide-react';

type Member = {
  user_id: string;
  name: string;
  relationship: string | null;
  uhid: string;
  date_of_birth?: string;
  sex?: string;
  is_self: boolean;
};

const CURRENT_YEAR = new Date().getFullYear();
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/**
 * Family / dependents (3.3). The account holder can add managed profiles
 * (children, etc.) — each gets its own V-Aid ID and record but is checked in
 * and monitored by the parent. Consent stays per-patient.
 */
export default function FamilyCard() {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery<{ members: Member[] }>({
    queryKey: ['family'],
    queryFn: async () => {
      const res = await fetch('/api/family');
      if (!res.ok) return { members: [] };
      return res.json();
    },
  });

  const members = data?.members || [];
  const dependents = members.filter((m) => !m.is_self);

  const [adding, setAdding] = useState(false);
  const [name, setName] = useState('');
  const [d, setD] = useState('');
  const [m, setM] = useState('');
  const [y, setY] = useState('');
  const [sex, setSex] = useState('');
  const [relationship, setRelationship] = useState('child');

  const inputCls =
    'w-full rounded-xl border border-patient-border bg-white px-3 h-11 text-[15px] text-patient-ink outline-none focus:border-patient-accent transition-colors';
  const dobCls =
    'w-full rounded-xl border border-patient-border bg-white px-1.5 h-11 text-[15px] text-patient-ink outline-none focus:border-patient-accent transition-colors';

  const reset = () => {
    setName('');
    setD('');
    setM('');
    setY('');
    setSex('');
    setRelationship('child');
    setAdding(false);
  };

  const addMember = useMutation({
    mutationFn: async () => {
      const dob = y && m && d ? `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}` : null;
      const res = await fetch('/api/family', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim(), dateOfBirth: dob, sex: sex || null, relationship }),
      });
      if (!res.ok) throw new Error('Could not add member');
    },
    onSuccess: () => {
      reset();
      qc.invalidateQueries({ queryKey: ['family'] });
    },
  });

  return (
    <Card className="bg-patient-card border-patient-border">
      <CardContent className="p-4 space-y-3">
        <p className="mono-tag text-patient-muted text-[10px] flex items-center gap-1.5">
          <Users className="w-3.5 h-3.5 text-patient-accent" /> FAMILY &amp; DEPENDENTS
        </p>

        {isLoading ? (
          <div className="py-2 flex justify-center">
            <Loader2 className="w-5 h-5 animate-spin text-patient-accent" />
          </div>
        ) : dependents.length === 0 ? (
          <p className="text-sm text-patient-muted">
            Add a child or dependent to check them in and keep their record here — you manage it for
            them.
          </p>
        ) : (
          <div className="space-y-2">
            {dependents.map((dep) => (
              <div
                key={dep.user_id}
                className="flex items-center justify-between border border-patient-border rounded-xl px-3 py-2.5"
              >
                <div className="flex items-center gap-2.5">
                  <span className="w-8 h-8 rounded-full bg-patient-accent/10 flex items-center justify-center text-patient-accent">
                    <Baby className="w-4 h-4" />
                  </span>
                  <div>
                    <p className="font-semibold text-patient-ink text-sm">{dep.name}</p>
                    <p className="mono-tag text-patient-muted text-[9px]">
                      {(dep.relationship || 'dependent').toUpperCase()} · {dep.uhid}
                    </p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {adding ? (
          <div className="space-y-2.5 pt-2 border-t border-patient-border">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Full name"
              className={inputCls}
            />
            <div className="grid grid-cols-2 gap-2">
              <select value={relationship} onChange={(e) => setRelationship(e.target.value)} className={inputCls} aria-label="Relationship">
                <option value="child">Child</option>
                <option value="spouse">Spouse</option>
                <option value="parent">Parent</option>
                <option value="other">Other</option>
              </select>
              <select value={sex} onChange={(e) => setSex(e.target.value)} className={inputCls} aria-label="Sex">
                <option value="">Sex</option>
                <option value="Male">Male</option>
                <option value="Female">Female</option>
                <option value="Other">Other</option>
              </select>
            </div>
            <div>
              <span className="text-xs text-patient-muted">Date of birth (optional)</span>
              <div className="grid grid-cols-[1fr_1.2fr_1.3fr] gap-2 mt-1">
                <select value={d} onChange={(e) => setD(e.target.value)} className={dobCls} aria-label="Day">
                  <option value="">Day</option>
                  {Array.from({ length: 31 }, (_, i) => String(i + 1)).map((x) => (
                    <option key={x} value={x}>{x}</option>
                  ))}
                </select>
                <select value={m} onChange={(e) => setM(e.target.value)} className={dobCls} aria-label="Month">
                  <option value="">Month</option>
                  {MONTHS.map((label, i) => (
                    <option key={label} value={String(i + 1)}>{label}</option>
                  ))}
                </select>
                <select value={y} onChange={(e) => setY(e.target.value)} className={dobCls} aria-label="Year">
                  <option value="">Year</option>
                  {Array.from({ length: 110 }, (_, i) => String(CURRENT_YEAR - i)).map((x) => (
                    <option key={x} value={x}>{x}</option>
                  ))}
                </select>
              </div>
            </div>
            <div className="flex gap-2 pt-1">
              <Button
                onClick={() => addMember.mutate()}
                disabled={!name.trim() || addMember.isPending}
                className="flex-1 h-11 bg-patient-accent hover:bg-patient-accent/90 text-white font-bold rounded-full disabled:opacity-50"
              >
                {addMember.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Add'}
              </Button>
              <Button
                onClick={reset}
                variant="outline"
                className="h-11 rounded-full border-patient-border text-patient-ink"
              >
                Cancel
              </Button>
            </div>
            {addMember.isError && (
              <p className="text-xs text-red-600">Could not add. Please try again.</p>
            )}
          </div>
        ) : (
          <button
            onClick={() => setAdding(true)}
            className="flex items-center gap-2 text-sm font-semibold text-patient-accent hover:underline pt-1"
          >
            <Plus className="w-4 h-4" /> Add a child / dependent
          </button>
        )}
      </CardContent>
    </Card>
  );
}
