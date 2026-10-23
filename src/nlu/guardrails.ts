export interface GuardrailCheck {
  isRefusal: boolean;
  reason?: string;
  refusalReply?: string;
}

const MEDICAL_ADVICE_PATTERNS: RegExp[] = [
  // Prescriptions and medication advice
  /\b(what|which)\s+(drug|medication|antibiotic|dose|dosage|medicine|injection)\s+(should|can|to)\s+(i|we|give|prescribe|administer)\b/i,
  /\b(how\s+much|what\s+dose|dosage)\s+of\s+[a-z0-9_-]+\s+(should|can)\s+(i|we|be\s+given)\b/i,
  /\b(prescribe|suggest|recommend)\s+(medication|drug|dose|treatment|cure|antibiotic)\b/i,
  /\bshould\s+i\s+(give|prescribe|administer|increase|decrease|stop|start)\s+[a-z0-9_-]+\b/i,
  
  // Clinical diagnosis and treatment
  /\bwhat\s+(is\s+the\s+diagnosis|condition\s+is\s+this|disease)\b/i,
  /\bhow\s+to\s+treat\s+[a-z0-9_-]+\b/i,
  /\bdiagnose\s+(this\s+patient|the\s+symptoms|bed)\b/i,
  
  // Interpretation of vitals or lab values
  /\b(is|are)\s+(the\s+)?(potassium|sodium|creatinine|bp|blood\s+pressure|heart\s+rate|spo2|oxygen|troponin|sugar|glucose)\s+([0-9.]+\s+)?(dangerous|critical|abnormal|high|low|fatal|life[- ]threatening|too\s+high|too\s+low)\b/i,
  /\binterpret\s+(the\s+)?(ecg|x-?ray|ct|mri|lab|blood\s+report|vitals|results)\b/i,
  /\bwhat\s+does\s+(a\s+)?(bp|potassium|creatinine|hemoglobin|hb|inr)\s+of\s+[0-9.]+\s+mean\b/i,
  /\bpatient\s+(has|having)\s+(bp|blood\s+pressure|fever|pulse)\s+[0-9./]+\s*,?\s*what\s+(should|can)\s+(i|we)\s+do\b/i,

  // Hindi / Hinglish patterns
  /\b(kya\s+dava|kaunsi\s+dava|kya\s+injection|kitni\s+dose|kya\s+ilaaj)\b/i,
  /\b(dava\s+batao|ilaaj\s+batao|kya\s+karein|kya\s+karna\s+chahiye|dava\s+den|dena\s+chahiye)\b/i,
  /\b(bp|sugar|potassium)\s+(zyada|kam|danger|khatarnaak)\s+hai\s+kya\b/i,
  /\b(ecg|report)\s+(samjhao|ka\s+matlab|dekh\s+kar\s+batao)\b/i,

  // Telugu patterns
  /ఏ\s*మందు|ఎంత\s*డోస్|చికిత్స|వైద్య\s*సలహా|రిపోర్ట్\s*చూసి\s*చెప్పండి|ప్రమాదకరమా/i,
];

export function checkMedicalAdviceGuardrail(text: string, language: string = 'en'): GuardrailCheck {
  const clean = text.trim();

  for (const pattern of MEDICAL_ADVICE_PATTERNS) {
    if (pattern.test(clean)) {
      let refusalReply: string;
      if (language === 'hi') {
        refusalReply = 'WardOS केवल प्रशासनिक वार्ड सहायक है। मैं कोई डॉक्टरी सलाह, दवा, डोज़ या जाँच की व्याख्या नहीं दे सकता। कृपया उपस्थित डॉक्टर से परामर्श लें।';
      } else if (language === 'te') {
        refusalReply = 'WardOS కేవలం వార్డ్ అడ్మినిస్ట్రేషన్ సహాయకం మాత్రమే. నేను వైద్య సలహాలు, మందుల మోతాదు లేదా డయాగ్నసిస్ ఇవ్వలేను. దయచేసి డ్యూటీ వైద్యుడిని సంప్రదించండి.';
      } else {
        refusalReply = 'WardOS is an administrative ward assistant only. I cannot provide medical advice, diagnosis, drug dosages, or clinical interpretations. Please consult the attending doctor.';
      }

      return {
        isRefusal: true,
        reason: 'Administrative scope guardrail: Query requests clinical advice, diagnosis, dosing, or lab interpretation.',
        refusalReply,
      };
    }
  }

  return { isRefusal: false };
}
