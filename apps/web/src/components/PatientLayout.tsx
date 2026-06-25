'use client';

import React from 'react';

export default function PatientLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-patient-bg text-patient-ink selection:bg-patient-accent/20">
      <div className="max-w-md mx-auto min-h-screen flex flex-col">{children}</div>
    </div>
  );
}
