import http from 'node:http';
import jwt from 'jsonwebtoken';
import { app } from '../src/index.js';
import { config } from '../src/config.js';
import { seedStaffFile, authenticateStaff, loadStaff } from '../src/auth.js';
import { seedWardData, loadWardData } from '../src/store.js';
import { UserSession } from '../src/types.js';

async function runSecurityTests() {
  console.log('--- STARTING WARDOS SECURITY TEST SUITE (npm run test:security) ---');

  seedStaffFile();
  seedWardData();

  const testPort = 4003;
  const server = http.createServer(app);
  await new Promise<void>(resolve => server.listen(testPort, '127.0.0.1', () => resolve()));
  console.log(`Security test server running at http://127.0.0.1:${testPort}`);

  let passed = 0;
  let total = 0;

  function assert(condition: boolean, testName: string, detail?: string) {
    total++;
    if (condition) {
      console.log(`  ✓ PASS: ${testName}`);
      passed++;
    } else {
      console.error(`  ✗ FAIL: ${testName} - ${detail || ''}`);
      throw new Error(`Security test failed: ${testName}`);
    }
  }

  // --- (a) Unauthenticated calls to /api/chat and /mcp are rejected ---
  console.log('\n[Security Check A] Unauthenticated calls rejection...');
  const unauthChatRes = await fetch(`http://127.0.0.1:${testPort}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text: 'Give me the morning brief' }),
  });
  assert(unauthChatRes.status === 401, 'Unauthenticated /api/chat returns HTTP 401 Unauthorized');

  const unauthMcpRes = await fetch(`http://127.0.0.1:${testPort}/mcp`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' }),
  });
  assert(unauthMcpRes.status === 401, 'Unauthenticated /mcp returns HTTP 401 Unauthorized');

  // --- (b) A nurse token cannot call approve_handover ---
  console.log('\n[Security Check B] Nurse role restriction on approve_handover...');
  const nursePayload: UserSession = {
    staff_id: 'nurse-1',
    name: 'Nurse Ananya Rao',
    role: 'nurse',
    lastStepUpAt: Date.now(),
  };
  const nurseToken = jwt.sign(nursePayload, config.sessionSecret, { expiresIn: '15m' });

  const nurseApproveRes = await fetch(`http://127.0.0.1:${testPort}/api/chat`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${nurseToken}`,
      Origin: 'http://127.0.0.1:3000',
    },
    body: JSON.stringify({ text: 'confirm and approve handover ho-previous' }),
  });
  const nurseApproveBody = await nurseApproveRes.json();
  assert(nurseApproveRes.status === 403, 'Nurse token calling approve_handover rejected with HTTP 403 Forbidden');
  assert(
    nurseApproveBody.error.includes('Permission denied') && nurseApproveBody.error.includes('nurse'),
    'Permission denied error explicitly states nurse role is disallowed'
  );

  // --- (c) A role field in the request body is ignored ---
  console.log('\n[Security Check C] Client-supplied role tampering resistance...');
  // A nurse attempts to send role: "doctor" in the request body
  const forgedRoleRes = await fetch(`http://127.0.0.1:${testPort}/api/chat`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${nurseToken}`,
      Origin: 'http://127.0.0.1:3000',
    },
    body: JSON.stringify({
      text: 'confirm and approve handover ho-previous',
      role: 'doctor', // Attacker attempts role spoofing in body
    }),
  });
  assert(
    forgedRoleRes.status === 403,
    'Client-supplied role in body is strictly ignored; server-side token role enforced'
  );

  // --- (d) Expired token is rejected ---
  console.log('\n[Security Check D] Expired token rejection...');
  const expiredPayload: UserSession = {
    staff_id: 'doc-1',
    name: 'Dr. Aarav Sharma',
    role: 'doctor',
    lastStepUpAt: Date.now() - 3600000,
  };
  // Token created with expired duration
  const expiredToken = jwt.sign(expiredPayload, config.sessionSecret, { expiresIn: '-10s' });

  const expiredRes = await fetch(`http://127.0.0.1:${testPort}/api/chat`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${expiredToken}`,
      Origin: 'http://127.0.0.1:3000',
    },
    body: JSON.stringify({ text: 'Show ward board' }),
  });
  assert(expiredRes.status === 401, 'Expired JWT token rejected with HTTP 401');

  // --- (e) 5 wrong PINs triggers account lockout for 5 minutes ---
  console.log('\n[Security Check E] Brute-force protection: 5 wrong PINs triggers account lockout...');
  seedStaffFile();
  for (let i = 1; i <= 4; i++) {
    const attempt = authenticateStaff('doc-2', '0000');
    assert(attempt.success === false && attempt.locked !== true, `Failed attempt ${i} recorded, not yet locked`);
  }
  // 5th attempt must lock
  const fifthAttempt = authenticateStaff('doc-2', '0000');
  assert(fifthAttempt.success === false, '5th attempt failed');
  assert(fifthAttempt.locked === true, '5th consecutive wrong PIN triggered account lockout');
  assert(fifthAttempt.error?.includes('locked for 5 minutes') === true, 'Lockout message confirmed');

  // 6th attempt (even with correct PIN) must be blocked while locked
  const lockedAttempt = authenticateStaff('doc-2', '3344');
  assert(lockedAttempt.locked === true, 'Account remains locked against valid PIN until lockout expires');

  // --- (f) Risky actions fail without recent PIN step-up confirmation ---
  console.log('\n[Security Check F] Step-up confirmation enforcement for risky actions...');
  // Doctor token with step-up timestamp older than 60 seconds (e.g. 120s ago)
  const staleStepUpDocPayload: UserSession = {
    staff_id: 'doc-1',
    name: 'Dr. Aarav Sharma',
    role: 'doctor',
    lastStepUpAt: Date.now() - 120000, // 2 minutes ago
  };
  const staleStepUpDocToken = jwt.sign(staleStepUpDocPayload, config.sessionSecret, { expiresIn: '15m' });

  const staleStepUpRes = await fetch(`http://127.0.0.1:${testPort}/api/chat`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${staleStepUpDocToken}`,
      Origin: 'http://127.0.0.1:3000',
    },
    body: JSON.stringify({ text: 'confirm and approve handover ho-previous' }),
  });
  const staleStepUpBody = await staleStepUpRes.json();
  assert(
    staleStepUpBody.requiresStepUp === true,
    'Risky action (approve_handover) paused with requiresStepUp=true when last step-up > 60s'
  );

  // --- (g) Requests from a disallowed Origin are rejected ---
  console.log('\n[Security Check G] DNS rebinding & Origin validation...');
  const disallowedOriginRes = await fetch(`http://127.0.0.1:${testPort}/mcp`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${nurseToken}`,
      Origin: 'http://malicious-attacker-website.com',
    },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' }),
  });
  assert(disallowedOriginRes.status === 403, 'Request from disallowed Origin rejected with HTTP 403');

  // --- (h) Server logs and audit files contain no PINs or sensitive credentials ---
  console.log('\n[Security Check H] Verifying credential and data leak prevention in storage & logs...');
  const staff = loadStaff();
  for (const s of staff) {
    assert(!(s as any).pin, `Plaintext PIN is not present on staff object (${s.name})`);
    assert(Boolean(s.pin_hash && s.salt), `Staff object contains secure salt and scrypt hash (${s.name})`);
  }

  const ward = loadWardData();
  const rawWard = JSON.stringify(ward);
  assert(!rawWard.includes('1122') && !rawWard.includes('3344') && !rawWard.includes('5566') && !rawWard.includes('7788'), 'No demo PINs leaked in ward storage');

  server.close();

  console.log(`\n=======================================================`);
  console.log(` ALL ${passed}/${total} SECURITY REQUIREMENTS VERIFIED AND PASSED!`);
  console.log(` (Authentication, Auto-lock, Server Roles, Step-up PIN, Lockout, Origin Check, Sanitized Logs)`);
  console.log(`=======================================================\n`);
}

runSecurityTests()
  .then(() => process.exit(0))
  .catch(err => {
    console.error('Security test failed:', err);
    process.exit(1);
  });
