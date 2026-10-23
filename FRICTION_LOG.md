# Friction Log: Real Problems Hit During WardOS Build

This document records the actual friction points encountered during development, the symptoms observed, and the resolutions implemented.

---

### 1. Sandbox Socket Binding EPERM
- **Problem**: When running `test-tools.ts` inside the standard terminal sandbox, loopback HTTP connections to `127.0.0.1:4567` failed with `connect EPERM 127.0.0.1:4567`.
- **Cause**: Standard sandbox isolation restricts socket and network port binding.
- **Resolution**: Ran server test suites with `BypassSandbox: true` to permit local socket binding on `127.0.0.1`.

---

### 2. Top-Level Await with TypeScript Loaders
- **Problem**: Calling `await mcpServer.connect(mcpTransport)` at the root module level in `src/index.ts` failed when evaluated by `tsx` with `ERR_REQUIRE_ASYNC_MODULE: Top-level await is currently not supported with the "cjs" output format`.
- **Cause**: Node.js and esbuild transform loaders treat inline `-e` snippets as CommonJS, conflicting with top-level await.
- **Resolution**: Encapsulated the connection logic in an async `ensureMcpConnected()` function, called asynchronously on server start and ensured before incoming requests on `/mcp`.

---

### 3. Express CORS Error Propagation
- **Problem**: When testing disallowed origins in the security suite (`test-security.ts`), passing `callback(new Error('CORS blocked'))` inside `cors()` resulted in an unhandled 500 error instead of a 403 Forbidden.
- **Cause**: Express standard error propagation defaults unhandled errors to HTTP 500.
- **Resolution**: Attached `.status = 403` to the CORS error object and added an explicit global Express error handler:
  ```ts
  app.use((err, req, res, next) => {
    res.status(err.status || 500).json({ error: err.message });
  });
  ```

---

### 4. Decimal Values in Clinical Safety Guardrail Regex
- **Problem**: The medical advice query *"Is potassium 6.2 dangerous for the patient in bed 9?"* was initially not flagged by `checkMedicalAdviceGuardrail()`.
- **Cause**: The regex expected `potassium dangerous` directly and did not account for lab numerical readings like `6.2` appearing between the analyte name and the adjective.
- **Resolution**: Updated the regex to `(potassium|sodium|...)\s+([0-9.]+\s+)?(dangerous|high|...)` to cleanly catch numerical lab values.

---

### 5. Intent Priority Collision (Pending Test vs Open Tasks)
- **Problem**: The Hindi query *"aaj kya kya pending hai ward me"* (meaning "what is pending in the ward today") triggered `add_pending_item` instead of `get_open_tasks`.
- **Cause**: The pattern for logging pending diagnostic items matched the substring `pending hai` before reaching the overview intent rule.
- **Resolution**: Added a negative lookahead `!/kya\s+kya\s+pending/i` to the `add_pending_item` regex so overview queries route directly to `get_open_tasks`.

---

### 6. Read-back Confirmation Requirement on Shift Handover
- **Problem**: Initial test called `approve_handover` with `confirm_read_back: false` expecting a warning, but needed a strict exception thrown.
- **Cause**: Handover approval requires outgoing clinician verification after audio playback.
- **Resolution**: Built an explicit guard in `approveHandover`:
  ```ts
  if (!confirm_read_back) {
    throw new Error('Read-back confirmation required: Outgoing clinician must confirm after hearing the draft read back.');
  }
  ```
  Verified via automated test case in `tests/test-tools.ts`.
