export type Role = 'patient' | 'receptionist' | 'doctor' | 'admin';

export interface Clinic {
  id: string;
  name: string;
  address: string;
  branding_json: any;
  default_language: string;
  rx_header_json: any;
  created_at: string;
}

export interface UserProfile {
  id: string;
  name: string;
  email: string;
  role: Role;
  clinic_id: string | null;
}

export interface Visit {
  id: string;
  patient_id: string;
  doctor_id: string | null;
  clinic_id: string;
  token_no: string;
  status: 'CHECKED IN' | 'INTAKE IN PROGRESS' | 'INTAKE COMPLETE' | 'CONSULT' | 'DONE';
  created_at: string;
  checked_in_at: string;
  intake_started_at: string | null;
  intake_completed_at: string | null;
  consult_started_at: string | null;
  closed_at: string | null;
}

export interface IntakeSession {
  id: string;
  visit_id: string;
  language: string;
  audio_refs_json: string[];
  transcript_native: string | null;
  transcript_english: string | null;
  structured_note_json: any;
  confidence_flags_json: string[];
  screen_flags_json: string[];
  consent_id: string | null;
  status: 'PENDING' | 'IN_PROGRESS' | 'COMPLETED';
}

export interface StructuredNote {
  chief_complaint: string;
  history_of_present_illness: string;
  duration: string;
  severity: string;
  associated_symptoms: string[];
  current_medications: string[];
  allergies: string[];
  past_history: string[];
  icd10_suggestions: { code: string; term: string }[];
  confidence_flags: string[];
  screen_flags: string[];
}

export interface PrescriptionItem {
  drug: string;
  strength: string;
  dose: string;
  frequency: string;
  duration: string;
  instructions: string;
}

export interface Prescription {
  id: string;
  visit_id: string;
  doctor_id: string;
  items_json: PrescriptionItem[];
  advice: string;
  follow_up_date: string | null;
  generated_at: string;
  shared_channels_json: string[];
}

export interface PatientDocument {
  id: string;
  patient_id: string;
  visit_id: string | null;
  type: string;
  file_ref: string;
  ocr_text: string | null;
  created_at: string;
}
