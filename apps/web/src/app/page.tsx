'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { authClient } from '@/lib/auth-client';

// Testing-phase auth bypass — see src/lib/dev-auth.ts. Off when the env var is unset.
const DEV_AUTH_BYPASS = process.env.NEXT_PUBLIC_DEV_AUTH_BYPASS === '1';
const STAFF_ROLES = ['doctor', 'receptionist', 'admin'];

type Lang = 'en' | 'hi';
type Audience = 'doc' | 'pat';

/**
 * V·Aid landing (design option 1a — "Warm paper"). The bare domain
 * (vaid.vercel.app) always lands here; the hero's audience switch routes each
 * visitor to their entry point — clinics/doctors → staff sign-in, patients →
 * check-in. EN/हिंदी toggle swaps all copy live.
 */
const COPY: Record<Lang, { shared: Record<string, string>; doc: Record<string, string>; pat: Record<string, string> }> = {
  en: {
    shared: {
      nav1: 'How it works',
      nav2: 'Trust & privacy',
      nav3: 'Languages',
      tabDoc: 'For clinics & doctors',
      tabPat: 'For patients',
      chip1: 'DPDP 2023 CONSENT',
      chip2: '22 LANGUAGES',
      chip3: 'SUPPORT, NOT DIAGNOSIS',
      howTitle: 'From voice to pre-read',
      trustTitle: 'Built for trust',
      t1t: 'Consent first',
      t1d: 'Recorded, versioned DPDP 2023 consent before a single word is captured. Withdraw any time.',
      t2t: 'Your circle only',
      t2d: 'Only the treating doctor and clinic staff ever see the data. Withdrawn data is deleted.',
      t3t: 'Support, not diagnosis',
      t3d: "V-Aid never diagnoses. It organises the patient's story; red flags are doctor-only. The doctor decides.",
      langTitle: '22 languages, one thread',
      langSub: 'Patients speak the way they actually speak — mixing dialects and English words mid-sentence. V-Aid follows along.',
      langMore: '+9 MORE',
      tag: 'From voice to record.',
      legal: 'V-Aid is a concept in development. Decision support only — not a medical device, and never a diagnosis.',
    },
    doc: {
      title: 'Every consult starts already briefed.',
      sub: 'V-Aid listens to your patients before you see them — in any of 22 Indian languages — and develops their story into a structured pre-read on your panel. Decision support, never diagnosis.',
      cta: 'Book a demo',
      cta2: 'See a sample pre-read →',
      s1t: 'Check-in',
      s1d: 'The patient scans a QR at reception, picks a language, and gives recorded DPDP consent.',
      s2t: 'The thread',
      s2d: 'Guided questions grow one living voice thread — history, symptoms, meds, in the patient’s own words.',
      s3t: 'The pre-read',
      s3d: 'By consult time a structured brief is on your panel: HPI, timeline, red-flag alerts. Low confidence stays visibly hazy.',
      s4t: 'The consult',
      s4d: 'You verify and decide. Flags are doctor-only; nothing is ever shown to the patient as a diagnosis.',
      finalTitle: 'See V-Aid in your clinic.',
      finalSub: "A 30-minute demo: one live thread, from a patient's first words to the pre-read on your panel.",
    },
    pat: {
      title: 'Tell your story before you see the doctor.',
      sub: 'Speak at check-in, in your own language — no forms, no explaining twice. When you sit down, the doctor already understands.',
      cta: 'Get early access',
      cta2: 'How it works →',
      s1t: 'Scan',
      s1d: 'Scan the QR at the reception desk with your own phone. No app to install.',
      s2t: 'Speak',
      s2d: 'Answer a few questions out loud, in your language. Mix English words freely — it understands.',
      s3t: 'Relax',
      s3d: 'No forms to fill. Your words are prepared for the doctor while you wait your turn.',
      s4t: 'Meet the doctor',
      s4d: 'Your doctor already knows your story — so the visit is about you, not paperwork.',
      finalTitle: 'Be first in line.',
      finalSub: "Early access opens clinic by clinic. Leave your number and we'll tell you when V-Aid reaches yours.",
    },
  },
  hi: {
    shared: {
      nav1: 'कैसे काम करता है',
      nav2: 'भरोसा और निजता',
      nav3: 'भाषाएँ',
      tabDoc: 'क्लिनिक और डॉक्टरों के लिए',
      tabPat: 'मरीज़ों के लिए',
      chip1: 'DPDP 2023 सहमति',
      chip2: '22 भाषाएँ',
      chip3: 'सहायता, निदान नहीं',
      howTitle: 'आवाज़ से प्री-रीड तक',
      trustTitle: 'भरोसे के लिए बना',
      t1t: 'सहमति सबसे पहले',
      t1d: 'एक भी शब्द रिकॉर्ड होने से पहले DPDP 2023 सहमति — रिकॉर्डेड और वर्ज़नड। कभी भी वापस लें।',
      t2t: 'सिर्फ़ आपकी टीम',
      t2d: 'डेटा केवल इलाज करने वाले डॉक्टर और क्लिनिक स्टाफ़ देखते हैं। वापस लेने पर डेटा हटा दिया जाता है।',
      t3t: 'सहायता, निदान नहीं',
      t3d: 'V-Aid कभी निदान नहीं करता। यह मरीज़ की कहानी व्यवस्थित करता है; रेड फ़्लैग सिर्फ़ डॉक्टर के लिए। फ़ैसला डॉक्टर का।',
      langTitle: '22 भाषाएँ, एक थ्रेड',
      langSub: 'मरीज़ वैसे ही बोलते हैं जैसे वे सच में बोलते हैं — बोली और अंग्रेज़ी शब्द मिलाकर। V-Aid साथ-साथ समझता है।',
      langMore: '+9 और',
      tag: 'आवाज़ से रिकॉर्ड तक।',
      legal: 'V-Aid एक विकासाधीन कॉन्सेप्ट है। केवल निर्णय-सहायता — चिकित्सा उपकरण नहीं, निदान कभी नहीं।',
    },
    doc: {
      title: 'हर परामर्श, पहले से तैयार।',
      sub: 'V-Aid परामर्श से पहले मरीज़ की बात सुनता है — 22 भारतीय भाषाओं में — और उनकी कहानी को आपके पैनल पर एक संरचित प्री-रीड में बदलता है। निर्णय-सहायता, निदान कभी नहीं।',
      cta: 'डेमो बुक करें',
      cta2: 'नमूना प्री-रीड देखें →',
      s1t: 'चेक-इन',
      s1d: 'मरीज़ रिसेप्शन पर QR स्कैन करता है, भाषा चुनता है, और रिकॉर्डेड DPDP सहमति देता है।',
      s2t: 'द थ्रेड',
      s2d: 'निर्देशित प्रश्नों से एक जीवित वॉइस-थ्रेड बनता है — इतिहास, लक्षण, दवाइयाँ, मरीज़ के अपने शब्दों में।',
      s3t: 'प्री-रीड',
      s3d: 'परामर्श तक आपके पैनल पर संरचित ब्रीफ़ तैयार: HPI, टाइमलाइन, रेड-फ़्लैग अलर्ट। कम भरोसे वाली बातें धुँधली दिखती हैं।',
      s4t: 'परामर्श',
      s4d: 'आप जाँचते और तय करते हैं। फ़्लैग सिर्फ़ डॉक्टर के लिए — मरीज़ को कभी निदान नहीं दिखाया जाता।',
      finalTitle: 'V-Aid को अपनी क्लिनिक में देखिए।',
      finalSub: '30 मिनट का डेमो: एक लाइव थ्रेड — मरीज़ के पहले शब्दों से आपके पैनल के प्री-रीड तक।',
    },
    pat: {
      title: 'डॉक्टर से मिलने से पहले, अपनी बात कह दीजिए।',
      sub: 'चेक-इन पर अपनी भाषा में बोलिए — कोई फ़ॉर्म नहीं, दो बार समझाना नहीं। जब आप बैठते हैं, डॉक्टर आपको पहले से समझते हैं।',
      cta: 'जल्दी एक्सेस पाएं',
      cta2: 'यह कैसे काम करता है →',
      s1t: 'स्कैन करें',
      s1d: 'रिसेप्शन पर QR अपने फ़ोन से स्कैन करें। कोई ऐप इंस्टॉल नहीं करना।',
      s2t: 'बोलिए',
      s2d: 'कुछ सवालों के जवाब अपनी भाषा में बोलकर दें। अंग्रेज़ी शब्द मिलाना बिल्कुल ठीक है।',
      s3t: 'आराम कीजिए',
      s3d: 'कोई फ़ॉर्म नहीं। आपकी बातें डॉक्टर के लिए तैयार होती रहती हैं, जब तक आपकी बारी आए।',
      s4t: 'डॉक्टर से मिलिए',
      s4d: 'डॉक्टर आपकी कहानी पहले से जानते हैं — मुलाक़ात आपके बारे में होती है, काग़ज़ों के बारे में नहीं।',
      finalTitle: 'सबसे पहले जुड़िए।',
      finalSub: 'अर्ली एक्सेस क्लिनिक-दर-क्लिनिक खुल रहा है। अपना नंबर छोड़िए — आपकी क्लिनिक तक पहुँचते ही बताएँगे।',
    },
  },
};

const INK = '#211D17';
const PAPER = '#F6F1E9';
const ACCENT = '#D8693E';
const ACCENT_DK = '#C75F39';
const MUTED = '#6B6258';

export default function LandingPage() {
  const router = useRouter();
  const { data: session } = authClient.useSession();
  const [lang, setLang] = useState<Lang>('en');
  const [audience, setAudience] = useState<Audience>('doc');

  const c = { ...COPY[lang].shared, ...COPY[lang][audience] };

  // "Book a demo" / "Get early access" send everyone to the account chooser,
  // where they pick Doctor/Clinic vs Patient before signing in or up. Staff who
  // are already signed in (or dev-bypass) skip straight to the console.
  const primaryCta = () => {
    const role = (session?.user as { role?: string } | undefined)?.role;
    const isStaff = !!role && STAFF_ROLES.includes(role);
    if (DEV_AUTH_BYPASS || isStaff) router.push('/clinic/queue');
    else router.push('/account/choose');
  };
  const scrollTo = (id: string) => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' });

  // Font stacks (loaded globally via global.css @import).
  const sans = "'Hanken Grotesk','Noto Sans Devanagari',sans-serif";
  const mono = "'Space Mono','Noto Sans Devanagari',monospace";

  // Language/audience pill + tab styling (warm-paper theme).
  const pill = (active: boolean) => ({
    cursor: 'pointer',
    padding: '5px 12px',
    borderRadius: 30,
    background: active ? INK : 'transparent',
    color: active ? PAPER : '#8A8073',
  });
  const tab = (active: boolean) => ({
    cursor: 'pointer',
    padding: '9px 16px',
    borderRadius: 30,
    font: `600 13px ${sans}`,
    border: `1.5px solid ${active ? ACCENT : '#D9D0BE'}`,
    background: active ? ACCENT : 'transparent',
    color: active ? '#fff' : MUTED,
  });

  return (
    <div style={{ background: PAPER, fontFamily: sans, color: INK, minHeight: '100vh' }}>
      {/* NAV */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '20px 48px', borderBottom: '1px solid #E5DECF' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <Mark />
          <span style={{ font: `800 20px 'Hanken Grotesk'`, color: INK, letterSpacing: '-.01em' }}>
            V<span style={{ color: ACCENT }}>·</span>Aid
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 26, font: `600 13px ${sans}` }}>
          <span className="va-nav-link" onClick={() => scrollTo('how')}>{c.nav1}</span>
          <span className="va-nav-link" onClick={() => scrollTo('trust')}>{c.nav2}</span>
          <span className="va-nav-link" onClick={() => scrollTo('languages')}>{c.nav3}</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <div style={{ display: 'flex', alignItems: 'center', padding: 3, border: '1px solid #D9D0BE', borderRadius: 30 }}>
            <span onClick={() => setLang('en')} style={{ ...pill(lang === 'en'), font: `700 12px 'Space Mono',monospace` }}>EN</span>
            <span onClick={() => setLang('hi')} style={{ ...pill(lang === 'hi'), font: `600 12px 'Noto Sans Devanagari',sans-serif` }}>हिंदी</span>
          </div>
          <span
            onClick={primaryCta}
            className="va-cta"
            style={{ padding: '10px 18px', borderRadius: 30, color: '#fff', font: `700 14px ${sans}`, cursor: 'pointer', boxShadow: '0 8px 18px -8px rgba(216,105,62,.6)' }}
          >
            {c.cta}
          </span>
        </div>
      </div>

      {/* HERO */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 470px', gap: 36, padding: '56px 48px 68px', alignItems: 'center' }}>
        <div>
          <div style={{ display: 'flex', gap: 8, marginBottom: 26 }}>
            <span onClick={() => setAudience('doc')} style={tab(audience === 'doc')}>{c.tabDoc}</span>
            <span onClick={() => setAudience('pat')} style={tab(audience === 'pat')}>{c.tabPat}</span>
          </div>
          <div style={{ font: `700 11px 'Space Mono',monospace`, letterSpacing: '.26em', color: ACCENT_DK, textTransform: 'uppercase' }}>
            Voice-first clinical intake
          </div>
          <div style={{ font: `800 50px/1.06 ${sans}`, color: INK, letterSpacing: '-.025em', margin: '14px 0 18px', maxWidth: 560, textWrap: 'pretty' }}>
            {c.title}
          </div>
          <div style={{ font: `400 17px/1.6 ${sans}`, color: '#5C5247', maxWidth: 490, textWrap: 'pretty' }}>{c.sub}</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 20, marginTop: 30 }}>
            <span
              onClick={primaryCta}
              className="va-cta"
              style={{ display: 'inline-flex', alignItems: 'center', gap: 9, padding: '16px 26px', borderRadius: 16, color: '#fff', font: `700 16px ${sans}`, cursor: 'pointer', boxShadow: '0 12px 26px -10px rgba(216,105,62,.65)' }}
            >
              {c.cta}<span>→</span>
            </span>
            <span onClick={() => scrollTo('how')} className="va-underline" style={{ font: `600 14px ${sans}`, color: INK, paddingBottom: 2, cursor: 'pointer' }}>
              {c.cta2}
            </span>
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 34 }}>
            {[c.chip1, c.chip2, c.chip3].map((chip) => (
              <span key={chip} style={{ padding: '7px 12px', borderRadius: 30, background: '#EDE7DB', font: `600 11px ${mono}`, color: MUTED, letterSpacing: '.03em' }}>
                {chip}
              </span>
            ))}
          </div>
        </div>

        {/* phone stage */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 22 }}>
          <ThreadSpine />
          <PhoneMock sans={sans} />
        </div>
      </div>

      {/* HOW IT WORKS */}
      <div id="how" style={{ padding: '58px 48px 64px', borderTop: '1px solid #E5DECF', scrollMarginTop: 16 }}>
        <div style={{ font: `700 11px 'Space Mono',monospace`, letterSpacing: '.26em', color: ACCENT_DK, textTransform: 'uppercase' }}>How it works</div>
        <div style={{ font: `800 32px ${sans}`, color: INK, letterSpacing: '-.02em', margin: '8px 0 36px' }}>{c.howTitle}</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 26 }}>
          {[
            { n: '01', t: c.s1t, d: c.s1d, last: false },
            { n: '02', t: c.s2t, d: c.s2d, last: false },
            { n: '03', t: c.s3t, d: c.s3d, last: false },
            { n: '04', t: c.s4t, d: c.s4d, last: true },
          ].map((s) => (
            <div key={s.n}>
              <div style={{ display: 'flex', alignItems: 'center' }}>
                <span style={{ flex: 'none', width: 36, height: 36, borderRadius: '50%', background: s.last ? INK : ACCENT, color: s.last ? PAPER : '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', font: `700 13px 'Space Mono'` }}>
                  {s.n}
                </span>
                {!s.last && <span style={{ flex: 1, height: 0, borderTop: '2px dashed #CFC2A9', marginLeft: 10 }} />}
              </div>
              <div style={{ font: `700 17px ${sans}`, color: INK, marginTop: 16 }}>{s.t}</div>
              <div style={{ font: `400 14px/1.55 ${sans}`, color: MUTED, marginTop: 7, textWrap: 'pretty' }}>{s.d}</div>
            </div>
          ))}
        </div>
      </div>

      {/* TRUST */}
      <div id="trust" style={{ margin: '0 48px', background: '#EDE7DB', borderRadius: 20, padding: '44px 44px 48px', scrollMarginTop: 16 }}>
        <div style={{ font: `700 11px 'Space Mono',monospace`, letterSpacing: '.26em', color: '#8A8073', textTransform: 'uppercase' }}>Trust &amp; privacy</div>
        <div style={{ font: `800 32px ${sans}`, color: INK, letterSpacing: '-.02em', margin: '8px 0 32px' }}>{c.trustTitle}</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 28 }}>
          {[
            { g: '◆', t: c.t1t, d: c.t1d },
            { g: '◇', t: c.t2t, d: c.t2d },
            { g: '✦', t: c.t3t, d: c.t3d },
          ].map((x) => (
            <div key={x.t}>
              <span style={{ width: 42, height: 42, borderRadius: '50%', background: 'rgba(216,105,62,.14)', display: 'flex', alignItems: 'center', justifyContent: 'center', font: `700 17px 'Space Mono'`, color: ACCENT_DK }}>
                {x.g}
              </span>
              <div style={{ font: `700 17px ${sans}`, color: INK, marginTop: 14 }}>{x.t}</div>
              <div style={{ font: `400 14px/1.55 ${sans}`, color: MUTED, marginTop: 7, textWrap: 'pretty' }}>{x.d}</div>
            </div>
          ))}
        </div>
      </div>

      {/* LANGUAGES */}
      <div id="languages" style={{ padding: '58px 48px 64px', scrollMarginTop: 16 }}>
        <div style={{ font: `700 11px 'Space Mono',monospace`, letterSpacing: '.26em', color: ACCENT_DK, textTransform: 'uppercase' }}>Languages</div>
        <div style={{ font: `800 32px ${sans}`, color: INK, letterSpacing: '-.02em', margin: '8px 0 10px' }}>{c.langTitle}</div>
        <div style={{ font: `400 16px/1.6 ${sans}`, color: '#5C5247', maxWidth: 560, textWrap: 'pretty' }}>{c.langSub}</div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 9, marginTop: 26, maxWidth: 900 }}>
          {[
            { l: 'हिन्दी', on: true },
            { l: 'English' },
            { l: 'मराठी' },
            { l: 'বাংলা', accent: true },
            { l: 'தமிழ்' },
            { l: 'తెలుగు' },
            { l: 'ಕನ್ನಡ' },
            { l: 'ગુજરાતી' },
            { l: 'ਪੰਜਾਬੀ' },
            { l: 'മലയാളം' },
            { l: 'ଓଡ଼ିଆ' },
            { l: 'অসমীয়া' },
            { l: 'اردو' },
          ].map((x) => (
            <span
              key={x.l}
              style={{
                padding: '10px 16px',
                borderRadius: 30,
                background: x.on ? INK : x.accent ? ACCENT : '#EDE7DB',
                color: x.on ? PAPER : x.accent ? '#fff' : '#3A342B',
                font: `600 14px 'Noto Sans Devanagari',sans-serif`,
              }}
            >
              {x.l}
            </span>
          ))}
          <span style={{ padding: '10px 16px', borderRadius: 30, background: PAPER, border: '1.5px dashed #CFC2A9', color: '#8A8073', font: `600 13px 'Space Mono',monospace` }}>
            {c.langMore}
          </span>
        </div>
      </div>

      {/* FINAL CTA + FOOTER */}
      <div style={{ margin: '0 48px 48px', background: INK, borderRadius: 20, padding: '52px 48px 36px' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 32, alignItems: 'center' }}>
          <div>
            <div style={{ font: `800 34px/1.15 ${sans}`, color: PAPER, letterSpacing: '-.02em', maxWidth: 560, textWrap: 'pretty' }}>{c.finalTitle}</div>
            <div style={{ font: `400 15px/1.6 ${sans}`, color: '#B8AE9E', marginTop: 12, maxWidth: 520, textWrap: 'pretty' }}>{c.finalSub}</div>
          </div>
          <span
            onClick={primaryCta}
            className="va-cta-ft"
            style={{ display: 'inline-flex', alignItems: 'center', gap: 9, padding: '17px 28px', borderRadius: 16, background: ACCENT, color: '#fff', font: `700 16px ${sans}`, cursor: 'pointer', whiteSpace: 'nowrap' }}
          >
            {c.cta}<span>→</span>
          </span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 44, paddingTop: 22, borderTop: '1px solid rgba(246,241,233,.12)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
            <Mark small />
            <span style={{ font: `700 14px 'Hanken Grotesk'`, color: PAPER }}>V·Aid</span>
            <span style={{ font: `400 13px ${sans}`, color: '#8A8073', marginLeft: 8 }}>{c.tag}</span>
          </div>
          <span style={{ font: `600 11px 'Space Mono',monospace`, color: '#8A8073', letterSpacing: '.04em' }}>hello@v-aid.in</span>
        </div>
        <div style={{ font: `400 10.5px/1.5 ${mono}`, color: '#7A7064', marginTop: 14 }}>{c.legal}</div>
      </div>
    </div>
  );
}

/* V·Aid checkmark mark. `small`/footer variant uses paper strokes. */
function Mark({ small }: { small?: boolean }) {
  const sz = small ? 20 : 30;
  const base = small ? PAPER : INK;
  return (
    <svg width={sz} height={sz} viewBox="0 0 100 100" fill="none">
      <path d="M20 24 L50 76 L80 24" stroke={base} strokeWidth={9} strokeLinecap="round" strokeLinejoin="round" />
      <path d="M20 24 C30 44 36 54 50 76" stroke={small ? '#E08A63' : ACCENT} strokeWidth={9} strokeLinecap="round" strokeLinejoin="round" />
      {!small && <circle cx={50} cy={76} r={7} fill={ACCENT} />}
    </svg>
  );
}

/* Decorative vertical voice-thread beside the phone (answered → active → upcoming). */
function ThreadSpine() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', paddingTop: 30 }}>
      <span style={{ width: 11, height: 11, borderRadius: '50%', background: ACCENT, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <span style={{ color: '#fff', font: `700 7px 'Space Mono'` }}>✓</span>
      </span>
      <span style={{ width: 2, height: 56, background: ACCENT }} />
      <span style={{ width: 11, height: 11, borderRadius: '50%', background: ACCENT, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <span style={{ color: '#fff', font: `700 7px 'Space Mono'` }}>✓</span>
      </span>
      <span style={{ width: 2, height: 56, background: 'linear-gradient(#D8693E,#E9B59C)' }} />
      <span style={{ position: 'relative', width: 15, height: 15, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <span style={{ position: 'absolute', left: '50%', top: '50%', width: 15, height: 15, borderRadius: '50%', background: ACCENT, animation: 'vaPulse 1.8s ease-out infinite' }} />
        <span style={{ width: 13, height: 13, borderRadius: '50%', background: ACCENT, border: `2px solid ${PAPER}`, boxShadow: `0 0 0 2px ${ACCENT}`, zIndex: 1 }} />
      </span>
      <span style={{ width: 2, height: 56, background: '#E2D8C6' }} />
      <span style={{ width: 9, height: 9, borderRadius: '50%', border: '2px solid #D8C9B2' }} />
      <span style={{ width: 2, height: 56, background: '#E2D8C6' }} />
      <span style={{ width: 9, height: 9, borderRadius: '50%', border: '2px solid #D8C9B2' }} />
    </div>
  );
}

/* Animated intake phone — Hindi question, live transcription, waveform, mic. */
function PhoneMock({ sans }: { sans: string }) {
  const bars = [0, 0.12, 0.24, 0.36, 0.48, 0.6, 0.72, 0.84, 0.96, 1.08];
  return (
    <div style={{ position: 'relative', width: 312, height: 620 }}>
      <span style={{ position: 'absolute', left: '50%', top: '50%', width: 360, height: 360, margin: '-180px 0 0 -180px', borderRadius: '50%', border: `1.5px solid ${ACCENT}`, animation: 'vaRing 3s ease-out infinite' }} />
      <span style={{ position: 'absolute', left: '50%', top: '50%', width: 360, height: 360, margin: '-180px 0 0 -180px', borderRadius: '50%', border: `1.5px solid ${ACCENT}`, animation: 'vaRing 3s ease-out 1.5s infinite' }} />
      <div style={{ position: 'relative', width: 292, height: 604, margin: '8px auto 0', background: '#0C0E11', borderRadius: 44, padding: 10, boxSizing: 'border-box', boxShadow: '0 32px 60px -22px rgba(0,0,0,.5),0 0 0 1px rgba(0,0,0,.55)' }}>
        <div style={{ width: '100%', height: '100%', borderRadius: 35, overflow: 'hidden', background: PAPER, display: 'flex', flexDirection: 'column' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', padding: '14px 20px 4px', font: `700 10px 'Space Mono',monospace`, color: INK }}>
            <span>9:46</span><span>5G ▮▮▮</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 20px 0' }}>
            <span style={{ font: `700 10px 'Space Mono'`, letterSpacing: '.06em', color: '#8A7E6E' }}>TOKEN V-204</span>
            <span style={{ font: `700 10px 'Space Mono','Noto Sans Devanagari'`, letterSpacing: '.06em', color: ACCENT }}>प्रश्न 4 / 7</span>
          </div>
          <div style={{ padding: '20px 22px 0' }}>
            <div style={{ font: `400 20px/1.35 'Noto Sans Devanagari',sans-serif`, color: INK }}>दर्द कब से है? कैसा महसूस होता है?</div>
            <div style={{ font: `400 11.5px/1.5 'Hanken Grotesk'`, color: '#9A8E7C', marginTop: 6 }}>Since when? What does it feel like?</div>
          </div>
          <div style={{ margin: '18px 20px 0', background: '#fff', borderRadius: 14, padding: '14px 15px', boxShadow: '0 2px 8px rgba(33,29,23,.06)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 7, font: `700 9px 'Space Mono'`, letterSpacing: '.12em', color: ACCENT_DK }}>
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: ACCENT, animation: 'vaBlink 1.1s step-end infinite' }} />LISTENING
            </div>
            <div style={{ font: `400 14px/1.55 'Noto Sans Devanagari',sans-serif`, color: '#3A342B', marginTop: 8 }}>
              तीन दिन से सीने में जलन है, खाने के बाद ज़्यादा…
              <span style={{ display: 'inline-block', width: 2, height: 14, background: ACCENT, marginLeft: 2, verticalAlign: -2, animation: 'vaBlink .9s step-end infinite' }} />
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 3, height: 44, marginTop: 16 }}>
            {bars.map((d, i) => (
              <span key={i} style={{ width: 3, height: 26, borderRadius: 2, background: i % 2 ? '#E08A63' : ACCENT, animation: `vaWave 1s ease-in-out ${d}s infinite` }} />
            ))}
          </div>
          <div style={{ marginTop: 'auto', display: 'flex', flexDirection: 'column', alignItems: 'center', paddingBottom: 26 }}>
            <span style={{ position: 'relative', width: 64, height: 64, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <span style={{ position: 'absolute', left: '50%', top: '50%', width: 64, height: 64, borderRadius: '50%', background: ACCENT, animation: 'vaPulse 2s ease-out infinite' }} />
              <span style={{ width: 64, height: 64, borderRadius: '50%', background: ACCENT, display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1, boxShadow: '0 10px 24px -8px rgba(216,105,62,.7)' }}>
                <span style={{ width: 18, height: 26, borderRadius: 9, border: '3px solid #fff' }} />
              </span>
            </span>
            <span style={{ font: `700 10px 'Space Mono','Noto Sans Devanagari'`, letterSpacing: '.1em', color: '#8A7E6E', marginTop: 12 }}>बोलिए · SPEAK</span>
          </div>
        </div>
      </div>
    </div>
  );
}
