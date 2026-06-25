'use client';

import { useState, useEffect, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import PatientLayout from '@/components/PatientLayout';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Mic, RotateCcw, Loader2, WifiOff, Keyboard } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useQuery } from '@tanstack/react-query';
import { getStrings, LANG_STORAGE_KEY } from '@/lib/i18n';

type InputMode = 'voice' | 'type';
type IntakeQuestion = { text: string; hint: string };

// BCP-47 locale for the browser Web Speech API, by selected language.
const SPEECH_LOCALES: Record<string, string> = {
  Hindi: 'hi-IN',
  English: 'en-IN',
  Bengali: 'bn-IN',
  Tamil: 'ta-IN',
  Telugu: 'te-IN',
  Marathi: 'mr-IN',
  Gujarati: 'gu-IN',
  Kannada: 'kn-IN',
  Malayalam: 'ml-IN',
  Punjabi: 'pa-IN',
  Urdu: 'ur-IN',
};

export default function PatientIntakePage() {
  const params = useParams();
  const router = useRouter();
  const visitId = params.visitId as string;
  const STORAGE_KEY = `vaid-intake-${visitId}`;

  const [language, setLanguage] = useState('Hindi');
  const [currentStep, setCurrentStep] = useState(0);
  const [isRecording, setIsRecording] = useState(false);
  const [answers, setAnswers] = useState<Record<number, string>>({});
  const [currentTranscript, setCurrentTranscript] = useState('');
  const [typedAnswer, setTypedAnswer] = useState('');
  const [inputMode, setInputMode] = useState<InputMode>('voice');
  const [loading, setLoading] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [isOnline, setIsOnline] = useState(true);
  const [saveError, setSaveError] = useState('');
  const [voiceError, setVoiceError] = useState('');

  // Adaptive follow-up state (one clarifying question per step, max).
  const [followupQuestion, setFollowupQuestion] = useState<string | null>(null);
  const [followupInput, setFollowupInput] = useState('');
  const [followupAsked, setFollowupAsked] = useState<Record<number, boolean>>({});
  const [followupLoading, setFollowupLoading] = useState(false);

  const textAreaRef = useRef<HTMLTextAreaElement>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const recognitionRef = useRef<any>(null);
  const finalTranscriptRef = useRef('');

  const inFollowup = followupQuestion !== null;

  // ── Bootstrap: load language + restore saved progress ─────────────────────
  useEffect(() => {
    setIsOnline(navigator.onLine);

    const lang = localStorage.getItem(LANG_STORAGE_KEY);
    if (lang) setLanguage(lang);

    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (parsed.answers) setAnswers(parsed.answers);
        if (typeof parsed.currentStep === 'number') setCurrentStep(parsed.currentStep);
        if (parsed.sessionId) setSessionId(parsed.sessionId);
      } catch {
        /* ignore */
      }
    }

    const up = () => setIsOnline(true);
    const down = () => setIsOnline(false);
    window.addEventListener('online', up);
    window.addEventListener('offline', down);
    return () => {
      window.removeEventListener('online', up);
      window.removeEventListener('offline', down);
      // Stop any in-flight recognition on unmount.
      try {
        recognitionRef.current?.stop();
      } catch {
        /* ignore */
      }
    };
  }, [STORAGE_KEY]);

  // ── Initialize session if none saved ─────────────────────────────────────
  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    let hasSaved = false;
    try {
      hasSaved = !!(saved && JSON.parse(saved).sessionId);
    } catch {
      /* */
    }
    if (hasSaved) return;

    const init = async () => {
      try {
        const res = await fetch('/api/intake', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ visitId, language }),
        });
        if (res.ok) {
          const data = await res.json();
          setSessionId(data.id);
          localStorage.setItem(
            STORAGE_KEY,
            JSON.stringify({ sessionId: data.id, answers: {}, currentStep: 0 })
          );
        }
      } catch {
        console.warn('[Intake] Offline on init');
      }
    };
    init();
  }, [visitId, language, STORAGE_KEY]);

  // ── Persist answers to localStorage on change ─────────────────────────────
  useEffect(() => {
    if (Object.keys(answers).length > 0 || currentStep > 0) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ sessionId, answers, currentStep }));
    }
  }, [answers, currentStep, sessionId, STORAGE_KEY]);

  // ── Focus textarea when switching to type mode ────────────────────────────
  useEffect(() => {
    if (inputMode === 'type') {
      setTimeout(() => textAreaRef.current?.focus(), 100);
    }
  }, [inputMode, currentStep, followupQuestion]);

  const s = getStrings(language);
  // Questions are translated into the patient's language on the fly (Hindi and
  // English are served locally). While the translation loads we show the i18n
  // fallback so the flow never blocks; the doctor's note is always English.
  const { data: translatedQuestions } = useQuery<IntakeQuestion[]>({
    queryKey: ['intake-questions', language],
    queryFn: async () => {
      const res = await fetch(
        `/api/intake/translate-questions?language=${encodeURIComponent(language)}`
      );
      if (!res.ok) return s.questions;
      const json = await res.json();
      return (json.questions as IntakeQuestion[]) ?? s.questions;
    },
    staleTime: Infinity,
  });
  const questions = translatedQuestions ?? s.questions;
  const question = questions[currentStep];
  const isHindi = language === 'Hindi';

  // The "active" answer is the follow-up answer when a follow-up is showing,
  // otherwise the main answer for this step.
  const currentAnswer = answers[currentStep];
  const activeAnswer = inFollowup ? followupInput : currentAnswer;
  const headingText = inFollowup ? (followupQuestion as string) : question.text;

  // Route a committed value to the right slot (follow-up vs main answer).
  const commitAnswer = (value: string) => {
    if (inFollowup) setFollowupInput(value);
    else setAnswers((prev) => ({ ...prev, [currentStep]: value }));
  };

  // ── Voice recording (Web Speech API) ──────────────────────────────────────
  const startRecording = () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) {
      setVoiceError(s.voiceUnsupported);
      setInputMode('type');
      return;
    }
    setVoiceError('');
    setCurrentTranscript('');
    finalTranscriptRef.current = '';

    const rec = new SR();
    rec.lang = SPEECH_LOCALES[language] || 'en-IN';
    rec.interimResults = true;
    rec.continuous = true;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    rec.onresult = (e: any) => {
      let interim = '';
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const chunk = e.results[i][0].transcript;
        if (e.results[i].isFinal) finalTranscriptRef.current += chunk + ' ';
        else interim += chunk;
      }
      setCurrentTranscript((finalTranscriptRef.current + interim).trim());
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    rec.onerror = (e: any) => {
      if (e?.error === 'not-allowed' || e?.error === 'service-not-allowed') {
        setVoiceError(s.voiceDenied);
        setInputMode('type');
      }
      setIsRecording(false);
    };
    rec.onend = () => setIsRecording(false);

    recognitionRef.current = rec;
    try {
      rec.start();
      setIsRecording(true);
    } catch {
      setVoiceError(s.voiceUnsupported);
      setInputMode('type');
    }
  };

  const stopRecording = () => {
    try {
      recognitionRef.current?.stop();
    } catch {
      /* ignore */
    }
    setIsRecording(false);
    const final = (finalTranscriptRef.current || currentTranscript).trim();
    if (final) commitAnswer(final);
    setCurrentTranscript('');
    finalTranscriptRef.current = '';
  };

  const switchMode = (mode: InputMode) => {
    if (isRecording) stopRecording();
    setInputMode(mode);
    setTypedAnswer('');
    setCurrentTranscript('');
  };

  const clearAnswer = () => {
    if (inFollowup) {
      setFollowupInput('');
    } else {
      const next = { ...answers };
      delete next[currentStep];
      setAnswers(next);
    }
    setTypedAnswer('');
    setCurrentTranscript('');
    finalTranscriptRef.current = '';
  };

  // ── Advance / submit (shared by both phases) ──────────────────────────────
  const proceed = async (workingAnswers: Record<number, string>) => {
    if (currentStep < questions.length - 1) {
      setCurrentStep((p) => p + 1);
      return;
    }

    setLoading(true);
    setSaveError('');
    if (!isOnline) {
      setSaveError(s.offlineBanner);
      setLoading(false);
      return;
    }

    try {
      let sid = sessionId;
      if (!sid) {
        const r = await fetch('/api/intake', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ visitId, language }),
        });
        if (!r.ok) throw new Error('Could not create session');
        sid = (await r.json()).id;
        setSessionId(sid);
      }

      const fullTranscript = questions
        .map((q, i) => `${q.text}\n${workingAnswers[i] || '(no answer)'}`)
        .join('\n\n');

      const res = await fetch('/api/intake', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId: sid,
          transcriptNative: fullTranscript,
          status: 'COMPLETED',
        }),
      });
      if (!res.ok) throw new Error('Failed to submit');

      localStorage.removeItem(STORAGE_KEY);
      router.push(`/patient/review/${visitId}`);
    } catch (err) {
      console.error('[Intake] Submit failed:', err);
      setSaveError(s.saveError);
      setLoading(false);
    }
  };

  // ── Navigation ────────────────────────────────────────────────────────────
  const goNext = async () => {
    if (isRecording) stopRecording();

    // Commit a pending typed answer in one step (no separate Confirm tap).
    const pendingTyped = inputMode === 'type' ? typedAnswer.trim() : '';
    let mainAnswer = currentAnswer || '';
    let followupAns = followupInput || '';
    if (pendingTyped) {
      if (inFollowup) followupAns = pendingTyped;
      else mainAnswer = pendingTyped;
      commitAnswer(pendingTyped);
    }
    setTypedAnswer('');
    setCurrentTranscript('');
    finalTranscriptRef.current = '';

    // Phase B: a follow-up was showing — fold its answer into the step, advance.
    if (inFollowup) {
      const combined = followupAns
        ? `${mainAnswer}\n${followupQuestion} ${followupAns}`.trim()
        : mainAnswer;
      const updated = { ...answers, [currentStep]: combined };
      setAnswers(updated);
      setFollowupQuestion(null);
      setFollowupInput('');
      await proceed(updated);
      return;
    }

    // Phase A: maybe ask one adaptive follow-up before advancing.
    const stepAnswers = { ...answers, [currentStep]: mainAnswer };
    setAnswers(stepAnswers);

    if (isOnline && mainAnswer && !followupAsked[currentStep]) {
      setFollowupLoading(true);
      try {
        const r = await fetch('/api/intake/followup', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ language, question: question.text, answer: mainAnswer }),
        });
        if (r.ok) {
          const j = await r.json();
          setFollowupAsked((prev) => ({ ...prev, [currentStep]: true }));
          if (j.followup) {
            setFollowupQuestion(j.followup);
            setFollowupInput('');
            setFollowupLoading(false);
            return; // stay on this step to collect the follow-up answer
          }
        }
      } catch {
        /* fail open — just advance */
      }
      setFollowupLoading(false);
    }

    await proceed(stepAnswers);
  };

  const busy = loading || followupLoading;
  const canProceed =
    !isRecording &&
    !busy &&
    (!!activeAnswer || (inputMode === 'type' && typedAnswer.trim() !== ''));

  return (
    <PatientLayout>
      <div className="flex-1 p-5 flex flex-col min-h-0">
        {/* Offline banner */}
        {!isOnline && (
          <div className="mb-4 flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-xl p-3">
            <WifiOff className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
            <div>
              <p className={`text-amber-700 text-sm font-semibold ${isHindi ? 'hindi' : ''}`}>
                {s.offlineBanner}
              </p>
              <p className="text-amber-600 text-xs mt-0.5">{s.offlineSaveNote}</p>
            </div>
          </div>
        )}

        {/* Progress bar */}
        <div className="flex gap-1.5 mb-6 justify-center">
          {questions.map((_, i) => (
            <div
              key={i}
              className={`h-2 rounded-full transition-all duration-300 ${
                i === currentStep
                  ? 'w-6 bg-patient-accent'
                  : i < currentStep
                    ? 'w-2 bg-patient-accent/40'
                    : 'w-2 bg-patient-border'
              }`}
            />
          ))}
        </div>

        <div className="flex-1 overflow-y-auto pb-2">
          <AnimatePresence mode="wait">
            <motion.div
              key={`${currentStep}-${inFollowup ? 'fu' : 'q'}`}
              initial={{ opacity: 0, x: 24 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -24 }}
              transition={{ duration: 0.18 }}
              className="space-y-5"
            >
              {/* Question (or adaptive follow-up) */}
              <div className="space-y-1.5">
                {!inFollowup && (
                  <p className="mono-tag text-patient-muted">
                    {s.questionLabel(currentStep + 1, questions.length)}
                  </p>
                )}
                <h2 className={`text-2xl font-bold leading-snug ${isHindi ? 'hindi' : ''}`}>
                  {headingText}
                </h2>
                {!inFollowup && language !== 'English' && question.hint && (
                  <p className="text-patient-muted text-base">{question.hint}</p>
                )}
              </div>

              {/* Voice / Type toggle */}
              <div className="flex gap-2">
                <button
                  onClick={() => switchMode('voice')}
                  className={`flex items-center gap-1.5 px-4 py-2 rounded-full text-sm font-medium border-2 transition-all ${
                    inputMode === 'voice'
                      ? 'bg-patient-accent text-white border-patient-accent'
                      : 'bg-patient-card text-patient-muted border-patient-border hover:border-patient-accent/40'
                  }`}
                >
                  <Mic className="w-3.5 h-3.5" /> {s.switchToVoice}
                </button>
                <button
                  onClick={() => switchMode('type')}
                  className={`flex items-center gap-1.5 px-4 py-2 rounded-full text-sm font-medium border-2 transition-all ${
                    inputMode === 'type'
                      ? 'bg-patient-accent text-white border-patient-accent'
                      : 'bg-patient-card text-patient-muted border-patient-border hover:border-patient-accent/40'
                  }`}
                >
                  <Keyboard className="w-3.5 h-3.5" /> {s.switchToType}
                </button>
              </div>

              {/* Answer card */}
              <Card className="bg-patient-card border-patient-border min-h-[140px] flex flex-col">
                <CardContent className="p-5 flex-1 flex flex-col">
                  {activeAnswer && !isRecording ? (
                    <div className="flex-1 space-y-3">
                      <p
                        className={`text-lg text-patient-ink-secondary leading-relaxed ${isHindi ? 'hindi' : ''}`}
                      >
                        {activeAnswer}
                      </p>
                      <button
                        onClick={clearAnswer}
                        className="flex items-center gap-1.5 text-sm text-patient-muted hover:text-patient-accent transition-colors"
                      >
                        <RotateCcw className="w-3.5 h-3.5" /> {s.redo}
                      </button>
                    </div>
                  ) : inputMode === 'voice' ? (
                    /* Voice mode — live transcript box */
                    <div className="flex-1">
                      {isRecording ? (
                        <div className="space-y-3">
                          <div className="flex items-center gap-2">
                            <span className="pulse-dot inline-block w-2 h-2 bg-red-500 rounded-full" />
                            <span className="mono-tag text-red-500 text-[10px]">{s.listening}</span>
                          </div>
                          <p
                            className={`text-lg text-patient-ink-secondary italic ${isHindi ? 'hindi' : ''}`}
                          >
                            {currentTranscript || s.speakNow}
                          </p>
                        </div>
                      ) : (
                        <p className={`text-patient-muted italic ${isHindi ? 'hindi text-lg' : ''}`}>
                          {s.pressToSpeak}
                        </p>
                      )}
                    </div>
                  ) : (
                    /* Type mode — textarea. Next/Finish commits in one step. */
                    <div className="flex-1 flex flex-col gap-3">
                      <textarea
                        ref={textAreaRef}
                        value={typedAnswer}
                        onChange={(e) => setTypedAnswer(e.target.value)}
                        placeholder={s.typeHere}
                        rows={4}
                        className={`flex-1 w-full resize-none bg-transparent text-patient-ink placeholder:text-patient-muted/50 text-lg outline-none leading-relaxed ${isHindi ? 'hindi' : ''}`}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' && !e.shiftKey) {
                            e.preventDefault();
                            if (typedAnswer.trim() && !busy) goNext();
                          }
                        }}
                      />
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Voice unavailable / permission notice */}
              {voiceError && (
                <div className="bg-amber-50 border border-amber-200 rounded-xl p-3">
                  <p className={`text-amber-700 text-sm ${isHindi ? 'hindi' : ''}`}>{voiceError}</p>
                </div>
              )}

              {/* Error */}
              {saveError && (
                <div className="bg-amber-50 border border-amber-200 rounded-xl p-3">
                  <p className={`text-amber-700 text-sm ${isHindi ? 'hindi' : ''}`}>{saveError}</p>
                </div>
              )}
            </motion.div>
          </AnimatePresence>
        </div>

        {/* Bottom actions */}
        <div className="pt-5 flex flex-col items-center gap-4">
          {/* Mic button — voice mode, no answer captured yet */}
          {inputMode === 'voice' && !activeAnswer && (
            <>
              <button
                onClick={isRecording ? stopRecording : startRecording}
                className={`w-24 h-24 rounded-full flex items-center justify-center shadow-xl transition-all duration-200 ${
                  isRecording
                    ? 'bg-red-500 scale-110'
                    : 'bg-patient-accent hover:scale-105 active:scale-95'
                }`}
              >
                {isRecording ? (
                  <div className="w-7 h-7 bg-white rounded-md" />
                ) : (
                  <Mic className="w-10 h-10 text-white" />
                )}
              </button>
              <p className={`text-patient-muted text-center ${isHindi ? 'hindi text-lg' : 'text-sm'}`}>
                {isRecording ? s.stopRecording : s.pressToSpeak}
              </p>
            </>
          )}

          {/* Proceed button */}
          <AnimatePresence>
            {(canProceed || busy) && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 8 }}
                className="w-full"
              >
                <Button
                  className={`w-full h-14 bg-patient-accent hover:bg-patient-accent/90 text-white text-lg font-bold rounded-full ${isHindi ? 'hindi' : ''}`}
                  onClick={goNext}
                  disabled={busy || !canProceed}
                >
                  {busy ? (
                    <Loader2 className="w-5 h-5" />
                  ) : currentStep === questions.length - 1 && !inFollowup ? (
                    s.finish
                  ) : (
                    s.next
                  )}
                </Button>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      <style jsx global>{`
        @keyframes pulse-dot {
          0%,
          100% {
            opacity: 1;
            transform: scale(1);
          }
          50% {
            opacity: 0.4;
            transform: scale(0.85);
          }
        }
        .pulse-dot {
          animation: pulse-dot 1.2s ease-in-out infinite;
        }
      `}</style>
    </PatientLayout>
  );
}
