import fs from 'node:fs';
import crypto from 'node:crypto';
import { config } from './config.js';
import { getContext } from './context.js';
import {
  AuditLogEntry,
  BedStatus,
  DischargeChecklist,
  HandoverPatientItem,
  Patient,
  PendingItem,
  PendingItemType,
  Role,
  RoundNote,
  ShiftHandover,
  Task,
  WardData,
} from './types.js';

let cachedWardData: WardData | null = null;

export function loadWardData(): WardData {
  if (cachedWardData) {
    return cachedWardData;
  }
  if (!fs.existsSync(config.paths.wardDataFile)) {
    seedWardData();
  }
  try {
    const raw = fs.readFileSync(config.paths.wardDataFile, 'utf-8');
    cachedWardData = JSON.parse(raw);
    return cachedWardData!;
  } catch (err) {
    console.error('Error reading ward.json, re-seeding:', err);
    seedWardData();
    const raw = fs.readFileSync(config.paths.wardDataFile, 'utf-8');
    cachedWardData = JSON.parse(raw);
    return cachedWardData!;
  }
}

export function saveWardData(data: WardData): void {
  cachedWardData = data;
  if (!fs.existsSync(config.paths.dataDir)) {
    fs.mkdirSync(config.paths.dataDir, { recursive: true });
  }
  fs.writeFileSync(config.paths.wardDataFile, JSON.stringify(data, null, 2), 'utf-8');
}

export function logAudit(
  action: string,
  category: 'admin' | 'security',
  details: Record<string, any> = {},
  explicitRole?: Role | 'system',
  explicitText?: string
): void {
  const ctx = getContext();
  const data = loadWardData();
  const entry: AuditLogEntry = {
    id: `audit-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
    timestamp: new Date().toISOString(),
    category,
    action,
    role: explicitRole || ctx?.role || 'system',
    staff_id: ctx?.staffId,
    staff_name: ctx?.staffName,
    original_text: explicitText || ctx?.originalText || undefined,
    details,
  };
  data.audit_log.unshift(entry);
  if (data.audit_log.length > 500) {
    data.audit_log = data.audit_log.slice(0, 500);
  }
  saveWardData(data);
}

export function addTimeSaved(minutes: number): void {
  const data = loadWardData();
  data.estimated_time_saved_minutes = (data.estimated_time_saved_minutes || 0) + minutes;
  saveWardData(data);
}

// Forgiving match for patient name or bed
export function findPatient(query: string): Patient | undefined {
  const data = loadWardData();
  const clean = query.trim().toLowerCase();

  // Match by exact bed or number
  const bedNum = clean.replace(/^(bed|b)\s*/i, '').trim();
  const byBed = data.patients.find(p => {
    const pBedNum = p.bed.toLowerCase().replace(/^(bed|b)\s*/i, '').trim();
    return pBedNum === bedNum || p.bed.toLowerCase() === clean;
  });
  if (byBed) return byBed;

  // Match by exact name
  const byExactName = data.patients.find(p => p.name.toLowerCase() === clean);
  if (byExactName) return byExactName;

  // Match by partial name or first/last name
  const byPartial = data.patients.find(p => {
    const pLower = p.name.toLowerCase();
    return pLower.includes(clean) || clean.includes(pLower);
  });
  if (byPartial) return byPartial;

  // Match individual words (e.g. "Ramesh" in "Ramesh Gupta")
  const words = clean.split(/\s+/).filter(w => w.length > 2);
  if (words.length > 0) {
    const byWord = data.patients.find(p => {
      const pWords = p.name.toLowerCase().split(/\s+/);
      return words.some(w => pWords.some(pw => pw.includes(w) || w.includes(pw)));
    });
    if (byWord) return byWord;
  }

  return undefined;
}

export function seedWardData(): void {
  const initialPatients: Patient[] = [
    {
      id: 'pat-1',
      name: 'Ramesh Gupta',
      age: 58,
      bed: 'Bed 1',
      admitted_at: new Date(Date.now() - 36 * 3600000).toISOString(),
      diagnosis_as_stated: 'Admitted for routine post-appendectomy recovery observation',
      status: 'occupied',
    },
    {
      id: 'pat-2',
      name: 'Sunita Devi',
      age: 46,
      bed: 'Bed 2',
      admitted_at: new Date(Date.now() - 48 * 3600000).toISOString(),
      diagnosis_as_stated: 'Dehydration and seasonal viral fever management',
      status: 'occupied',
    },
    {
      id: 'pat-3',
      name: 'Venkat Rao',
      age: 62,
      bed: 'Bed 3',
      admitted_at: new Date(Date.now() - 72 * 3600000).toISOString(),
      diagnosis_as_stated: 'Mild asthma exacerbation under observation',
      status: 'occupied',
    },
    {
      id: 'pat-4',
      name: 'Lakshmi Narayana',
      age: 70,
      bed: 'Bed 4',
      admitted_at: new Date(Date.now() - 96 * 3600000).toISOString(),
      diagnosis_as_stated: 'Orthopedic post-fracture rehab observation',
      status: 'awaiting discharge',
      discharge_checklist: {
        summary_written: true,
        bill_cleared: true,
        medicines_handed_over: true,
        follow_up_date_given: false,
        transport_arranged: false,
      },
    },
    {
      id: 'pat-5',
      name: 'Anil Deshmukh',
      age: 39,
      bed: 'Bed 5',
      admitted_at: new Date(Date.now() - 20 * 3600000).toISOString(),
      diagnosis_as_stated: 'Acute gastroenteritis hydration monitoring',
      status: 'occupied',
    },
    {
      id: 'pat-6',
      name: 'Pooja Sharma',
      age: 28,
      bed: 'Bed 6',
      admitted_at: new Date(Date.now() - 15 * 3600000).toISOString(),
      diagnosis_as_stated: 'Elective minor surgical observation',
      status: 'occupied',
    },
    {
      id: 'pat-7',
      name: 'Mohammed Farooq',
      age: 52,
      bed: 'Bed 7',
      admitted_at: new Date(Date.now() - 84 * 3600000).toISOString(),
      diagnosis_as_stated: 'Hypertension monitoring and medication adjustment',
      status: 'awaiting discharge',
      discharge_checklist: {
        summary_written: true,
        bill_cleared: false,
        medicines_handed_over: false,
        follow_up_date_given: true,
        transport_arranged: false,
      },
    },
    {
      id: 'pat-8',
      name: 'Kavitha Reddy',
      age: 34,
      bed: 'Bed 8',
      admitted_at: new Date(Date.now() - 12 * 3600000).toISOString(),
      diagnosis_as_stated: 'Urinary tract infection observation course',
      status: 'occupied',
    },
    {
      id: 'pat-9',
      name: 'Suresh Patil',
      age: 65,
      bed: 'Bed 9',
      admitted_at: new Date(Date.now() - 60 * 3600000).toISOString(),
      diagnosis_as_stated: 'Chronic kidney disease stage 3 routine electrolyte check',
      status: 'occupied',
    },
    {
      id: 'pat-10',
      name: 'Meena Kumari',
      age: 50,
      bed: 'Bed 10',
      admitted_at: new Date(Date.now() - 24 * 3600000).toISOString(),
      diagnosis_as_stated: 'Post-laparoscopic cholecystectomy day 2',
      status: 'occupied',
    },
    {
      id: 'pat-11',
      name: 'Rajendra Prasad',
      age: 74,
      bed: 'Bed 11',
      admitted_at: new Date(Date.now() - 110 * 3600000).toISOString(),
      diagnosis_as_stated: 'COPD chronic stable monitoring',
      status: 'awaiting transfer',
    },
    {
      id: 'pat-12',
      name: 'Deepa Krishnan',
      age: 31,
      bed: 'Bed 12',
      admitted_at: new Date(Date.now() - 18 * 3600000).toISOString(),
      diagnosis_as_stated: 'Migraine crisis symptom relief and rest',
      status: 'occupied',
    },
    {
      id: 'pat-13',
      name: 'Harpreet Singh',
      age: 44,
      bed: 'Bed 13',
      admitted_at: new Date(Date.now() - 40 * 3600000).toISOString(),
      diagnosis_as_stated: 'Cellulitis right lower leg IV line management',
      status: 'occupied',
    },
    {
      id: 'pat-14',
      name: 'Swati Mukherjee',
      age: 22,
      bed: 'Bed 14',
      admitted_at: new Date(Date.now() - 8 * 3600000).toISOString(),
      diagnosis_as_stated: 'Food poisoning rehydration protocol',
      status: 'occupied',
    },
  ];

  const now = Date.now();
  const initialTasks: Task[] = [
    {
      id: 'task-1',
      patient_id: 'pat-1',
      bed: 'Bed 1',
      patient_name: 'Ramesh Gupta',
      description: 'Check surgical wound dressing and change gauze if soiled',
      assigned_role: 'nurse',
      due_time: new Date(now - 45 * 60000).toISOString(), // OVERDUE by 45m
      completed: false,
      created_at: new Date(now - 120 * 60000).toISOString(),
      created_by_role: 'doctor',
    },
    {
      id: 'task-2',
      patient_id: 'pat-2',
      bed: 'Bed 2',
      patient_name: 'Sunita Devi',
      description: 'Record evening intake/output chart for rehydration fluid balance',
      assigned_role: 'nurse',
      due_time: new Date(now + 60 * 60000).toISOString(), // Due in 1 hour
      completed: false,
      created_at: new Date(now - 60 * 60000).toISOString(),
      created_by_role: 'doctor',
    },
    {
      id: 'task-3',
      patient_id: 'pat-3',
      bed: 'Bed 3',
      patient_name: 'Venkat Rao',
      description: 'Verify oxygen flow rate setting on wall regulator',
      assigned_role: 'nurse',
      due_time: new Date(now - 15 * 60000).toISOString(), // OVERDUE by 15m
      completed: false,
      created_at: new Date(now - 90 * 60000).toISOString(),
      created_by_role: 'doctor',
    },
    {
      id: 'task-4',
      patient_id: 'pat-4',
      bed: 'Bed 4',
      patient_name: 'Lakshmi Narayana',
      description: 'Collect physiotherapy discharge certificate from rehab desk',
      assigned_role: 'nurse',
      due_time: new Date(now + 120 * 60000).toISOString(),
      completed: false,
      created_at: new Date(now - 30 * 60000).toISOString(),
      created_by_role: 'nurse',
    },
    {
      id: 'task-5',
      patient_id: 'pat-7',
      bed: 'Bed 7',
      patient_name: 'Mohammed Farooq',
      description: 'Call billing department for final pharmacy clearance summary',
      assigned_role: 'nurse',
      due_time: new Date(now + 30 * 60000).toISOString(),
      completed: false,
      created_at: new Date(now - 20 * 60000).toISOString(),
      created_by_role: 'doctor',
    },
    {
      id: 'task-6',
      patient_id: 'pat-9',
      bed: 'Bed 9',
      patient_name: 'Suresh Patil',
      description: 'Ensure morning fasting water restriction sign is placed',
      assigned_role: 'nurse',
      due_time: new Date(now - 90 * 60000).toISOString(),
      completed: true,
      completed_at: new Date(now - 30 * 60000).toISOString(),
      completed_by: 'Nurse Ananya Rao',
      completed_by_role: 'nurse',
      created_at: new Date(now - 180 * 60000).toISOString(),
      created_by_role: 'doctor',
    },
  ];

  const initialPendingItems: PendingItem[] = [
    {
      id: 'pend-1',
      patient_id: 'pat-1',
      patient_name: 'Ramesh Gupta',
      bed: 'Bed 1',
      type: 'lab',
      description: 'Complete Blood Count (CBC) post-op check',
      status: 'pending',
      created_at: new Date(now - 180 * 60000).toISOString(),
    },
    {
      id: 'pend-2',
      patient_id: 'pat-3',
      patient_name: 'Venkat Rao',
      bed: 'Bed 3',
      type: 'imaging',
      description: 'Repeat Chest X-ray portable PA view',
      status: 'pending',
      created_at: new Date(now - 240 * 60000).toISOString(),
    },
    {
      id: 'pend-3',
      patient_id: 'pat-5',
      patient_name: 'Anil Deshmukh',
      bed: 'Bed 5',
      type: 'lab',
      description: 'Serum electrolytes report from central biochemistry',
      status: 'pending',
      created_at: new Date(now - 60 * 60000).toISOString(),
    },
    {
      id: 'pend-4',
      patient_id: 'pat-7',
      patient_name: 'Mohammed Farooq',
      bed: 'Bed 7',
      type: 'document',
      description: 'Discharge summary counter-signature from attending physician',
      status: 'pending',
      created_at: new Date(now - 45 * 60000).toISOString(),
    },
    {
      id: 'pend-5',
      patient_id: 'pat-9',
      patient_name: 'Suresh Patil',
      bed: 'Bed 9',
      type: 'consult',
      description: 'Nephrology routine review notes',
      status: 'received',
      created_at: new Date(now - 300 * 60000).toISOString(),
      received_at: new Date(now - 90 * 60000).toISOString(),
      received_by_role: 'doctor',
    },
  ];

  const initialRoundNotes: RoundNote[] = [
    {
      id: 'note-1',
      patient_id: 'pat-1',
      patient_name: 'Ramesh Gupta',
      bed: 'Bed 1',
      observations_as_stated: 'Patient alert, resting comfortably, surgical site clean and dry',
      plan_as_stated: 'Continue normal diet progression and ambulate with support this afternoon',
      status: 'approved',
      created_at: new Date(now - 180 * 60000).toISOString(),
      created_by: 'Dr. Aarav Sharma',
      created_by_role: 'doctor',
      approved_at: new Date(now - 170 * 60000).toISOString(),
      approved_by: 'Dr. Aarav Sharma',
    },
    {
      id: 'note-2',
      patient_id: 'pat-4',
      patient_name: 'Lakshmi Narayana',
      bed: 'Bed 4',
      observations_as_stated: 'Physiotherapy mobility milestone achieved, walking with walker',
      plan_as_stated: 'Process discharge paperwork once family arrives at 16:00',
      status: 'approved',
      created_at: new Date(now - 200 * 60000).toISOString(),
      created_by: 'Dr. Priya Patel',
      created_by_role: 'doctor',
      approved_at: new Date(now - 195 * 60000).toISOString(),
      approved_by: 'Dr. Priya Patel',
    },
  ];

  const initialHandover: ShiftHandover = {
    id: 'ho-previous',
    from_shift: 'Night',
    to_shift: 'Morning',
    created_at: new Date(now - 480 * 60000).toISOString(),
    created_by: 'Dr. Priya Patel',
    created_by_role: 'doctor',
    status: 'approved',
    read_back_confirmed: true,
    approved_at: new Date(now - 470 * 60000).toISOString(),
    approved_by: 'Dr. Aarav Sharma',
    patients: [
      {
        patient_id: 'pat-1',
        bed: 'Bed 1',
        name: 'Ramesh Gupta',
        approved_round_note_as_stated: 'Patient alert, resting comfortably, surgical site clean and dry',
        open_tasks: ['Check surgical wound dressing and change gauze if soiled'],
        pending_items: ['Complete Blood Count (CBC) post-op check'],
        discharge_status: 'Not started',
      },
      {
        patient_id: 'pat-4',
        bed: 'Bed 4',
        name: 'Lakshmi Narayana',
        approved_round_note_as_stated: 'Physiotherapy mobility milestone achieved, walking with walker',
        open_tasks: ['Collect physiotherapy discharge certificate from rehab desk'],
        pending_items: ['None'],
        discharge_status: '3/5 checklist items completed (awaiting follow-up date and transport)',
      },
    ],
  };

  const initialAudit: AuditLogEntry[] = [
    {
      id: 'audit-seed-1',
      timestamp: new Date(now - 480 * 60000).toISOString(),
      category: 'admin',
      action: 'approve_handover',
      role: 'doctor',
      staff_name: 'Dr. Aarav Sharma',
      original_text: 'confirm and approve morning shift handover',
      details: { handover_id: 'ho-previous', from_shift: 'Night', to_shift: 'Morning' },
    },
    {
      id: 'audit-seed-2',
      timestamp: new Date(now - 120 * 60000).toISOString(),
      category: 'admin',
      action: 'add_task',
      role: 'doctor',
      staff_name: 'Dr. Aarav Sharma',
      original_text: 'add task for bed 1 wound dressing check',
      details: { bed: 'Bed 1', task_id: 'task-1' },
    },
    {
      id: 'audit-seed-3',
      timestamp: new Date(now - 30 * 60000).toISOString(),
      category: 'admin',
      action: 'complete_task',
      role: 'nurse',
      staff_name: 'Nurse Ananya Rao',
      original_text: 'mark fasting restriction task done for bed 9',
      details: { task_id: 'task-6' },
    },
  ];

  const wardData: WardData = {
    ward_name: 'General Male & Female Medical Ward 4B',
    total_beds: 20,
    patients: initialPatients,
    tasks: initialTasks,
    round_notes: initialRoundNotes,
    pending_items: initialPendingItems,
    handovers: [initialHandover],
    audit_log: initialAudit,
    estimated_time_saved_minutes: 34, // Seeded with previous voice actions
    current_round_index: 0,
  };

  saveWardData(wardData);
}
