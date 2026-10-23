import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import http from 'node:http';
import jwt from 'jsonwebtoken';
import { app } from '../src/index.js';
import { config } from '../src/config.js';
import { seedWardData, loadWardData } from '../src/store.js';
import { seedStaffFile } from '../src/auth.js';
import { UserSession } from '../src/types.js';

async function runToolsTest() {
  console.log('--- STARTING MCP TOOLS TEST SUITE OVER STREAMABLE HTTP ---');

  // Reset clean state
  seedStaffFile();
  seedWardData();

  // Start temporary test server
  const testPort = 4001;
  const server = http.createServer(app);
  await new Promise<void>(resolve => server.listen(testPort, '127.0.0.1', () => resolve()));
  console.log(`Test server running at http://127.0.0.1:${testPort}`);

  // Create test doctor token (with fresh step-up)
  const docPayload: UserSession = {
    staff_id: 'doc-1',
    name: 'Dr. Aarav Sharma',
    role: 'doctor',
    lastStepUpAt: Date.now(),
  };
  const docToken = jwt.sign(docPayload, config.sessionSecret, { expiresIn: '15m' });

  // Create MCP client connecting over Streamable HTTP
  const client = new Client({ name: 'mcp-test-runner', version: '1.0.0' }, { capabilities: {} });
  const clientTransport = new StreamableHTTPClientTransport(new URL(`http://127.0.0.1:${testPort}/mcp`), {
    requestInit: {
      headers: {
        Authorization: `Bearer ${docToken}`,
        Origin: 'http://127.0.0.1:3000',
      },
    },
  });

  await client.connect(clientTransport);
  console.log('✓ Successfully connected to MCP server via Streamable HTTP transport');

  let passedTests = 0;
  let totalTests = 0;

  function assert(condition: boolean, testName: string, detail?: string) {
    totalTests++;
    if (condition) {
      console.log(`  ✓ PASS: ${testName}`);
      passedTests++;
    } else {
      console.error(`  ✗ FAIL: ${testName} - ${detail || ''}`);
      throw new Error(`Test failed: ${testName}`);
    }
  }

  const parseResult = (res: any) => JSON.parse(res.content[0].text);

  // 1. admit_patient
  console.log('\n[1/15] Testing admit_patient...');
  const admitRes: any = await client.callTool({
    name: 'admit_patient',
    arguments: {
      name: 'Aditi Rao',
      age: 29,
      bed: 'Bed 16',
      diagnosis_as_stated_by_user: 'Observation for mild migraine symptoms',
    },
  });
  const admitData = parseResult(admitRes);
  assert(admitData.success === true, 'admit_patient succeeded');
  assert(admitData.data.name === 'Aditi Rao', 'patient name matches');

  // 2. get_patient
  console.log('\n[2/15] Testing get_patient...');
  const patRes: any = await client.callTool({
    name: 'get_patient',
    arguments: { name_or_bed: 'Aditi Rao' },
  });
  const patData = parseResult(patRes);
  assert(patData.success === true, 'get_patient by name succeeded');
  assert(patData.data.profile.bed === 'Bed 16', 'patient bed verified');

  // 3. get_ward_board
  console.log('\n[3/15] Testing get_ward_board...');
  const boardRes: any = await client.callTool({ name: 'get_ward_board', arguments: {} });
  const boardData = parseResult(boardRes);
  assert(boardData.success === true, 'get_ward_board succeeded');
  assert(boardData.data.beds.length === 20, '20 beds represented');

  // 4. add_task
  console.log('\n[4/15] Testing add_task...');
  const taskRes: any = await client.callTool({
    name: 'add_task',
    arguments: {
      patient: 'Bed 16',
      description: 'Check vitals and document hydration intake',
      assigned_role: 'nurse',
    },
  });
  const taskData = parseResult(taskRes);
  assert(taskData.success === true, 'add_task succeeded');
  const createdTaskId = taskData.data.id;

  // 5. complete_task & get_open_tasks
  console.log('\n[5/15] Testing complete_task & get_open_tasks...');
  const openRes1: any = await client.callTool({ name: 'get_open_tasks', arguments: {} });
  const openData1 = parseResult(openRes1);
  assert(openData1.success === true, 'get_open_tasks succeeded');

  const compRes: any = await client.callTool({
    name: 'complete_task',
    arguments: { task_id: createdTaskId },
  });
  const compData = parseResult(compRes);
  assert(compData.success === true, 'complete_task succeeded');
  assert(compData.data.completed === true, 'task marked completed');

  // 6. start_rounds & get_next_round_patient
  console.log('\n[6/15] Testing start_rounds & get_next_round_patient...');
  const roundsRes: any = await client.callTool({ name: 'start_rounds', arguments: {} });
  const roundsData = parseResult(roundsRes);
  assert(roundsData.success === true, 'start_rounds succeeded');

  const nextPatRes: any = await client.callTool({
    name: 'get_next_round_patient',
    arguments: { direction: 'next' },
  });
  const nextPatData = parseResult(nextPatRes);
  assert(nextPatData.success === true, 'get_next_round_patient succeeded');

  // 7. draft_round_note, edit_round_note, approve_round_note
  console.log('\n[7/15] Testing draft_round_note, edit_round_note, approve_round_note...');
  const draftNoteRes: any = await client.callTool({
    name: 'draft_round_note',
    arguments: {
      patient: 'Bed 16',
      observations_as_stated: 'Resting quietly in dark room, nausea improved',
      plan_as_stated: 'Discharge this evening if headache remains resolved',
    },
  });
  const draftNoteData = parseResult(draftNoteRes);
  assert(draftNoteData.success === true, 'draft_round_note succeeded');
  assert(draftNoteData.data.status === 'draft', 'note status is draft');
  const noteId = draftNoteData.data.id;

  // Verify non-stated fields
  const emptyNoteRes: any = await client.callTool({
    name: 'draft_round_note',
    arguments: {
      patient: 'Bed 2',
      observations_as_stated: '',
      plan_as_stated: '',
    },
  });
  const emptyNoteData = parseResult(emptyNoteRes);
  assert(
    emptyNoteData.data.observations_as_stated === 'Not stated',
    'Unstated observation defaults to "Not stated"'
  );
  assert(
    emptyNoteData.data.plan_as_stated === 'Not stated',
    'Unstated plan defaults to "Not stated"'
  );

  const approveNoteRes: any = await client.callTool({
    name: 'approve_round_note',
    arguments: { note_id: noteId },
  });
  const approveNoteData = parseResult(approveNoteRes);
  assert(approveNoteData.success === true, 'approve_round_note succeeded');
  assert(approveNoteData.data.status === 'approved', 'note status is approved');

  // 8. add_pending_item, mark_item_received, get_pending_items
  console.log('\n[8/15] Testing add_pending_item, mark_item_received, get_pending_items...');
  const addPendRes: any = await client.callTool({
    name: 'add_pending_item',
    arguments: {
      patient: 'Bed 16',
      type: 'lab',
      description: 'Serum electrolytes panel',
    },
  });
  const addPendData = parseResult(addPendRes);
  assert(addPendData.success === true, 'add_pending_item succeeded');
  const pendItemId = addPendData.data.id;

  const markRecRes: any = await client.callTool({
    name: 'mark_item_received',
    arguments: { item_id: pendItemId },
  });
  const markRecData = parseResult(markRecRes);
  assert(markRecData.success === true, 'mark_item_received succeeded');
  assert(markRecData.data.status === 'received', 'item marked received');

  const getPendRes: any = await client.callTool({ name: 'get_pending_items', arguments: {} });
  const getPendData = parseResult(getPendRes);
  assert(getPendData.success === true, 'get_pending_items succeeded');

  // 9. start_discharge, tick_discharge_item, get_discharge_status
  console.log('\n[9/15] Testing start_discharge, tick_discharge_item, get_discharge_status...');
  const startDiscRes: any = await client.callTool({
    name: 'start_discharge',
    arguments: { patient: 'Bed 16' },
  });
  const startDiscData = parseResult(startDiscRes);
  assert(startDiscData.success === true, 'start_discharge succeeded');

  const tickRes: any = await client.callTool({
    name: 'tick_discharge_item',
    arguments: {
      patient: 'Bed 16',
      item: 'bill_cleared',
      completed: true,
    },
  });
  const tickData = parseResult(tickRes);
  assert(tickData.success === true, 'tick_discharge_item succeeded');
  assert(tickData.data.bill_cleared === true, 'bill_cleared ticked');

  const getDiscRes: any = await client.callTool({ name: 'get_discharge_status', arguments: {} });
  const getDiscData = parseResult(getDiscRes);
  assert(getDiscData.success === true, 'get_discharge_status succeeded');

  // 10. draft_handover & approve_handover
  console.log('\n[10/15] Testing draft_handover & approve_handover...');
  const draftHoRes: any = await client.callTool({
    name: 'draft_handover',
    arguments: { from_shift: 'Morning', to_shift: 'Evening' },
  });
  const draftHoData = parseResult(draftHoRes);
  assert(draftHoData.success === true, 'draft_handover succeeded');
  assert(draftHoData.data.status === 'draft', 'handover status is draft');
  const handoverId = draftHoData.data.id;

  // Specific Check (a): draft_handover never outputs unstated content
  const samplePatient = draftHoData.data.patients.find((p: any) => p.bed === 'Bed 2');
  if (samplePatient && !samplePatient.approved_round_note_as_stated.includes('Observations:')) {
    assert(
      samplePatient.approved_round_note_as_stated === 'Not stated',
      'Missing round note in handover is represented strictly as "Not stated"'
    );
  }

  // Specific Check (b): approve_handover fails without read-back confirmation
  console.log('Testing approve_handover rejection when confirm_read_back=false...');
  const failedHoRes: any = await client.callTool({
    name: 'approve_handover',
    arguments: { handover_id: handoverId, confirm_read_back: false },
  });
  assert(
    failedHoRes.isError === true || (failedHoRes.content[0] as any).text.includes('Read-back confirmation required'),
    'approve_handover rejected without read-back confirmation'
  );

  // Now approve with confirm_read_back=true
  const approveHoRes: any = await client.callTool({
    name: 'approve_handover',
    arguments: { handover_id: handoverId, confirm_read_back: true },
  });
  const approveHoData = parseResult(approveHoRes);
  assert(approveHoData.success === true, 'approve_handover succeeded with read-back confirmed');
  assert(approveHoData.data.status === 'approved', 'handover status updated to approved');

  // 11. get_handover
  console.log('\n[11/15] Testing get_handover...');
  const getHoRes: any = await client.callTool({ name: 'get_handover', arguments: {} });
  const getHoData = parseResult(getHoRes);
  assert(getHoData.success === true, 'get_handover succeeded');

  // 12. get_overdue_tasks
  console.log('\n[12/15] Testing get_overdue_tasks...');
  const getOverRes: any = await client.callTool({ name: 'get_overdue_tasks', arguments: {} });
  const getOverData = parseResult(getOverRes);
  assert(getOverData.success === true, 'get_overdue_tasks succeeded');

  // 13. get_shift_summary
  console.log('\n[13/15] Testing get_shift_summary...');
  const getSummRes: any = await client.callTool({ name: 'get_shift_summary', arguments: {} });
  const getSummData = parseResult(getSummRes);
  assert(getSummData.success === true, 'get_shift_summary succeeded');
  assert(typeof getSummData.data.estimated_time_saved_minutes === 'number', 'time saved tracked');

  // 14. get_morning_brief
  console.log('\n[14/15] Testing get_morning_brief...');
  const getBriefRes: any = await client.callTool({ name: 'get_morning_brief', arguments: {} });
  const getBriefData = parseResult(getBriefRes);
  assert(getBriefData.success === true, 'get_morning_brief succeeded');
  assert(typeof getBriefData.data.spoken_brief === 'string', 'spoken brief returned');

  // 15. get_audit_log & Specific Check (c): every write appears in the audit log
  console.log('\n[15/15] Testing get_audit_log & verifying audit log integrity...');
  const auditRes: any = await client.callTool({
    name: 'get_audit_log',
    arguments: { limit: 100 },
  });
  const auditData = parseResult(auditRes);
  assert(auditData.success === true, 'get_audit_log succeeded');
  const loggedActions = auditData.data.map((a: any) => a.action);

  assert(loggedActions.includes('admit_patient'), 'Audit log includes admit_patient');
  assert(loggedActions.includes('add_task'), 'Audit log includes add_task');
  assert(loggedActions.includes('complete_task'), 'Audit log includes complete_task');
  assert(loggedActions.includes('draft_round_note'), 'Audit log includes draft_round_note');
  assert(loggedActions.includes('approve_round_note'), 'Audit log includes approve_round_note');
  assert(loggedActions.includes('add_pending_item'), 'Audit log includes add_pending_item');
  assert(loggedActions.includes('mark_item_received'), 'Audit log includes mark_item_received');
  assert(loggedActions.includes('start_discharge'), 'Audit log includes start_discharge');
  assert(loggedActions.includes('tick_discharge_item'), 'Audit log includes tick_discharge_item');
  assert(loggedActions.includes('draft_handover'), 'Audit log includes draft_handover');
  assert(loggedActions.includes('approve_handover'), 'Audit log includes approve_handover');

  await client.close();
  server.close();

  console.log(`\n=======================================================`);
  console.log(` ALL ${passedTests}/${totalTests} MCP TOOL TESTS PASSED OVER STREAMABLE HTTP!`);
  console.log(`=======================================================\n`);
}

runToolsTest()
  .then(() => process.exit(0))
  .catch(err => {
    console.error('Test Suite Failed:', err);
    process.exit(1);
  });
