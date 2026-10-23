import crypto from 'node:crypto';
import { getContext, requireRole, requireStepUp } from '../context.js';
import {
  addTimeSaved,
  findPatient,
  loadWardData,
  logAudit,
  saveWardData,
} from '../store.js';
import {
  DischargeChecklist,
  HandoverPatientItem,
  Patient,
  PendingItem,
  PendingItemType,
  Role,
  RoundNote,
  ShiftHandover,
  Task,
} from '../types.js';

export interface ToolResult {
  success: boolean;
  message: string;
  data?: any;
}

// 1. admit_patient(name, age, bed, diagnosis_as_stated_by_user)
export function admitPatient(
  name: string,
  age: number,
  bed: string,
  diagnosis_as_stated_by_user: string
): ToolResult {
  const role = requireRole(['doctor']);
  requireStepUp(60);

  const data = loadWardData();

  // Validate bed is not already occupied
  const existingPatient = findPatient(bed);
  if (existingPatient) {
    throw new Error(`Bed ${bed} is already occupied by ${existingPatient.name}`);
  }

  const patientId = `pat-${Date.now()}`;
  const newPatient: Patient = {
    id: patientId,
    name: name.trim(),
    age,
    bed: bed.trim(),
    admitted_at: new Date().toISOString(),
    diagnosis_as_stated: diagnosis_as_stated_by_user.trim(),
    status: 'occupied',
  };

  data.patients.push(newPatient);
  saveWardData(data);

  logAudit(
    'admit_patient',
    'admin',
    { patient_id: patientId, bed, name, diagnosis: diagnosis_as_stated_by_user }
  );
  addTimeSaved(2);

  return {
    success: true,
    message: `Patient ${name} admitted to ${bed} successfully.`,
    data: newPatient,
  };
}

// 2. get_patient(name_or_bed)
export function getPatient(name_or_bed: string): ToolResult {
  const patient = findPatient(name_or_bed);
  if (!patient) {
    return {
      success: false,
      message: `No patient found matching '${name_or_bed}'.`,
    };
  }

  const data = loadWardData();
  const openTasks = data.tasks.filter(
    t => !t.completed && (t.patient_id === patient.id || t.bed?.toLowerCase() === patient.bed.toLowerCase())
  );
  const pendingItems = data.pending_items.filter(
    p => p.status === 'pending' && (p.patient_id === patient.id || p.bed?.toLowerCase() === patient.bed.toLowerCase())
  );
  const latestApprovedNote = [...data.round_notes]
    .filter(n => n.patient_id === patient.id && n.status === 'approved')
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())[0];

  return {
    success: true,
    message: `Patient profile for ${patient.name} (${patient.bed}): Status: ${patient.status}, ${openTasks.length} open tasks, ${pendingItems.length} pending items.`,
    data: {
      profile: patient,
      open_tasks: openTasks,
      pending_items: pendingItems,
      latest_approved_note: latestApprovedNote || null,
    },
  };
}

// 3. get_ward_board()
export function getWardBoard(): ToolResult {
  const data = loadWardData();
  const beds = [];

  for (let i = 1; i <= data.total_beds; i++) {
    const bedName = `Bed ${i}`;
    const patient = findPatient(bedName);
    if (patient) {
      const openTasksCount = data.tasks.filter(
        t => !t.completed && (t.patient_id === patient.id || t.bed === patient.bed)
      ).length;
      beds.push({
        bed: bedName,
        patient_name: patient.name,
        patient_id: patient.id,
        status: patient.status,
        open_tasks_count: openTasksCount,
        diagnosis_as_stated: patient.diagnosis_as_stated,
      });
    } else {
      beds.push({
        bed: bedName,
        patient_name: null,
        patient_id: null,
        status: 'empty' as const,
        open_tasks_count: 0,
        diagnosis_as_stated: null,
      });
    }
  }

  return {
    success: true,
    message: `Ward board: ${data.patients.length}/${data.total_beds} beds occupied.`,
    data: {
      ward_name: data.ward_name,
      total_beds: data.total_beds,
      occupied_beds_count: data.patients.length,
      beds,
    },
  };
}

// 4. add_task(patient, description, assigned_role, due_time)
export function addTask(
  patientQuery: string,
  description: string,
  assigned_role: Role | 'all' = 'nurse',
  due_time?: string
): ToolResult {
  const role = requireRole(['doctor', 'nurse']);
  const data = loadWardData();
  const patient = findPatient(patientQuery);

  const taskId = `task-${Date.now()}`;
  const now = new Date();
  const due = due_time
    ? (due_time.includes(':') && !due_time.includes('T')
        ? new Date(now.getFullYear(), now.getMonth(), now.getDate(), ...due_time.split(':').map(Number)).toISOString()
        : new Date(due_time).toISOString())
    : new Date(now.getTime() + 60 * 60000).toISOString(); // Default 1 hour from now

  const newTask: Task = {
    id: taskId,
    patient_id: patient?.id,
    bed: patient ? patient.bed : patientQuery,
    patient_name: patient ? patient.name : undefined,
    description: description.trim(),
    assigned_role: assigned_role || 'nurse',
    due_time: due,
    completed: false,
    created_at: now.toISOString(),
    created_by_role: role,
  };

  data.tasks.push(newTask);
  saveWardData(data);

  logAudit(
    'add_task',
    'admin',
    { task_id: taskId, bed: newTask.bed, description: newTask.description, assigned_to: assigned_role }
  );
  addTimeSaved(2);

  return {
    success: true,
    message: `Task added for ${newTask.bed || 'ward'}: "${newTask.description}" assigned to ${assigned_role}.`,
    data: newTask,
  };
}

// 5. complete_task(task_id) & get_open_tasks(role)
export function completeTask(taskIdOrQuery: string): ToolResult {
  const role = requireRole(['doctor', 'nurse']);
  const data = loadWardData();

  let task = data.tasks.find(t => t.id === taskIdOrQuery);
  if (!task) {
    // Forgiving search by description or bed
    task = data.tasks.find(
      t => !t.completed && (t.description.toLowerCase().includes(taskIdOrQuery.toLowerCase()) || t.bed?.toLowerCase() === taskIdOrQuery.toLowerCase())
    );
  }

  if (!task) {
    return { success: false, message: `Task '${taskIdOrQuery}' not found.` };
  }

  const ctx = getContext();
  task.completed = true;
  task.completed_at = new Date().toISOString();
  task.completed_by = ctx?.staffName || 'Staff';
  task.completed_by_role = role;

  saveWardData(data);
  logAudit('complete_task', 'admin', { task_id: task.id, bed: task.bed, description: task.description });

  return {
    success: true,
    message: `Task "${task.description}" marked complete for ${task.bed}.`,
    data: task,
  };
}

export function getOpenTasks(filterRole?: Role): ToolResult {
  const data = loadWardData();
  const now = Date.now();

  let tasks = data.tasks.filter(t => !t.completed);
  if (filterRole) {
    tasks = tasks.filter(t => t.assigned_role === filterRole || t.assigned_role === 'all');
  }

  // Sort overdue first, then by due time ascending
  tasks.sort((a, b) => new Date(a.due_time).getTime() - new Date(b.due_time).getTime());

  const overdueCount = tasks.filter(t => new Date(t.due_time).getTime() < now).length;

  return {
    success: true,
    message: `Found ${tasks.length} open tasks (${overdueCount} overdue).`,
    data: tasks,
  };
}

// 6. start_rounds() & get_next_round_patient()
export function startRounds(): ToolResult {
  requireRole(['doctor', 'nurse']);
  const data = loadWardData();
  data.current_round_index = 0;
  saveWardData(data);

  const patient = data.patients[0];
  if (!patient) {
    return { success: true, message: 'Ward is currently empty. No patients to round on.' };
  }

  const openTasks = data.tasks.filter(t => !t.completed && (t.patient_id === patient.id || t.bed === patient.bed));
  const pendingItems = data.pending_items.filter(p => p.status === 'pending' && (p.patient_id === patient.id || p.bed === patient.bed));

  logAudit('start_rounds', 'admin', { starting_patient_id: patient.id, bed: patient.bed });

  return {
    success: true,
    message: `Starting rounds at ${patient.bed}: ${patient.name}. ${openTasks.length} open tasks, ${pendingItems.length} pending items.`,
    data: {
      index: 1,
      total_patients: data.patients.length,
      current_patient: patient,
      open_tasks: openTasks,
      pending_items: pendingItems,
    },
  };
}

export function getNextRoundPatient(direction: 'next' | 'prev' = 'next'): ToolResult {
  requireRole(['doctor', 'nurse']);
  const data = loadWardData();
  if (data.patients.length === 0) {
    return { success: false, message: 'No patients in the ward.' };
  }

  if (direction === 'next') {
    data.current_round_index = (data.current_round_index + 1) % data.patients.length;
  } else {
    data.current_round_index = (data.current_round_index - 1 + data.patients.length) % data.patients.length;
  }
  saveWardData(data);

  const patient = data.patients[data.current_round_index];
  const openTasks = data.tasks.filter(t => !t.completed && (t.patient_id === patient.id || t.bed === patient.bed));
  const pendingItems = data.pending_items.filter(p => p.status === 'pending' && (p.patient_id === patient.id || p.bed === patient.bed));

  return {
    success: true,
    message: `${patient.bed}: ${patient.name}. ${openTasks.length} open tasks, ${pendingItems.length} pending items. Diagnosis as stated: ${patient.diagnosis_as_stated}.`,
    data: {
      index: data.current_round_index + 1,
      total_patients: data.patients.length,
      current_patient: patient,
      open_tasks: openTasks,
      pending_items: pendingItems,
    },
  };
}

// 7. draft_round_note(patient, observations_as_stated, plan_as_stated), approve_round_note, edit_round_note
export function draftRoundNote(
  patientQuery: string,
  observations_as_stated: string,
  plan_as_stated: string
): ToolResult {
  const role = requireRole(['doctor']);
  const data = loadWardData();
  const patient = findPatient(patientQuery);
  if (!patient) {
    return { success: false, message: `Patient '${patientQuery}' not found.` };
  }

  const ctx = getContext();
  const noteId = `note-${Date.now()}`;
  const newNote: RoundNote = {
    id: noteId,
    patient_id: patient.id,
    patient_name: patient.name,
    bed: patient.bed,
    observations_as_stated: observations_as_stated?.trim() || 'Not stated',
    plan_as_stated: plan_as_stated?.trim() || 'Not stated',
    status: 'draft',
    created_at: new Date().toISOString(),
    created_by: ctx?.staffName || 'Doctor',
    created_by_role: role,
  };

  data.round_notes.push(newNote);
  saveWardData(data);

  logAudit(
    'draft_round_note',
    'admin',
    { note_id: noteId, patient_id: patient.id, bed: patient.bed }
  );
  addTimeSaved(2);

  return {
    success: true,
    message: `DRAFT round note created for ${patient.name} (${patient.bed}). Observations: "${newNote.observations_as_stated}". Plan: "${newNote.plan_as_stated}". Awaiting doctor approval.`,
    data: newNote,
  };
}

export function approveRoundNote(noteId: string): ToolResult {
  requireRole(['doctor']);
  requireStepUp(60);

  const data = loadWardData();
  const note = data.round_notes.find(n => n.id === noteId);
  if (!note) {
    return { success: false, message: `Round note '${noteId}' not found.` };
  }

  const ctx = getContext();
  note.status = 'approved';
  note.approved_at = new Date().toISOString();
  note.approved_by = ctx?.staffName || 'Doctor';

  saveWardData(data);
  logAudit('approve_round_note', 'admin', { note_id: note.id, patient_id: note.patient_id, bed: note.bed });

  return {
    success: true,
    message: `Round note approved for ${note.patient_name} (${note.bed}).`,
    data: note,
  };
}

export function editRoundNote(
  noteId: string,
  observations?: string,
  plan?: string
): ToolResult {
  requireRole(['doctor']);
  const data = loadWardData();
  const note = data.round_notes.find(n => n.id === noteId);
  if (!note) {
    return { success: false, message: `Round note '${noteId}' not found.` };
  }

  if (observations !== undefined) {
    note.observations_as_stated = observations.trim() || 'Not stated';
  }
  if (plan !== undefined) {
    note.plan_as_stated = plan.trim() || 'Not stated';
  }

  saveWardData(data);
  logAudit('edit_round_note', 'admin', { note_id: note.id });

  return {
    success: true,
    message: `Round note updated for ${note.patient_name}.`,
    data: note,
  };
}

// 8. add_pending_item, mark_item_received, get_pending_items
export function addPendingItem(
  patientQuery: string,
  type: PendingItemType,
  description: string
): ToolResult {
  requireRole(['doctor', 'nurse']);
  const data = loadWardData();
  const patient = findPatient(patientQuery);
  if (!patient) {
    return { success: false, message: `Patient '${patientQuery}' not found.` };
  }

  const itemId = `pend-${Date.now()}`;
  const newItem: PendingItem = {
    id: itemId,
    patient_id: patient.id,
    patient_name: patient.name,
    bed: patient.bed,
    type,
    description: description.trim(),
    status: 'pending',
    created_at: new Date().toISOString(),
  };

  data.pending_items.push(newItem);
  saveWardData(data);

  logAudit(
    'add_pending_item',
    'admin',
    { item_id: itemId, bed: patient.bed, type, description }
  );

  return {
    success: true,
    message: `Pending ${type} logged for ${patient.name} (${patient.bed}): "${description}".`,
    data: newItem,
  };
}

export function markItemReceived(itemIdOrQuery: string): ToolResult {
  const role = requireRole(['doctor', 'nurse']);
  const data = loadWardData();

  let item = data.pending_items.find(p => p.id === itemIdOrQuery);
  if (!item) {
    item = data.pending_items.find(
      p => p.status === 'pending' && (p.description.toLowerCase().includes(itemIdOrQuery.toLowerCase()) || p.bed.toLowerCase() === itemIdOrQuery.toLowerCase())
    );
  }

  if (!item) {
    return { success: false, message: `Pending item '${itemIdOrQuery}' not found.` };
  }

  item.status = 'received';
  item.received_at = new Date().toISOString();
  item.received_by_role = role;

  saveWardData(data);
  logAudit('mark_item_received', 'admin', { item_id: item.id, bed: item.bed, description: item.description });

  return {
    success: true,
    message: `Item received: ${item.type.toUpperCase()} for ${item.patient_name} (${item.bed}) marked as received.`,
    data: item,
  };
}

export function getPendingItems(): ToolResult {
  const data = loadWardData();
  const pending = data.pending_items.filter(p => p.status === 'pending');

  return {
    success: true,
    message: `There are ${pending.length} pending diagnostic items in the ward.`,
    data: pending,
  };
}

// 9. start_discharge, tick_discharge_item, get_discharge_status
export function startDischarge(patientQuery: string): ToolResult {
  requireRole(['doctor', 'nurse']);
  requireStepUp(60);

  const data = loadWardData();
  const patient = findPatient(patientQuery);
  if (!patient) {
    return { success: false, message: `Patient '${patientQuery}' not found.` };
  }

  patient.status = 'awaiting discharge';
  patient.discharge_checklist = {
    summary_written: false,
    bill_cleared: false,
    medicines_handed_over: false,
    follow_up_date_given: false,
    transport_arranged: false,
  };

  saveWardData(data);
  logAudit('start_discharge', 'admin', { patient_id: patient.id, bed: patient.bed });

  return {
    success: true,
    message: `Discharge checklist initiated for ${patient.name} (${patient.bed}). Status set to awaiting discharge.`,
    data: {
      patient,
      checklist: patient.discharge_checklist,
    },
  };
}

export function tickDischargeItem(
  patientQuery: string,
  itemKey: keyof DischargeChecklist,
  completed: boolean = true
): ToolResult {
  requireRole(['doctor', 'nurse']);
  const data = loadWardData();
  const patient = findPatient(patientQuery);
  if (!patient) {
    return { success: false, message: `Patient '${patientQuery}' not found.` };
  }

  if (!patient.discharge_checklist) {
    patient.discharge_checklist = {
      summary_written: false,
      bill_cleared: false,
      medicines_handed_over: false,
      follow_up_date_given: false,
      transport_arranged: false,
    };
  }

  if (!(itemKey in patient.discharge_checklist)) {
    return {
      success: false,
      message: `Invalid checklist item '${String(itemKey)}'. Valid items: summary_written, bill_cleared, medicines_handed_over, follow_up_date_given, transport_arranged.`,
    };
  }

  patient.discharge_checklist[itemKey] = completed;

  // Check if all are completed
  const allDone = Object.values(patient.discharge_checklist).every(Boolean);

  saveWardData(data);
  logAudit('tick_discharge_item', 'admin', { patient_id: patient.id, bed: patient.bed, item: itemKey, completed });

  return {
    success: true,
    message: `Discharge item '${itemKey}' for ${patient.name} (${patient.bed}) updated to ${completed ? 'completed' : 'incomplete'}.${allDone ? ' All discharge items are now completed!' : ''}`,
    data: patient.discharge_checklist,
  };
}

export function getDischargeStatus(): ToolResult {
  const data = loadWardData();
  const dischargingPatients = data.patients.filter(
    p => p.status === 'awaiting discharge' || p.discharge_checklist !== undefined
  );

  return {
    success: true,
    message: `${dischargingPatients.length} patients currently in discharge workflow.`,
    data: dischargingPatients.map(p => ({
      patient_id: p.id,
      name: p.name,
      bed: p.bed,
      status: p.status,
      checklist: p.discharge_checklist,
    })),
  };
}

// 10. draft_handover(from_shift, to_shift) & approve_handover(handover_id, confirm_read_back)
export function draftHandover(from_shift: string, to_shift: string): ToolResult {
  const role = requireRole(['doctor']);
  const data = loadWardData();
  const ctx = getContext();

  const handoverId = `ho-${Date.now()}`;
  const patientItems: HandoverPatientItem[] = data.patients.map(p => {
    // Approved round note only as stated
    const latestApproved = [...data.round_notes]
      .filter(n => n.patient_id === p.id && n.status === 'approved')
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())[0];

    const openTasks = data.tasks
      .filter(t => !t.completed && (t.patient_id === p.id || t.bed === p.bed))
      .map(t => t.description);

    const pending = data.pending_items
      .filter(item => item.status === 'pending' && (item.patient_id === p.id || item.bed === p.bed))
      .map(item => `${item.type.toUpperCase()}: ${item.description}`);

    let dischargeStatus = 'Not started';
    if (p.discharge_checklist) {
      const doneCount = Object.values(p.discharge_checklist).filter(Boolean).length;
      dischargeStatus = `${doneCount}/5 items complete${p.status === 'awaiting discharge' ? ' (Awaiting discharge)' : ''}`;
    }

    return {
      patient_id: p.id,
      bed: p.bed,
      name: p.name,
      approved_round_note_as_stated: latestApproved
        ? `Observations: ${latestApproved.observations_as_stated || 'Not stated'} | Plan: ${latestApproved.plan_as_stated || 'Not stated'}`
        : 'Not stated',
      open_tasks: openTasks.length > 0 ? openTasks : ['None'],
      pending_items: pending.length > 0 ? pending : ['None'],
      discharge_status: dischargeStatus,
    };
  });

  const newHandover: ShiftHandover = {
    id: handoverId,
    from_shift: from_shift || 'Current Shift',
    to_shift: to_shift || 'Next Shift',
    created_at: new Date().toISOString(),
    created_by: ctx?.staffName || 'Doctor',
    created_by_role: role,
    status: 'draft',
    patients: patientItems,
    read_back_confirmed: false,
  };

  data.handovers.unshift(newHandover);
  saveWardData(data);

  logAudit('draft_handover', 'admin', { handover_id: handoverId, from_shift, to_shift, patient_count: patientItems.length });
  addTimeSaved(10);

  return {
    success: true,
    message: `DRAFT handover generated for ${newHandover.from_shift} to ${newHandover.to_shift} with ${patientItems.length} patients. Status: DRAFT. Requires read-back confirmation and doctor approval.`,
    data: newHandover,
  };
}

export function approveHandover(handoverId: string, confirm_read_back: boolean): ToolResult {
  requireRole(['doctor']);
  requireStepUp(60);

  if (!confirm_read_back) {
    throw new Error('Read-back confirmation required: Outgoing clinician must confirm after hearing the draft read back.');
  }

  const data = loadWardData();
  const handover = data.handovers.find(h => h.id === handoverId);
  if (!handover) {
    return { success: false, message: `Handover '${handoverId}' not found.` };
  }

  const ctx = getContext();
  handover.status = 'approved';
  handover.read_back_confirmed = true;
  handover.approved_at = new Date().toISOString();
  handover.approved_by = ctx?.staffName || 'Doctor';

  saveWardData(data);
  logAudit('approve_handover', 'admin', { handover_id: handover.id, from_shift: handover.from_shift, to_shift: handover.to_shift });

  return {
    success: true,
    message: `Shift handover for ${handover.from_shift} to ${handover.to_shift} APPROVED after read-back confirmation.`,
    data: handover,
  };
}

// 11. get_handover(shift)
export function getHandover(shift?: string): ToolResult {
  const data = loadWardData();
  let approved = data.handovers.filter(h => h.status === 'approved');

  if (shift) {
    const shiftClean = shift.toLowerCase();
    approved = approved.filter(
      h => h.to_shift.toLowerCase().includes(shiftClean) || h.from_shift.toLowerCase().includes(shiftClean)
    );
  }

  const latest = approved[0];
  if (!latest) {
    return {
      success: false,
      message: 'No approved shift handover found.',
    };
  }

  return {
    success: true,
    message: `Latest approved handover (${latest.from_shift} -> ${latest.to_shift}) approved by ${latest.approved_by}.`,
    data: latest,
  };
}

// 12. get_overdue_tasks()
export function getOverdueTasks(): ToolResult {
  const data = loadWardData();
  const now = Date.now();
  const overdue = data.tasks.filter(t => !t.completed && new Date(t.due_time).getTime() < now);

  return {
    success: true,
    message: `Found ${overdue.length} overdue tasks in the ward.`,
    data: overdue,
  };
}

// 13. get_shift_summary()
export function getShiftSummary(): ToolResult {
  const data = loadWardData();
  const completedTasks = data.tasks.filter(t => t.completed).length;
  const openTasks = data.tasks.filter(t => !t.completed).length;
  const receivedItems = data.pending_items.filter(p => p.status === 'received').length;
  const pendingItems = data.pending_items.filter(p => p.status === 'pending').length;
  const dischargesDone = data.patients.filter(
    p => p.discharge_checklist && Object.values(p.discharge_checklist).every(Boolean)
  ).length;
  const draftsAwaitingApproval =
    data.round_notes.filter(n => n.status === 'draft').length +
    data.handovers.filter(h => h.status === 'draft').length;

  return {
    success: true,
    message: `Shift summary: ${completedTasks} tasks completed, ${openTasks} open, ${receivedItems} reports received, ${pendingItems} reports pending, ${dischargesDone} discharges completed, ${draftsAwaitingApproval} drafts awaiting approval. Estimated time saved: ${data.estimated_time_saved_minutes} minutes.`,
    data: {
      tasks_completed: completedTasks,
      tasks_open: openTasks,
      items_received: receivedItems,
      items_pending: pendingItems,
      discharges_completed: dischargesDone,
      drafts_awaiting_approval: draftsAwaitingApproval,
      estimated_time_saved_minutes: data.estimated_time_saved_minutes,
    },
  };
}

// 14. get_morning_brief()
export function getMorningBrief(): ToolResult {
  const data = loadWardData();
  const now = Date.now();
  const occupiedBeds = data.patients.length;
  const overdueTasks = data.tasks.filter(t => !t.completed && new Date(t.due_time).getTime() < now);
  const tasksDueThisShift = data.tasks.filter(t => !t.completed && new Date(t.due_time).getTime() >= now);
  const pendingReports = data.pending_items.filter(p => p.status === 'pending');
  const dischargesPlanned = data.patients.filter(p => p.status === 'awaiting discharge');
  const pendingDrafts =
    data.round_notes.filter(n => n.status === 'draft').length +
    data.handovers.filter(h => h.status === 'draft').length;

  const briefText = `Good morning team. We have ${occupiedBeds} occupied beds across our 20-bed ward. There are ${overdueTasks.length} overdue tasks requiring immediate attention, and ${tasksDueThisShift.length} tasks scheduled for this shift. ${pendingReports.length} diagnostic reports are pending from labs and imaging. ${dischargesPlanned.length} patients are in the discharge workflow, and ${pendingDrafts} administrative drafts are awaiting doctor review and approval. Estimated time saved by voice automation is ${data.estimated_time_saved_minutes} minutes.`;

  return {
    success: true,
    message: briefText,
    data: {
      occupied_beds: occupiedBeds,
      total_beds: data.total_beds,
      overdue_tasks_count: overdueTasks.length,
      tasks_due_count: tasksDueThisShift.length,
      pending_reports_count: pendingReports.length,
      discharges_planned_count: dischargesPlanned.length,
      pending_drafts_count: pendingDrafts,
      estimated_time_saved_minutes: data.estimated_time_saved_minutes,
      spoken_brief: briefText,
    },
  };
}

// 15. get_audit_log(limit, filter)
export function getAuditLog(limit: number = 50, filter?: 'admin' | 'security'): ToolResult {
  const data = loadWardData();
  let log = data.audit_log;
  if (filter) {
    log = log.filter(l => l.category === filter);
  }
  const result = log.slice(0, limit);

  return {
    success: true,
    message: `Retrieved ${result.length} audit entries.`,
    data: result,
  };
}
