import express from 'express';
import rateLimit from 'express-rate-limit';
import { verifySessionToken } from '../auth.js';
import { RequestContext, runWithContext } from '../context.js';
import * as tools from '../mcp/tools.js';
import { parseWithBedrock } from '../nlu/bedrock.js';
import { checkMedicalAdviceGuardrail } from '../nlu/guardrails.js';
import { parseIntentModeB } from '../nlu/intent.js';
import { logAudit } from '../store.js';
import { isSessionLocked } from './auth.js';

const router = express.Router();

const chatLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 60, // 60 requests per minute
  message: { error: 'Rate limit exceeded for chat' },
  standardHeaders: true,
  legacyHeaders: false,
});

router.post('/', chatLimiter, async (req, res) => {
  // 1. Authenticate via cookie or Bearer header
  const token = req.cookies?.wardos_token || req.headers.authorization?.replace(/^Bearer\s+/i, '');
  if (!token) {
    res.status(401).json({ error: 'Authentication required to access WardOS voice assistant' });
    return;
  }

  const session = verifySessionToken(token);
  if (!session) {
    res.status(401).json({ error: 'Session expired. Please log in again.' });
    return;
  }

  // 2. Check if locked
  if (isSessionLocked(session.staff_id)) {
    res.status(423).json({ error: 'WardOS is locked. Enter your PIN to unlock before speaking.' });
    return;
  }

  const { text, language = 'en' } = req.body;
  if (!text || typeof text !== 'string') {
    res.status(400).json({ error: 'A valid text command is required' });
    return;
  }

  // 3. STRICT ADMINISTRATIVE GUARDRAIL: Check for medical advice / diagnosis / dosing
  const guardrailCheck = checkMedicalAdviceGuardrail(text, language);
  if (guardrailCheck.isRefusal) {
    logAudit(
      'medical_advice_refusal',
      'security',
      { prompt_text: text, reason: guardrailCheck.reason },
      session.role,
      text
    );
    res.json({
      reply: guardrailCheck.refusalReply,
      toolCalls: [],
      data: null,
      isRefusal: true,
      reason: guardrailCheck.reason,
    });
    return;
  }

  // 4. Intent parsing: Try Bedrock (Mode A), fall back to Regex/Rules (Mode B)
  let parseResult = await parseWithBedrock(text, language);
  let usedMode = 'Bedrock (Mode A)';

  if (!parseResult || !parseResult.matched) {
    parseResult = parseIntentModeB(text, language);
    usedMode = 'Rule-based NLU (Mode B)';
  }

  if (!parseResult.matched || parseResult.toolCalls.length === 0) {
    res.json({
      reply: parseResult.spokenReply,
      toolCalls: [],
      data: null,
      mode: usedMode,
    });
    return;
  }

  // 5. Execute matched tools inside RequestContext with the authenticated user session
  const context: RequestContext = {
    staffId: session.staff_id,
    staffName: session.name,
    role: session.role, // STRICT: Role comes from session token ONLY
    lastStepUpAt: session.lastStepUpAt,
    originalText: text,
  };

  const executedTools: Array<{ toolName: string; args: any; result: any }> = [];
  let toolData: any = null;
  let customReply: string = parseResult.spokenReply;
  let requiresStepUp = false;

  try {
    await runWithContext(context, async () => {
      for (const call of parseResult!.toolCalls) {
        let result: tools.ToolResult;

        switch (call.toolName) {
          case 'get_morning_brief':
            result = tools.getMorningBrief();
            customReply = result.message;
            break;
          case 'get_ward_board':
            result = tools.getWardBoard();
            break;
          case 'get_patient':
            result = tools.getPatient(call.args.name_or_bed);
            break;
          case 'add_task':
            result = tools.addTask(call.args.patient, call.args.description, call.args.assigned_role, call.args.due_time);
            break;
          case 'complete_task':
            result = tools.completeTask(call.args.task_id);
            break;
          case 'get_open_tasks':
            result = tools.getOpenTasks(call.args.role);
            break;
          case 'get_overdue_tasks':
            result = tools.getOverdueTasks();
            break;
          case 'start_rounds':
            result = tools.startRounds();
            break;
          case 'get_next_round_patient':
            result = tools.getNextRoundPatient(call.args.direction);
            break;
          case 'draft_round_note':
            result = tools.draftRoundNote(call.args.patient, call.args.observations_as_stated, call.args.plan_as_stated);
            break;
          case 'approve_round_note':
            result = tools.approveRoundNote(call.args.note_id);
            break;
          case 'edit_round_note':
            result = tools.editRoundNote(call.args.note_id, call.args.observations, call.args.plan);
            break;
          case 'add_pending_item':
            result = tools.addPendingItem(call.args.patient, call.args.type, call.args.description);
            break;
          case 'mark_item_received':
            result = tools.markItemReceived(call.args.item_id);
            break;
          case 'get_pending_items':
            result = tools.getPendingItems();
            break;
          case 'start_discharge':
            result = tools.startDischarge(call.args.patient);
            break;
          case 'tick_discharge_item':
            result = tools.tickDischargeItem(call.args.patient, call.args.item, call.args.completed);
            break;
          case 'get_discharge_status':
            result = tools.getDischargeStatus();
            break;
          case 'draft_handover':
            result = tools.draftHandover(call.args.from_shift, call.args.to_shift);
            break;
          case 'approve_handover':
            result = tools.approveHandover(call.args.handover_id, call.args.confirm_read_back);
            break;
          case 'get_handover':
            result = tools.getHandover(call.args.shift);
            break;
          case 'get_shift_summary':
            result = tools.getShiftSummary();
            break;
          case 'get_audit_log':
            result = tools.getAuditLog(call.args.limit, call.args.filter);
            break;
          case 'admit_patient':
            result = tools.admitPatient(call.args.name, call.args.age, call.args.bed, call.args.diagnosis_as_stated_by_user);
            break;
          default:
            throw new Error(`Unknown tool: ${call.toolName}`);
        }

        executedTools.push({ toolName: call.toolName, args: call.args, result });
        toolData = result.data;
      }
    });

    res.json({
      reply: customReply,
      toolCalls: executedTools,
      data: toolData,
      mode: usedMode,
    });
  } catch (err: any) {
    const errorMsg: string = err?.message || 'Tool execution error';

    // Check for Step-Up confirmation error
    if (errorMsg.includes('Step-up confirmation required')) {
      requiresStepUp = true;
      res.json({
        reply: 'This action requires on-screen PIN confirmation.',
        toolCalls: parseResult.toolCalls,
        requiresStepUp: true,
        action: parseResult.toolCalls[0]?.toolName,
        args: parseResult.toolCalls[0]?.args,
        error: errorMsg,
      });
      return;
    }

    // Check for Permission Denied error
    if (errorMsg.includes('Permission denied')) {
      logAudit(
        'permission_denied',
        'security',
        { error: errorMsg, tool: parseResult.toolCalls[0]?.toolName },
        session.role
      );
      res.status(403).json({
        reply: `Permission denied: ${errorMsg}`,
        error: errorMsg,
        toolCalls: parseResult.toolCalls,
      });
      return;
    }

    res.status(400).json({
      reply: `Action failed: ${errorMsg}`,
      error: errorMsg,
      toolCalls: parseResult.toolCalls,
    });
  }
});

export default router;
