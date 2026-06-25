export interface FormularyDrug {
  name: string;
  category: string;
  strengths: string[];
  defaultDose: string;
  defaultFrequency: string;
  defaultDuration: string;
}

export const FREQUENCIES = ['OD', 'BD', 'TDS', 'QDS', 'SOS', 'Weekly', 'Monthly', 'HS'];
export const DURATIONS = [
  '3 days',
  '5 days',
  '7 days',
  '10 days',
  '14 days',
  '30 days',
  '3 months',
  'Ongoing',
];

export const FORMULARY: FormularyDrug[] = [
  // Analgesic / Anti-pyretic
  {
    name: 'Paracetamol',
    category: 'Analgesic',
    strengths: ['500mg', '650mg', '1000mg'],
    defaultDose: '1 tablet',
    defaultFrequency: 'TDS',
    defaultDuration: '5 days',
  },
  {
    name: 'Ibuprofen',
    category: 'NSAID',
    strengths: ['200mg', '400mg', '600mg'],
    defaultDose: '1 tablet',
    defaultFrequency: 'BD',
    defaultDuration: '5 days',
  },
  {
    name: 'Diclofenac',
    category: 'NSAID',
    strengths: ['25mg', '50mg'],
    defaultDose: '1 tablet',
    defaultFrequency: 'BD',
    defaultDuration: '5 days',
  },
  {
    name: 'Aspirin',
    category: 'Analgesic',
    strengths: ['75mg', '150mg', '325mg'],
    defaultDose: '1 tablet',
    defaultFrequency: 'OD',
    defaultDuration: '30 days',
  },

  // Antibiotics
  {
    name: 'Amoxicillin',
    category: 'Antibiotic',
    strengths: ['250mg', '500mg'],
    defaultDose: '1 capsule',
    defaultFrequency: 'TDS',
    defaultDuration: '7 days',
  },
  {
    name: 'Amoxicillin-Clavulanate',
    category: 'Antibiotic',
    strengths: ['375mg', '625mg'],
    defaultDose: '1 tablet',
    defaultFrequency: 'BD',
    defaultDuration: '7 days',
  },
  {
    name: 'Azithromycin',
    category: 'Antibiotic',
    strengths: ['250mg', '500mg'],
    defaultDose: '1 tablet',
    defaultFrequency: 'OD',
    defaultDuration: '5 days',
  },
  {
    name: 'Ciprofloxacin',
    category: 'Antibiotic',
    strengths: ['250mg', '500mg'],
    defaultDose: '1 tablet',
    defaultFrequency: 'BD',
    defaultDuration: '7 days',
  },
  {
    name: 'Doxycycline',
    category: 'Antibiotic',
    strengths: ['100mg'],
    defaultDose: '1 capsule',
    defaultFrequency: 'BD',
    defaultDuration: '7 days',
  },
  {
    name: 'Metronidazole',
    category: 'Antibiotic',
    strengths: ['200mg', '400mg'],
    defaultDose: '1 tablet',
    defaultFrequency: 'TDS',
    defaultDuration: '7 days',
  },

  // Antihistamine / Allergy
  {
    name: 'Cetirizine',
    category: 'Antihistamine',
    strengths: ['5mg', '10mg'],
    defaultDose: '1 tablet',
    defaultFrequency: 'OD',
    defaultDuration: '5 days',
  },
  {
    name: 'Levocetirizine',
    category: 'Antihistamine',
    strengths: ['5mg'],
    defaultDose: '1 tablet',
    defaultFrequency: 'OD',
    defaultDuration: '5 days',
  },
  {
    name: 'Fexofenadine',
    category: 'Antihistamine',
    strengths: ['120mg', '180mg'],
    defaultDose: '1 tablet',
    defaultFrequency: 'OD',
    defaultDuration: '5 days',
  },

  // GI / Antacids
  {
    name: 'Omeprazole',
    category: 'PPI',
    strengths: ['20mg', '40mg'],
    defaultDose: '1 capsule',
    defaultFrequency: 'OD',
    defaultDuration: '14 days',
  },
  {
    name: 'Pantoprazole',
    category: 'PPI',
    strengths: ['40mg'],
    defaultDose: '1 tablet',
    defaultFrequency: 'OD',
    defaultDuration: '14 days',
  },
  {
    name: 'Rabeprazole',
    category: 'PPI',
    strengths: ['20mg'],
    defaultDose: '1 tablet',
    defaultFrequency: 'OD',
    defaultDuration: '14 days',
  },
  {
    name: 'Domperidone',
    category: 'Prokinetic',
    strengths: ['10mg'],
    defaultDose: '1 tablet',
    defaultFrequency: 'TDS',
    defaultDuration: '5 days',
  },
  {
    name: 'Ondansetron',
    category: 'Antiemetic',
    strengths: ['4mg', '8mg'],
    defaultDose: '1 tablet',
    defaultFrequency: 'BD',
    defaultDuration: '3 days',
  },

  // Cough / Cold
  {
    name: 'Dextromethorphan',
    category: 'Antitussive',
    strengths: ['10mg', '15mg/5ml'],
    defaultDose: '10ml',
    defaultFrequency: 'TDS',
    defaultDuration: '5 days',
  },
  {
    name: 'Ambroxol',
    category: 'Mucolytic',
    strengths: ['30mg', '75mg SR'],
    defaultDose: '1 tablet',
    defaultFrequency: 'BD',
    defaultDuration: '7 days',
  },
  {
    name: 'Salbutamol',
    category: 'Bronchodilator',
    strengths: ['2mg', '4mg', '100mcg inhaler'],
    defaultDose: '2 puffs',
    defaultFrequency: 'TDS',
    defaultDuration: '7 days',
  },
  {
    name: 'Montelukast',
    category: 'Antileukotriene',
    strengths: ['10mg'],
    defaultDose: '1 tablet',
    defaultFrequency: 'OD',
    defaultDuration: '30 days',
  },

  // Antidiabetic
  {
    name: 'Metformin',
    category: 'Antidiabetic',
    strengths: ['500mg', '850mg', '1000mg'],
    defaultDose: '1 tablet',
    defaultFrequency: 'BD',
    defaultDuration: '30 days',
  },
  {
    name: 'Glimepiride',
    category: 'Antidiabetic',
    strengths: ['1mg', '2mg', '3mg'],
    defaultDose: '1 tablet',
    defaultFrequency: 'OD',
    defaultDuration: '30 days',
  },
  {
    name: 'Sitagliptin',
    category: 'Antidiabetic',
    strengths: ['50mg', '100mg'],
    defaultDose: '1 tablet',
    defaultFrequency: 'OD',
    defaultDuration: '30 days',
  },

  // Antihypertensive
  {
    name: 'Amlodipine',
    category: 'CCB',
    strengths: ['2.5mg', '5mg', '10mg'],
    defaultDose: '1 tablet',
    defaultFrequency: 'OD',
    defaultDuration: '30 days',
  },
  {
    name: 'Atenolol',
    category: 'Beta-blocker',
    strengths: ['25mg', '50mg', '100mg'],
    defaultDose: '1 tablet',
    defaultFrequency: 'OD',
    defaultDuration: '30 days',
  },
  {
    name: 'Enalapril',
    category: 'ACE Inhibitor',
    strengths: ['2.5mg', '5mg', '10mg'],
    defaultDose: '1 tablet',
    defaultFrequency: 'OD',
    defaultDuration: '30 days',
  },
  {
    name: 'Losartan',
    category: 'ARB',
    strengths: ['25mg', '50mg'],
    defaultDose: '1 tablet',
    defaultFrequency: 'OD',
    defaultDuration: '30 days',
  },
  {
    name: 'Telmisartan',
    category: 'ARB',
    strengths: ['40mg', '80mg'],
    defaultDose: '1 tablet',
    defaultFrequency: 'OD',
    defaultDuration: '30 days',
  },

  // Vitamins / Supplements
  {
    name: 'Vitamin D3',
    category: 'Supplement',
    strengths: ['1000 IU', '60000 IU'],
    defaultDose: '1 sachet',
    defaultFrequency: 'Weekly',
    defaultDuration: '8 weeks',
  },
  {
    name: 'Vitamin B12',
    category: 'Supplement',
    strengths: ['500mcg', '1500mcg'],
    defaultDose: '1 tablet',
    defaultFrequency: 'OD',
    defaultDuration: '30 days',
  },
  {
    name: 'B-Complex',
    category: 'Supplement',
    strengths: ['standard'],
    defaultDose: '1 tablet',
    defaultFrequency: 'OD',
    defaultDuration: '30 days',
  },
  {
    name: 'Ferrous Sulfate',
    category: 'Supplement',
    strengths: ['200mg'],
    defaultDose: '1 tablet',
    defaultFrequency: 'BD',
    defaultDuration: '30 days',
  },
  {
    name: 'Calcium + Vitamin D3',
    category: 'Supplement',
    strengths: ['500mg+250IU', '1000mg+500IU'],
    defaultDose: '1 tablet',
    defaultFrequency: 'BD',
    defaultDuration: '30 days',
  },

  // Thyroid
  {
    name: 'Levothyroxine',
    category: 'Thyroid',
    strengths: ['25mcg', '50mcg', '75mcg', '100mcg'],
    defaultDose: '1 tablet',
    defaultFrequency: 'OD',
    defaultDuration: '30 days',
  },

  // Statins / Lipid
  {
    name: 'Atorvastatin',
    category: 'Statin',
    strengths: ['10mg', '20mg', '40mg'],
    defaultDose: '1 tablet',
    defaultFrequency: 'OD',
    defaultDuration: '30 days',
  },
  {
    name: 'Rosuvastatin',
    category: 'Statin',
    strengths: ['5mg', '10mg', '20mg'],
    defaultDose: '1 tablet',
    defaultFrequency: 'OD',
    defaultDuration: '30 days',
  },

  // Musculoskeletal
  {
    name: 'Thiocolchicoside',
    category: 'Muscle Relaxant',
    strengths: ['4mg', '8mg'],
    defaultDose: '1 tablet',
    defaultFrequency: 'BD',
    defaultDuration: '7 days',
  },
  {
    name: 'Methocarbamol',
    category: 'Muscle Relaxant',
    strengths: ['500mg', '750mg'],
    defaultDose: '1 tablet',
    defaultFrequency: 'TDS',
    defaultDuration: '7 days',
  },
];
