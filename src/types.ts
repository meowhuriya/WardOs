export type Role = 'doctor' | 'nurse';

export type BedStatus = 'occupied' | 'empty' | 'awaiting discharge' | 'awaiting transfer';

export interface DischargeChecklist {
  summary_written: boolean;
  bill_cleared: boolean;
  medicines_handed_over: boolean;
  follow_up_date_given: boolean;
  transport_arranged: boolean;
}

export interface Patient {
  id: string;
  name: string;
  age: number;
  bed: string;
  admitted_at: string;
  diagnosis_as_stated: string;
  status: BedStatus;
  discharge_checklist?: DischargeChecklist;
}

export interface Task {
  id: string;
  patient_id?: string;
  bed?: string;
  patient_name?: string;
  description: string;
  assigned_role: Role | 'all';
  due_time: string; // ISO string
  completed: boolean;
  completed_at?: string;
  completed_by?: string;
  completed_by_role?: Role;
  created_at: string;
  created_by_role: Role;
}

export interface RoundNote {
  id: string;
  patient_id: string;
  patient_name: string;
  bed: string;
  observations_as_stated: string;
  plan_as_stated: string;
  status: 'draft' | 'approved';
  created_at: string;
  created_by: string;
  created_by_role: Role;
  approved_at?: string;
  approved_by?: string;
}

export type PendingItemType = 'lab' | 'imaging' | 'consult' | 'document';

export interface PendingItem {
  id: string;
  patient_id: string;
  patient_name: string;
  bed: string;
  type: PendingItemType;
  description: string;
  status: 'pending' | 'received';
  created_at: string;
  received_at?: string;
  received_by_role?: Role;
}

export interface HandoverPatientItem {
  patient_id: string;
  bed: string;
  name: string;
  approved_round_note_as_stated: string;
  open_tasks: string[];
  pending_items: string[];
  discharge_status: string;
}

export interface ShiftHandover {
  id: string;
  from_shift: string;
  to_shift: string;
  created_at: string;
  created_by: string;
  created_by_role: Role;
  status: 'draft' | 'approved';
  patients: HandoverPatientItem[];
  approved_at?: string;
  approved_by?: string;
  read_back_confirmed: boolean;
}

export interface AuditLogEntry {
  id: string;
  timestamp: string;
  category: 'admin' | 'security';
  action: string;
  role: Role | 'system';
  staff_id?: string;
  staff_name?: string;
  original_text?: string;
  details: Record<string, any>;
}

export interface Staff {
  id: string;
  name: string;
  role: Role;
  pin_hash: string;
  salt: string;
  failed_attempts: number;
  locked_until: number | null;
}

export interface WardData {
  ward_name: string;
  total_beds: number;
  patients: Patient[];
  tasks: Task[];
  round_notes: RoundNote[];
  pending_items: PendingItem[];
  handovers: ShiftHandover[];
  audit_log: AuditLogEntry[];
  estimated_time_saved_minutes: number;
  current_round_index: number;
}

export interface UserSession {
  staff_id: string;
  name: string;
  role: Role;
  lastStepUpAt: number; // timestamp
}
