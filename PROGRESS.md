# WardOS - Project Progress Tracker

Voice-first administrative assistant for hospital ward teams in India.
Built for the Amazon Developer Hackathon (Alexa+ track).

## Current Phase: Complete (All Phases Verified)

### Status Checklist

#### Phase 1: MCP Server & Data Model
- [x] Initialize project configuration & dependencies
- [x] Create synthetic data: `data/ward.json` (20-bed fictional ward with 14 patients, tasks, pending items, handover)
- [x] Create staff directory: `data/staff.json` (4 fictional staff with scrypt hashed PINs)
- [x] Implement data store layer with audit logging & estimated time saved tracker
- [x] Implement MCP tools (15 tools):
  - `admit_patient`
  - `get_patient`
  - `get_ward_board`
  - `add_task`
  - `complete_task`
  - `get_open_tasks`
  - `start_rounds`
  - `get_next_round_patient`
  - `draft_round_note`
  - `approve_round_note`
  - `edit_round_note`
  - `add_pending_item`
  - `mark_item_received`
  - `get_pending_items`
  - `start_discharge`
  - `tick_discharge_item`
  - `get_discharge_status`
  - `draft_handover`
  - `approve_handover`
  - `get_handover`
  - `get_overdue_tasks`
  - `get_shift_summary`
  - `get_morning_brief`
  - `get_audit_log`
- [x] Implement MCP Streamable HTTP transport endpoint (/mcp) with Bearer token authentication & Origin check
- [x] Checkpoint: `npm run test:tools` (50/50 test assertions passed over Streamable HTTP)

#### Phase 2: Language Understanding & Safety Guardrails
- [x] Build `/api/chat` supporting English, Hindi/Hinglish, and Telugu
- [x] Implement strict medical advice refusal guardrail (Administrative Only)
- [x] Implement Mode A: Amazon Bedrock (Claude) integration with strict administrative prompt
- [x] Implement Mode B: Rule-based regex/intent parser fallback for all tools
- [x] Checkpoint: `npm run test:chat` (30/30 language tests passed including 5 medical-advice refusals)

#### Security Foundation & Hardening
- [x] Staff authentication with on-screen keypad & scrypt hashed PINs
- [x] JWT session tokens (15-min expiry, httpOnly, sameSite strict)
- [x] 2-minute auto-lock with 15-second countdown warning and "Lock now" button
- [x] Server-side role enforcement (Doctors vs Nurses)
- [x] Step-up PIN confirmation (within 60s) for high-risk actions
- [x] Account lockout (5 wrong PINs = 5 min lockout) and rate limiting
- [x] Helmet, strict CSP, input sanitization, sensitive data masking in logs
- [x] Checkpoint: `npm run test:security` (25/25 security requirements verified)

#### Phase 3: Web App & Simulated Alexa+ UI
- [x] Calm, clean Echo Show inspired dark UI with teal/cyan accent
- [x] Top bar with role indicator, language switcher, simulated Alexa+ badge, fictional data warning
- [x] Animated voice ring (listening pulse, speaking ripple), mic button (Web Speech API en-IN/hi-IN/te-IN), speech synthesis output
- [x] Ward board (20-bed grid, administrative status chips, open tasks count)
- [x] Task board (3 columns: Overdue, Due this shift, Done)
- [x] Rounds view with Next/Previous voice controls
- [x] Shift handover draft with read-back requirement and confirm/approve flow
- [x] Pending items & discharge checklist cards
- [x] Metrics strip with "Estimated Time Saved This Shift"
- [x] Security audit log drawer with role/event filtering
- [x] Automated 3-minute scripted "Run Demo" sequence with captions

#### Phase 4: Amazon / AWS Layer
- [x] Bedrock client configured via `@aws-sdk/client-bedrock-runtime`
- [x] `/api/health` endpoint reporting Bedrock status and MCP spec version 2025-11-25

#### Phase 5: Documentation & Repo Cleanliness
- [x] README.md with architecture, safety model, threat model, demo credentials
- [x] LICENSE (MIT)
- [x] FEEDBACK.md and FRICTION_LOG.md
- [x] DEMO_SCRIPT.md (3-minute video guide)
- [x] .env.example and .gitignore

#### Phase 6: Final Verification
- [x] Clean install check (`rm -rf node_modules package-lock.json && npm install`)
- [x] All 105 tests passed across `test:tools`, `test:chat`, and `test:security`
- [x] TypeScript clean compilation (`npx tsc --noEmit`)
