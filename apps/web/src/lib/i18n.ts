/**
 * V-Aid Patient-Side Strings
 * Add a new language key here to support it everywhere automatically.
 * All patient pages read from this file via usePatientLang().
 */

export type SupportedLanguage = string; // open-ended for future langs

export interface PatientStrings {
  // Check-in
  checkInSubtitle: string;
  selectLanguage: string;
  getStarted: string;
  privacyNote: string;

  // Consent
  consentTitle: string;
  consentHeading: string;
  consentBody1: string;
  consentBody2: string;
  consentBody3: string;
  consentButton: string;
  goBack: string;

  // Intake
  questionLabel: (current: number, total: number) => string;
  pressToSpeak: string;
  stopRecording: string;
  listening: string;
  speakNow: string;
  typeAnswer: string;
  typeHere: string;
  redo: string;
  next: string;
  finish: string;
  offlineBanner: string;
  offlineSaveNote: string;
  saveError: string;
  switchToType: string;
  switchToVoice: string;
  aiFollowupTag: string;
  voiceUnsupported: string;
  voiceDenied: string;

  // Questions
  questions: { text: string; hint: string }[];

  // Review
  reviewLabel: string;
  reviewHeading: string;
  reviewSubheading: string;
  chiefComplaint: string;
  duration: string;
  severity: string;
  medications: string;
  allergies: string;
  confirmButton: string;
  organizingText: string;
  organizingSubtext: string;

  // Success
  successHeading: string;
  successSubheading: string;
  successNote: string;
}

const HINDI: PatientStrings = {
  // Check-in
  checkInSubtitle: 'आज की अपनी विज़िट के लिए गाइडेड क्लिनिकल इन्टेक।',
  selectLanguage: 'भाषा चुनें',
  getStarted: 'शुरू करें',
  privacyNote: 'आपका डेटा सुरक्षित है और केवल आपके डॉक्टर के साथ साझा किया जाता है।',

  // Consent
  consentTitle: 'सहमति और गोपनीयता',
  consentHeading: 'आपकी गोपनीयता मायने रखती है',
  consentBody1:
    'हम आपकी आवाज़ और स्वास्थ्य जानकारी एकत्र करते हैं ताकि आपके डॉक्टर के लिए एक नोट तैयार किया जा सके।',
  consentBody2: 'यह जानकारी केवल आपके डॉक्टर और क्लिनिक के कर्मचारियों के साथ साझा की जाती है।',
  consentBody3: 'आप कभी भी अपनी सहमति वापस ले सकते हैं।',
  consentButton: 'मैं सहमत हूँ',
  goBack: 'वापस जाएं',

  // Intake
  questionLabel: (c, t) => `प्रश्न ${c} / ${t}`,
  pressToSpeak: 'दबाकर बोलें',
  stopRecording: 'पूरा होने पर दबाएं',
  listening: 'सुना जा रहा है...',
  speakNow: 'अभी बोलें...',
  typeAnswer: 'लिखकर जवाब दें',
  typeHere: 'यहाँ लिखें...',
  redo: 'फिर से',
  next: 'अगला',
  finish: 'समाप्त करें',
  offlineBanner: 'आप ऑफलाइन हैं। आपके जवाब सुरक्षित हैं।',
  offlineSaveNote: 'कनेक्शन वापस आने पर अपने आप भेजा जाएगा।',
  saveError: 'जमा नहीं हो सका। आपके जवाब सेव हैं — कृपया दोबारा कोशिश करें।',
  switchToType: '⌨ लिखें',
  switchToVoice: '🎙 बोलें',
  aiFollowupTag: 'AI · एक छोटा सवाल',
  voiceUnsupported: 'इस ब्राउज़र में आवाज़ काम नहीं करती — कृपया लिखकर जवाब दें।',
  voiceDenied: 'माइक की अनुमति नहीं मिली — कृपया लिखकर जवाब दें।',

  questions: [
    { text: 'आज आपको कौन सी मुख्य समस्या क्लिनिक लेकर आई है?', hint: 'What brought you in today?' },
    { text: 'यह समस्या कितने समय से चल रही है?', hint: 'How long has this been going on?' },
    { text: 'अभी यह कितना गंभीर है?', hint: 'How severe is it right now?' },
    { text: 'क्या इसके साथ कोई और लक्षण भी हैं?', hint: 'Any other symptoms along with it?' },
    { text: 'आप अभी कौन सी दवाएं ले रहे हैं?', hint: 'What medicines are you currently taking?' },
    {
      text: 'क्या आपको दवाओं या किसी और चीज से एलर्जी है?',
      hint: 'Any allergies to medicines or anything else?',
    },
    {
      text: 'क्या आपको पहले कोई बीमारी, सर्जरी या अन्य समस्या रही है?',
      hint: 'Any past illnesses, surgeries, or conditions?',
    },
  ],

  // Review
  reviewLabel: 'समीक्षा',
  reviewHeading: 'यह हमने नोट किया',
  reviewSubheading: 'डॉक्टर के लिए यह नोट किया गया है। कृपया जांचें।',
  chiefComplaint: 'मुख्य समस्या',
  duration: 'समय',
  severity: 'गंभीरता',
  medications: 'दवाएं',
  allergies: 'एलर्जी',
  confirmButton: 'सही है, भेज दें',
  organizingText: 'हम आपके उत्तरों को व्यवस्थित कर रहे हैं...',
  organizingSubtext: 'डॉक्टर के लिए नोट तैयार हो रहा है...',

  // Success
  successHeading: 'धन्यवाद!',
  successSubheading: 'आपका नोट डॉक्टर को भेज दिया गया है।',
  successNote: 'कृपया अपनी बारी का इंतज़ार करें।',
};

const ENGLISH: PatientStrings = {
  // Check-in
  checkInSubtitle: 'Guided clinical intake for your visit today.',
  selectLanguage: 'Select Language',
  getStarted: 'Get Started',
  privacyNote: 'Your data is secure and shared only with your treating physician.',

  // Consent
  consentTitle: 'Consent & Privacy',
  consentHeading: 'Your Privacy Matters',
  consentBody1: 'We collect your voice and health information to prepare a note for your doctor.',
  consentBody2: 'This information is shared only with your treating doctor and clinic staff.',
  consentBody3: 'You can withdraw your consent at any time.',
  consentButton: 'I Consent',
  goBack: 'Go Back',

  // Intake
  questionLabel: (c, t) => `Question ${c} of ${t}`,
  pressToSpeak: 'Press to speak',
  stopRecording: 'Press when done',
  listening: 'Listening...',
  speakNow: 'Speak now...',
  typeAnswer: 'Type your answer',
  typeHere: 'Type here...',
  redo: 'Redo',
  next: 'Next',
  finish: 'Finish',
  offlineBanner: "You're offline. Your answers are being saved locally.",
  offlineSaveNote: 'They will sync automatically when you reconnect.',
  saveError: 'Could not submit. Your answers are saved — please try again.',
  switchToType: '⌨ Type',
  switchToVoice: '🎙 Speak',
  aiFollowupTag: 'AI · one small question',
  voiceUnsupported: 'Voice input is not supported in this browser — please type your answer.',
  voiceDenied: 'Microphone permission denied — please type your answer.',

  questions: [
    { text: 'What is the main problem bringing you in today?', hint: '' },
    { text: 'How long has this been going on?', hint: '' },
    { text: 'How bad is it right now?', hint: '' },
    { text: 'Any other symptoms along with it?', hint: '' },
    { text: 'What medicines are you currently taking?', hint: '' },
    { text: 'Any allergies to medicines or anything else?', hint: '' },
    { text: 'Any past illnesses, surgeries, or conditions the doctor should know?', hint: '' },
  ],

  // Review
  reviewLabel: 'Review Summary',
  reviewHeading: "Here's what we noted",
  reviewSubheading: "Here's what we noted for the doctor. Please check it.",
  chiefComplaint: 'Chief Complaint',
  duration: 'Duration',
  severity: 'Severity',
  medications: 'Medications',
  allergies: 'Allergies',
  confirmButton: 'Correct, send it',
  organizingText: 'Organizing your answers...',
  organizingSubtext: 'Preparing note for the doctor...',

  // Success
  successHeading: 'Thank you!',
  successSubheading: 'Your note has been sent to the doctor.',
  successNote: 'Please wait for your turn.',
};

// ── Language registry ──────────────────────────────────────────────────────
// Add new languages here. The key must match the stored language string.
export const LANGUAGE_STRINGS: Record<string, PatientStrings> = {
  Hindi: HINDI,
  English: ENGLISH,
};

// Fallback to English for any unsupported language
export function getStrings(lang: string): PatientStrings {
  return LANGUAGE_STRINGS[lang] ?? ENGLISH;
}

// The patient picks the language they'll answer in. Hindi and English have
// fully localized question text; the other major Indian languages currently
// show English question text (getStrings falls back to ENGLISH) but the patient
// can still answer in their own language — the AI structuring step detects and
// translates it to English for the doctor.
export const AVAILABLE_LANGUAGES: { code: string; label: string; nativeLabel: string }[] = [
  { code: 'Hindi', label: 'Hindi', nativeLabel: 'हिन्दी' },
  { code: 'English', label: 'English', nativeLabel: 'English' },
  { code: 'Bengali', label: 'Bengali', nativeLabel: 'বাংলা' },
  { code: 'Tamil', label: 'Tamil', nativeLabel: 'தமிழ்' },
  { code: 'Telugu', label: 'Telugu', nativeLabel: 'తెలుగు' },
  { code: 'Marathi', label: 'Marathi', nativeLabel: 'मराठी' },
  { code: 'Gujarati', label: 'Gujarati', nativeLabel: 'ગુજરાતી' },
  { code: 'Kannada', label: 'Kannada', nativeLabel: 'ಕನ್ನಡ' },
  { code: 'Malayalam', label: 'Malayalam', nativeLabel: 'മലയാളം' },
  { code: 'Punjabi', label: 'Punjabi', nativeLabel: 'ਪੰਜਾਬੀ' },
  { code: 'Urdu', label: 'Urdu', nativeLabel: 'اردو' },
];

export const LANG_STORAGE_KEY = 'vaid-patient-language';
