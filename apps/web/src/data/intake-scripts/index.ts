/**
 * Data-driven adaptive intake. The base 7-question script comes from i18n; after
 * the chief complaint is classified into (at most) one body system, 2–4 targeted
 * branch questions are inserted. Every branch question maps to a named HPI field
 * so the structured note gains onset / radiation / aggravating / relieving /
 * timing. Total questions cap at 12 so intake stays ~6 minutes.
 *
 * Red-flag answers (⚠ CLINICAL REVIEW REQUIRED — see thresholds file) add a
 * screen_flag for the doctor's attention box.
 */
export const BODY_SYSTEMS = [
  'fever',
  'respiratory',
  'chest_pain',
  'abdominal',
  'musculoskeletal',
  'skin',
  'headache_neuro',
  'none',
] as const;
export type BodySystem = (typeof BODY_SYSTEMS)[number];

export type BranchQuestion = {
  id: string; // stable id, e.g. "chest_pain.radiation"
  field: string; // HPI field it populates
  en: string;
  hi: string;
  /** Substrings (lowercased) in the answer that trigger a red flag. */
  redFlags?: string[];
  redFlagLabel?: string;
};

export const BRANCHES: Record<Exclude<BodySystem, 'none'>, BranchQuestion[]> = {
  fever: [
    { id: 'fever.onset', field: 'onset', en: 'When did the fever start, and is it constant or on-and-off?', hi: 'बुखार कब शुरू हुआ, और क्या यह लगातार है या रुक-रुक कर आता है?' },
    { id: 'fever.assoc', field: 'associated_factors', en: 'Any chills, rash, neck stiffness, or trouble breathing?', hi: 'क्या ठंड लगना, दाने, गर्दन में अकड़न, या साँस लेने में तकलीफ़ है?', redFlags: ['neck stiff', 'गर्दन', 'breathing', 'साँस', 'rash', 'दाने'], redFlagLabel: 'Fever with red-flag features (neck stiffness / breathlessness / rash)' },
  ],
  respiratory: [
    { id: 'resp.onset', field: 'onset', en: 'How long have you had the cough or breathing trouble?', hi: 'खांसी या साँस की तकलीफ़ कब से है?' },
    { id: 'resp.redflag', field: 'associated_factors', en: 'Any blood in cough, chest pain, or breathlessness at rest?', hi: 'क्या खांसी में खून, सीने में दर्द, या आराम करते समय साँस फूलना है?', redFlags: ['blood', 'खून', 'rest', 'आराम', 'chest pain', 'सीने'], redFlagLabel: 'Respiratory red flag (haemoptysis / rest breathlessness / chest pain)' },
  ],
  chest_pain: [
    { id: 'chest.radiation', field: 'radiation', en: 'Does the pain spread to your arm, jaw, or back?', hi: 'क्या दर्द आपकी बांह, जबड़े, या पीठ तक फैलता है?', redFlags: ['arm', 'बांह', 'jaw', 'जबड़', 'back', 'पीठ'], redFlagLabel: 'Chest pain radiating (possible cardiac)' },
    { id: 'chest.assoc', field: 'associated_factors', en: 'Any sweating, nausea, or breathlessness with the pain?', hi: 'क्या दर्द के साथ पसीना, मतली, या साँस फूलना है?', redFlags: ['sweat', 'पसीना', 'breathless', 'साँस'], redFlagLabel: 'Chest pain with sweating/breathlessness (possible cardiac)' },
    { id: 'chest.onset', field: 'onset', en: 'Did it start suddenly or gradually, and what were you doing?', hi: 'क्या यह अचानक शुरू हुआ या धीरे-धीरे, और आप क्या कर रहे थे?' },
  ],
  abdominal: [
    { id: 'abd.site', field: 'timing_pattern', en: 'Where exactly is the pain, and does it come and go?', hi: 'दर्द वास्तव में कहाँ है, और क्या यह आता-जाता रहता है?' },
    { id: 'abd.redflag', field: 'associated_factors', en: 'Any vomiting blood, black stools, or a rigid, very tender belly?', hi: 'क्या खून की उल्टी, काला मल, या पेट बहुत सख्त/दर्दनाक है?', redFlags: ['blood', 'खून', 'black stool', 'काला मल', 'rigid', 'सख्त'], redFlagLabel: 'Abdominal red flag (GI bleed / peritonism)' },
  ],
  musculoskeletal: [
    { id: 'msk.onset', field: 'onset', en: 'Was there an injury, and does it hurt more with movement?', hi: 'क्या कोई चोट लगी थी, और क्या हिलने-डुलने से दर्द बढ़ता है?' },
    { id: 'msk.aggr', field: 'aggravating_factors', en: 'What makes it better or worse?', hi: 'किससे यह बेहतर या बदतर होता है?' },
  ],
  skin: [
    { id: 'skin.onset', field: 'onset', en: 'When did the rash/lesion appear, and is it spreading or itchy?', hi: 'दाने/घाव कब दिखे, और क्या यह फैल रहा है या खुजली है?' },
    { id: 'skin.redflag', field: 'associated_factors', en: 'Any fever, blistering, or swelling of lips/face?', hi: 'क्या बुखार, फफोले, या होंठ/चेहरे पर सूजन है?', redFlags: ['blister', 'फफोले', 'swelling', 'सूजन', 'lips', 'होंठ'], redFlagLabel: 'Skin red flag (blistering / facial swelling)' },
  ],
  headache_neuro: [
    { id: 'neuro.redflag', field: 'associated_factors', en: 'Any worst-ever sudden headache, weakness, confusion, or vision loss?', hi: 'क्या अब तक का सबसे तेज़ अचानक सिरदर्द, कमज़ोरी, भ्रम, या दृष्टि हानि है?', redFlags: ['worst', 'सबसे तेज़', 'weakness', 'कमज़ोर', 'confusion', 'भ्रम', 'vision', 'दृष्टि'], redFlagLabel: 'Neuro red flag (thunderclap / focal deficit)' },
    { id: 'neuro.timing', field: 'timing_pattern', en: 'When does it happen, and how long does it last?', hi: 'यह कब होता है, और कितनी देर रहता है?' },
  ],
};

/** Build the branch questions for a body system, capped so total stays ≤ 12. */
export function branchQuestions(system: BodySystem, baseCount: number): BranchQuestion[] {
  if (system === 'none') return [];
  const budget = Math.max(0, 12 - baseCount);
  return (BRANCHES[system] ?? []).slice(0, Math.min(4, budget));
}

/** Red-flag screen flags from the patient's branch answers. */
export function branchRedFlags(system: BodySystem, answers: Record<string, string>): string[] {
  if (system === 'none') return [];
  const flags: string[] = [];
  for (const q of BRANCHES[system] ?? []) {
    const ans = (answers[q.id] || '').toLowerCase();
    if (q.redFlags && q.redFlagLabel && q.redFlags.some((rf) => ans.includes(rf.toLowerCase()))) {
      flags.push(q.redFlagLabel);
    }
  }
  return flags;
}
