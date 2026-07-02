/**
 * Patient record → a real downloadable PDF file (jsPDF). Lazy-loaded on click so
 * the ~heavy PDF lib never touches the initial bundle. Clinical content is
 * English (the note is always translated to English); a non-Latin patient name
 * may not render in the base font — acceptable for this record copy.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

function fmtDate(d?: string): string {
  if (!d) return '';
  const dt = new Date(d);
  if (isNaN(dt.getTime())) return String(d);
  const dd = String(dt.getDate()).padStart(2, '0');
  const mm = String(dt.getMonth() + 1).padStart(2, '0');
  return `${dd}-${mm}-${dt.getFullYear()}`;
}

const INK: [number, number, number] = [33, 29, 23];
const ACCENT: [number, number, number] = [216, 105, 62];
const MUTED: [number, number, number] = [107, 98, 88];
const BORDER: [number, number, number] = [236, 228, 214];

export async function downloadRecordPdf(): Promise<void> {
  let rec: any;
  try {
    const res = await fetch('/api/my-record');
    if (!res.ok) throw new Error(String(res.status));
    rec = await res.json();
  } catch {
    if (typeof window !== 'undefined') window.alert('Could not load your record. Please try again.');
    return;
  }

  const { jsPDF } = await import('jspdf');
  const doc = new jsPDF({ unit: 'pt', format: 'a4' });

  const M = 40;
  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();
  const RIGHT = W - M;
  let y = M;

  const color = (c: [number, number, number]) => doc.setTextColor(c[0], c[1], c[2]);
  const ensure = (h: number) => {
    if (y + h > H - M) {
      doc.addPage();
      y = M;
    }
  };

  const heading = (t: string) => {
    ensure(32);
    y += 10;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    color(MUTED);
    doc.text(t.toUpperCase(), M, y);
    y += 6;
    doc.setDrawColor(BORDER[0], BORDER[1], BORDER[2]);
    doc.setLineWidth(0.5);
    doc.line(M, y, RIGHT, y);
    y += 14;
  };

  const kv = (k: string, v?: string) => {
    if (!v) return;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    const lines = doc.splitTextToSize(String(v), RIGHT - M - 150);
    ensure(Math.max(14, lines.length * 13));
    color(MUTED);
    doc.text(k, M, y);
    color(INK);
    doc.setFont('helvetica', 'bold');
    doc.text(lines, M + 150, y);
    y += Math.max(14, lines.length * 13);
  };

  const para = (label: string, v?: string) => {
    if (!v) return;
    ensure(16);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    color(MUTED);
    doc.text(label.toUpperCase(), M, y);
    y += 12;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10.5);
    color(INK);
    const lines = doc.splitTextToSize(String(v), RIGHT - M);
    ensure(lines.length * 13);
    doc.text(lines, M, y);
    y += lines.length * 13 + 4;
  };

  const bullets = (title: string, rows: string[]) => {
    const clean = rows.filter(Boolean);
    if (!clean.length) return;
    heading(title);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    color(INK);
    for (const t of clean) {
      const ls = doc.splitTextToSize('- ' + t, RIGHT - M);
      ensure(ls.length * 12);
      doc.text(ls, M, y);
      y += ls.length * 12;
    }
  };

  // ── Title bar ──
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(22);
  color(ACCENT);
  doc.text('V-Aid', M, y + 8);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  color(MUTED);
  doc.text(`Patient-held record  |  exported ${fmtDate(rec?.exported_at)}`, RIGHT, y + 2, { align: 'right' });
  y += 18;
  doc.setDrawColor(ACCENT[0], ACCENT[1], ACCENT[2]);
  doc.setLineWidth(1.4);
  doc.line(M, y, RIGHT, y);
  y += 4;

  // ── Patient ──
  const p = rec?.patient || {};
  heading('Patient');
  kv('Name', p.name);
  kv('V-Aid ID (UHID)', p.uhid);
  kv('ABHA', p.abha_id);
  kv('Date of birth', p.date_of_birth ? fmtDate(p.date_of_birth) : '');
  kv('Sex', p.sex);
  kv('Phone', p.phone);
  kv('Email', p.email);

  // ── Visits & notes ──
  const visits: any[] = Array.isArray(rec?.visits) ? rec.visits : [];
  heading('Visits & notes');
  if (!visits.length) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    color(MUTED);
    ensure(14);
    doc.text('No visits yet.', M, y);
    y += 14;
  }
  for (const v of visits) {
    ensure(22);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    color(INK);
    doc.text(`Token ${v.token_no ?? '-'}`, M, y);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    color(MUTED);
    doc.text(`${v.status ?? ''}  |  ${fmtDate(v.created_at)}`, RIGHT, y, { align: 'right' });
    y += 15;
    const n = v.structured_note_json;
    if (n && typeof n === 'object') {
      para('Chief complaint', n.chief_complaint);
      para('History', n.history_of_present_illness);
      kv('Duration', n.duration);
      kv('Severity', n.severity);
      if (Array.isArray(n.current_medications) && n.current_medications.length)
        kv('Medications', n.current_medications.join(', '));
      if (Array.isArray(n.allergies) && n.allergies.length) kv('Allergies', n.allergies.join(', '));
    } else {
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(10);
      color(MUTED);
      ensure(13);
      doc.text('Intake recorded.', M, y);
      y += 13;
    }
    y += 8;
  }

  // ── Prescriptions ──
  const rx: any[] = Array.isArray(rec?.prescriptions) ? rec.prescriptions : [];
  if (rx.length) {
    heading('Prescriptions');
    for (const r of rx) {
      ensure(16);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(10);
      color(INK);
      doc.text('Prescription', M, y);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9);
      color(MUTED);
      doc.text(fmtDate(r.generated_at), RIGHT, y, { align: 'right' });
      y += 14;
      const items = Array.isArray(r.items_json) ? r.items_json : [];
      doc.setFontSize(10);
      color(INK);
      for (const it of items) {
        const line = [it.drug || it.drug_name || it.name, it.strength, it.dose, it.frequency, it.duration]
          .filter(Boolean)
          .join(' - ');
        if (!line) continue;
        const ls = doc.splitTextToSize('- ' + line, RIGHT - M);
        ensure(ls.length * 12);
        doc.text(ls, M, y);
        y += ls.length * 12;
      }
      para('Advice', r.advice);
      kv('Follow-up', r.follow_up_date ? fmtDate(r.follow_up_date) : '');
      y += 6;
    }
  }

  // ── Longitudinal record ──
  bullets(
    'Conditions',
    (rec?.conditions || []).map((c: any) =>
      [c.display_text || c.code_icd10, c.clinical_status, fmtDate(c.recorded_at)].filter(Boolean).join(' - ')
    )
  );
  bullets(
    'Medications',
    (rec?.medications || []).map((m: any) =>
      [m.drug_name, m.dose, m.frequency, m.status].filter(Boolean).join(' - ')
    )
  );
  bullets(
    'Allergies',
    (rec?.allergies || []).map((a: any) => [a.substance, a.reaction, a.severity].filter(Boolean).join(' - '))
  );

  // ── Footer ──
  ensure(30);
  y += 12;
  doc.setDrawColor(BORDER[0], BORDER[1], BORDER[2]);
  doc.setLineWidth(0.5);
  doc.line(M, y, RIGHT, y);
  y += 12;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  color(MUTED);
  doc.text(
    "Generated by V-Aid - the patient's own copy of their record. Decision support only, not a diagnosis.",
    M,
    y
  );

  doc.save('my-vaid-record.pdf');
}
