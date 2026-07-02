/**
 * Patient record → printable PDF. We render the record as a styled HTML
 * document in a popup and trigger the browser's print dialog, where the patient
 * chooses "Save as PDF". This is dependency-free and renders Devanagari/other
 * Indian scripts correctly (the browser handles the fonts), which a canvas PDF
 * lib would not without embedding each font.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

function esc(s: unknown): string {
  return String(s ?? '').replace(
    /[&<>"']/g,
    (ch) => (({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }) as Record<string, string>)[ch]
  );
}

function fmtDate(d?: string): string {
  if (!d) return '—';
  const dt = new Date(d);
  if (isNaN(dt.getTime())) return esc(d);
  const dd = String(dt.getDate()).padStart(2, '0');
  const mm = String(dt.getMonth() + 1).padStart(2, '0');
  return `${dd}-${mm}-${dt.getFullYear()}`;
}

function row(label: string, value: unknown): string {
  if (value == null || value === '') return '';
  return `<tr><td class="k">${esc(label)}</td><td class="v">${esc(value)}</td></tr>`;
}

function list(label: string, items: unknown): string {
  const arr = Array.isArray(items) ? items.filter((x) => x != null && String(x).trim()) : [];
  if (!arr.length) return '';
  return `<div class="field"><span class="fl">${esc(label)}</span> ${arr.map((x) => esc(x)).join(', ')}</div>`;
}

function noteBlock(n: any): string {
  if (!n || typeof n !== 'object') return '<p class="muted">No structured note.</p>';
  const parts = [
    n.chief_complaint ? `<div class="field"><span class="fl">Chief complaint</span> ${esc(n.chief_complaint)}</div>` : '',
    n.history_of_present_illness ? `<div class="field"><span class="fl">History</span> ${esc(n.history_of_present_illness)}</div>` : '',
    n.duration ? `<div class="field"><span class="fl">Duration</span> ${esc(n.duration)}</div>` : '',
    n.severity ? `<div class="field"><span class="fl">Severity</span> ${esc(n.severity)}</div>` : '',
    list('Associated symptoms', n.associated_symptoms),
    list('Current medications', n.current_medications),
    list('Allergies', n.allergies),
    list('Past history', n.past_history),
  ].filter(Boolean);
  return parts.length ? parts.join('') : '<p class="muted">No structured note.</p>';
}

export function buildRecordHtml(rec: any): string {
  const p = rec?.patient || {};
  const visits: any[] = Array.isArray(rec?.visits) ? rec.visits : [];
  const rx: any[] = Array.isArray(rec?.prescriptions) ? rec.prescriptions : [];
  const conditions: any[] = Array.isArray(rec?.conditions) ? rec.conditions : [];
  const meds: any[] = Array.isArray(rec?.medications) ? rec.medications : [];
  const allergies: any[] = Array.isArray(rec?.allergies) ? rec.allergies : [];

  const visitsHtml =
    visits
      .map(
        (v) => `
      <div class="card">
        <div class="ch">
          <strong>Token ${esc(v.token_no)}</strong>
          <span class="pill">${esc(v.status)}</span>
          <span class="muted">${fmtDate(v.created_at)}</span>
        </div>
        ${noteBlock(v.structured_note_json)}
      </div>`
      )
      .join('') || '<p class="muted">No visits yet.</p>';

  const rxHtml = rx.length
    ? rx
        .map((r) => {
          const items = Array.isArray(r.items_json) ? r.items_json : [];
          const lines = items
            .map((it: any) =>
              esc([it.drug_name || it.name, it.dose, it.frequency, it.duration].filter(Boolean).join(' · '))
            )
            .filter(Boolean)
            .map((l: string) => `<li>${l}</li>`)
            .join('');
          return `<div class="card">
            <div class="ch"><strong>Prescription</strong><span class="muted">${fmtDate(r.generated_at)}</span></div>
            ${lines ? `<ul>${lines}</ul>` : ''}
            ${r.advice ? `<div class="field"><span class="fl">Advice</span> ${esc(r.advice)}</div>` : ''}
            ${r.follow_up_date ? `<div class="field"><span class="fl">Follow-up</span> ${fmtDate(r.follow_up_date)}</div>` : ''}
          </div>`;
        })
        .join('')
    : '';

  const simpleList = (title: string, rows: string) =>
    rows ? `<h2>${esc(title)}</h2><div class="card"><table>${rows}</table></div>` : '';

  const condRows = conditions
    .map((c) => row(c.display_text || c.code_icd10, `${c.clinical_status || ''} · ${fmtDate(c.recorded_at)}`))
    .join('');
  const medRows = meds
    .map((m) => row(m.drug_name, [m.dose, m.frequency, m.status].filter(Boolean).join(' · ')))
    .join('');
  const allergyRows = allergies
    .map((a) => row(a.substance, [a.reaction, a.severity].filter(Boolean).join(' · ')))
    .join('');

  return `<!doctype html>
<html><head><meta charset="utf-8"><title>V-Aid record — ${esc(p.name || 'Patient')}</title>
<style>
  @page { margin: 18mm; }
  * { box-sizing: border-box; }
  body { font-family: -apple-system, 'Segoe UI', Roboto, 'Noto Sans', 'Noto Sans Devanagari', sans-serif; color: #211d17; margin: 0; }
  header { display:flex; align-items:center; justify-content:space-between; border-bottom:2px solid #d8693e; padding-bottom:12px; margin-bottom:18px; }
  .brand { font-weight:800; font-size:22px; } .brand span { color:#d8693e; }
  .muted { color:#6b6258; font-size:12px; }
  h2 { font-size:14px; text-transform:uppercase; letter-spacing:.08em; color:#6b6258; margin:22px 0 8px; }
  table { width:100%; border-collapse:collapse; }
  td { padding:4px 0; vertical-align:top; font-size:13px; }
  td.k { color:#6b6258; width:42%; padding-right:12px; } td.v { font-weight:600; }
  .card { border:1px solid #ece4d6; border-radius:10px; padding:12px 14px; margin-bottom:10px; background:#fcfaf5; }
  .ch { display:flex; align-items:center; gap:10px; margin-bottom:8px; }
  .pill { font-size:10px; text-transform:uppercase; letter-spacing:.06em; background:#ece4d6; border-radius:20px; padding:2px 8px; }
  .field { font-size:13px; margin:4px 0; line-height:1.5; }
  .fl { color:#6b6258; font-size:11px; text-transform:uppercase; letter-spacing:.05em; margin-right:4px; }
  ul { margin:6px 0; padding-left:18px; font-size:13px; }
  footer { margin-top:26px; border-top:1px solid #ece4d6; padding-top:10px; }
</style></head>
<body onload="setTimeout(function(){window.print();},300)">
  <header>
    <div class="brand">V<span>·</span>Aid</div>
    <div class="muted">Patient-held record · exported ${fmtDate(rec?.exported_at)}</div>
  </header>

  <h2>Patient</h2>
  <div class="card"><table>
    ${row('Name', p.name)}
    ${row('V-Aid ID (UHID)', p.uhid)}
    ${row('ABHA', p.abha_id)}
    ${row('Date of birth', p.date_of_birth ? fmtDate(p.date_of_birth) : '')}
    ${row('Sex', p.sex)}
    ${row('Phone', p.phone)}
    ${row('Email', p.email)}
  </table></div>

  <h2>Visits &amp; notes</h2>
  ${visitsHtml}

  ${rxHtml ? `<h2>Prescriptions</h2>${rxHtml}` : ''}
  ${simpleList('Conditions', condRows)}
  ${simpleList('Medications', medRows)}
  ${simpleList('Allergies', allergyRows)}

  <footer class="muted">
    Generated by V-Aid. This is the patient's own copy of their record. Decision support only — not a diagnosis.
  </footer>
</body></html>`;
}

export async function downloadRecordPdf(): Promise<void> {
  // Open the window synchronously (inside the click) so pop-up blockers allow
  // it; fill it after the record fetch resolves.
  const win = window.open('', '_blank');
  try {
    const res = await fetch('/api/my-record');
    if (!res.ok) {
      win?.close();
      return;
    }
    const data = await res.json();
    if (!win) return;
    win.document.write(buildRecordHtml(data));
    win.document.close();
    win.focus();
  } catch {
    win?.close();
  }
}
