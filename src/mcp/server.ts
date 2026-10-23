import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import {
  addPendingItem,
  addTask,
  admitPatient,
  approveHandover,
  approveRoundNote,
  completeTask,
  draftHandover,
  draftRoundNote,
  editRoundNote,
  getAuditLog,
  getDischargeStatus,
  getHandover,
  getMorningBrief,
  getNextRoundPatient,
  getOpenTasks,
  getOverdueTasks,
  getPatient,
  getPendingItems,
  getShiftSummary,
  getWardBoard,
  markItemReceived,
  startDischarge,
  startRounds,
  tickDischargeItem,
} from './tools.js';

export function createWardMcpServer(): McpServer {
  const server = new McpServer({
    name: 'WardOS-MCP-Server',
    version: '1.0.0',
  });

  const wrapHandler = (fn: () => any) => {
    try {
      const result = fn();
      return {
        content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }],
      };
    } catch (err: any) {
      return {
        isError: true,
        content: [{ type: 'text' as const, text: err?.message || 'Tool execution error' }],
      };
    }
  };

  // 1. admit_patient
  server.tool(
    'admit_patient',
    'Admit a new patient to a specified bed. (Doctor only, requires fresh PIN step-up confirmation within 60s)',
    {
      name: z.string().describe('Patient full name'),
      age: z.number().describe('Patient age in years'),
      bed: z.string().describe('Assigned bed (e.g. Bed 15)'),
      diagnosis_as_stated_by_user: z.string().describe('Administrative diagnosis exactly as stated by user'),
    },
    async args => wrapHandler(() => admitPatient(args.name, args.age, args.bed, args.diagnosis_as_stated_by_user))
  );

  // 2. get_patient
  server.tool(
    'get_patient',
    'Get patient profile, bed status, open tasks, pending items, and latest approved round note',
    {
      name_or_bed: z.string().describe('Patient name or bed number (e.g. "Bed 4" or "Ramesh")'),
    },
    async args => wrapHandler(() => getPatient(args.name_or_bed))
  );

  // 3. get_ward_board
  server.tool(
    'get_ward_board',
    'Get complete 20-bed ward board showing occupancy, administrative status, and open task counts',
    {},
    async () => wrapHandler(() => getWardBoard())
  );

  // 4. add_task
  server.tool(
    'add_task',
    'Create an administrative or nursing task for a patient bed',
    {
      patient: z.string().describe('Patient name or bed number'),
      description: z.string().describe('Task description'),
      assigned_role: z.enum(['doctor', 'nurse', 'all']).optional().describe('Role assigned to task (nurse, doctor, or all)'),
      due_time: z.string().optional().describe('Due time (ISO string or HH:mm format)'),
    },
    async args => wrapHandler(() => addTask(args.patient, args.description, args.assigned_role, args.due_time))
  );

  // 5. complete_task & get_open_tasks
  server.tool(
    'complete_task',
    'Mark a specific task as completed',
    {
      task_id: z.string().describe('Task ID or forgiving search query matching task description/bed'),
    },
    async args => wrapHandler(() => completeTask(args.task_id))
  );

  server.tool(
    'get_open_tasks',
    'List all open ward tasks, sorted with overdue items first',
    {
      role: z.enum(['doctor', 'nurse']).optional().describe('Optional role filter'),
    },
    async args => wrapHandler(() => getOpenTasks(args.role))
  );

  // 6. start_rounds & get_next_round_patient
  server.tool(
    'start_rounds',
    'Begin ward rounds starting from the first occupied bed with administrative summary',
    {},
    async () => wrapHandler(() => startRounds())
  );

  server.tool(
    'get_next_round_patient',
    'Advance or navigate through patients during ward rounds in bed order',
    {
      direction: z.enum(['next', 'prev']).optional().describe('Navigation direction (next or prev)'),
    },
    async args => wrapHandler(() => getNextRoundPatient(args.direction))
  );

  // 7. draft_round_note, approve_round_note, edit_round_note
  server.tool(
    'draft_round_note',
    'Draft a round note with observations and plan exactly as stated by clinician. Status will be DRAFT.',
    {
      patient: z.string().describe('Patient name or bed number'),
      observations_as_stated: z.string().describe('Clinical observations strictly as dictated by user'),
      plan_as_stated: z.string().describe('Care plan strictly as dictated by user'),
    },
    async args => wrapHandler(() => draftRoundNote(args.patient, args.observations_as_stated, args.plan_as_stated))
  );

  server.tool(
    'approve_round_note',
    'Approve a previously drafted round note. (Doctor only, requires fresh PIN step-up confirmation)',
    {
      note_id: z.string().describe('Round note ID to approve'),
    },
    async args => wrapHandler(() => approveRoundNote(args.note_id))
  );

  server.tool(
    'edit_round_note',
    'Edit the text of an existing round note draft. (Doctor only)',
    {
      note_id: z.string().describe('Round note ID'),
      observations: z.string().optional().describe('Updated observations as stated'),
      plan: z.string().optional().describe('Updated plan as stated'),
    },
    async args => wrapHandler(() => editRoundNote(args.note_id, args.observations, args.plan))
  );

  // 8. add_pending_item, mark_item_received, get_pending_items
  server.tool(
    'add_pending_item',
    'Log an outstanding lab test, radiology imaging, specialty consult, or document',
    {
      patient: z.string().describe('Patient name or bed number'),
      type: z.enum(['lab', 'imaging', 'consult', 'document']).describe('Category of pending item'),
      description: z.string().describe('Description of pending report or item'),
    },
    async args => wrapHandler(() => addPendingItem(args.patient, args.type, args.description))
  );

  server.tool(
    'mark_item_received',
    'Mark a pending lab or radiology report as received',
    {
      item_id: z.string().describe('Item ID or description/bed query'),
    },
    async args => wrapHandler(() => markItemReceived(args.item_id))
  );

  server.tool(
    'get_pending_items',
    'List all outstanding diagnostics, consults, and reports awaiting return',
    {},
    async () => wrapHandler(() => getPendingItems())
  );

  // 9. start_discharge, tick_discharge_item, get_discharge_status
  server.tool(
    'start_discharge',
    'Initiate administrative discharge checklist for a patient. (Requires fresh PIN step-up confirmation)',
    {
      patient: z.string().describe('Patient name or bed number'),
    },
    async args => wrapHandler(() => startDischarge(args.patient))
  );

  server.tool(
    'tick_discharge_item',
    'Update an item on the administrative discharge checklist',
    {
      patient: z.string().describe('Patient name or bed number'),
      item: z.enum([
        'summary_written',
        'bill_cleared',
        'medicines_handed_over',
        'follow_up_date_given',
        'transport_arranged',
      ]).describe('Checklist item key'),
      completed: z.boolean().optional().describe('True if completed, false if pending (default: true)'),
    },
    async args => wrapHandler(() => tickDischargeItem(args.patient, args.item, args.completed ?? true))
  );

  server.tool(
    'get_discharge_status',
    'Get discharge checklist progress for all patients currently in discharge workflow',
    {},
    async () => wrapHandler(() => getDischargeStatus())
  );

  // 10. draft_handover & approve_handover
  server.tool(
    'draft_handover',
    'Generate a structured DRAFT shift handover containing patient summaries, open tasks, and pending items. Missing fields show "Not stated". (Doctor only)',
    {
      from_shift: z.string().describe('Outgoing shift name (e.g. Morning, Evening, Night)'),
      to_shift: z.string().describe('Incoming shift name (e.g. Evening, Night, Morning)'),
    },
    async args => wrapHandler(() => draftHandover(args.from_shift, args.to_shift))
  );

  server.tool(
    'approve_handover',
    'Approve a shift handover draft. REQUIRES confirm_read_back=true and fresh PIN step-up confirmation. (Doctor only)',
    {
      handover_id: z.string().describe('Handover ID to approve'),
      confirm_read_back: z.boolean().describe('Clinician must explicitly confirm having read back or heard the draft read aloud'),
    },
    async args => wrapHandler(() => approveHandover(args.handover_id, args.confirm_read_back))
  );

  // 11. get_handover
  server.tool(
    'get_handover',
    'Retrieve the latest approved shift handover for an incoming or current shift',
    {
      shift: z.string().optional().describe('Optional shift name filter'),
    },
    async args => wrapHandler(() => getHandover(args.shift))
  );

  // 12. get_overdue_tasks
  server.tool(
    'get_overdue_tasks',
    'Retrieve all tasks currently overdue in the ward',
    {},
    async () => wrapHandler(() => getOverdueTasks())
  );

  // 13. get_shift_summary
  server.tool(
    'get_shift_summary',
    'Get summary of tasks completed, items received, discharges done, and drafts awaiting approval',
    {},
    async () => wrapHandler(() => getShiftSummary())
  );

  // 14. get_morning_brief
  server.tool(
    'get_morning_brief',
    'Generate spoken-friendly morning or shift brief covering census, overdue tasks, pending reports, and drafts',
    {},
    async () => wrapHandler(() => getMorningBrief())
  );

  // 15. get_audit_log
  server.tool(
    'get_audit_log',
    'Retrieve recent audit log entries for clinical administration and security events',
    {
      limit: z.number().optional().describe('Maximum entries to return (default: 50)'),
      filter: z.enum(['admin', 'security']).optional().describe('Category filter (admin or security)'),
    },
    async args => wrapHandler(() => getAuditLog(args.limit, args.filter))
  );

  return server;
}
