# WardOS: 3-Minute Video Demo Script
**Amazon Developer Hackathon - Alexa+ Track**

*A walkthrough of WardOS, a voice-first administrative assistant for hospital ward teams in India.*

---

### [0:00 - 0:25] Introduction & Staff Authentication
- **On Screen**: Clean, dark Echo Show-inspired interface with teal accent ring. A persistent banner states: *"DEMO USES FICTIONAL PATIENT DATA ONLY - Administrative Assistant Only"*.
- **Presenter Spoken**:
  > *"Every day in Indian hospital wards, doctors and nurses lose hours to paperwork, scattered checklists, and verbal handovers. Clinicians can't type while wearing gloves during rounds, and critical diagnostic reports get lost between shifts. This is WardOS: an ambient, voice-first ward assistant powered by an MCP server built for Alexa+."*
- **Action**: Presenter selects **Dr. Aarav Sharma** and enters PIN `1122` on the on-screen numeric keypad.
- **Presenter**:
  > *"To prevent shoulder surfing, PINs are never spoken aloud—only entered via the on-screen keypad with scrypt hashing and short-lived JWT sessions."*

---

### [0:25 - 0:50] Shift Start & Morning Briefing
- **Action**: Presenter clicks the mic button (or types in console). Voice ring pulses cyan.
- **Voice Command**:
  > *"Give me the morning brief"*
- **WardOS Spoken Output (Alexa+)**:
  > *"Good morning team. We have 14 occupied beds across our 20-bed ward. There are 2 overdue tasks requiring immediate attention, and 3 tasks scheduled for this shift. 4 diagnostic reports are pending from labs and imaging. 2 patients are in the discharge workflow, and 1 administrative draft is awaiting doctor approval. Estimated time saved by voice automation is 34 minutes."*
- **On Screen**: Dashboard strip highlights **34m estimated time saved** and flags 2 overdue tasks in coral red.

---

### [0:50 - 1:20] Ward Rounds & Hands-Free Dictation
- **Voice Command**:
  > *"Start ward rounds now"*
- **WardOS Spoken Output**:
  > *"Starting ward rounds at Bed 1: Ramesh Gupta. 1 open task, 1 pending lab report. Diagnosis as stated: Admitted for routine post-appendectomy recovery observation."*
- **Voice Command (Hindi)**:
  > *"Agla patient kaun hai"*
- **WardOS Spoken Output (Hindi)**:
  > *"अगला मरीज़ लोड हो रहा है: Bed 2, Sunita Devi (Age 46). Dehydration and seasonal viral fever management."*
- **Action**: Doctor navigates back to Bed 1 and dictates note:
- **Voice Command**:
  > *"Draft round note for Bed 1 observations alert and stable plan ambulate with support this evening"*
- **WardOS Spoken Output**:
  > *"Draft round note created for Bed 1. Status is DRAFT awaiting doctor approval."*
- **Presenter**:
  > *"Notice that WardOS strictly records only what the clinician dictated. Unstated fields default to 'Not stated'—the system never hallucinates or adds clinical details."*

---

### [1:20 - 1:55] Role Switching & Role Enforcement (Security Proof)
- **Action**: Presenter switches account to **Nurse Ananya Rao** (PIN: `5566`).
- **Presenter**:
  > *"Role permissions are strictly enforced on the server. Watch what happens when a nurse speaks during the shift."*
- **Voice Command**:
  > *"Add task for Bed 3 verify oxygen flow rate setting"*
- **WardOS Output**:
  > *"Task added for Bed 3: 'verify oxygen flow rate setting' assigned to nurse."*
- **Voice Command (Hindi)**:
  > *"Bed 1 ke liye CBC report mil gayi"*
- **WardOS Output**:
  > *"CBC report for Ramesh Gupta (Bed 1) marked as received."*
- **Presenter**:
  > *"Now watch our security model in action. The nurse tries to approve a doctor-only shift handover."*
- **Voice Command**:
  > *"Confirm and approve handover"*
- **WardOS Spoken Output**:
  > *"Permission denied: Action not permitted for role 'nurse'. Required: doctor."*
- **On Screen**: HTTP 403 Forbidden badge and security audit event logged immediately.

---

### [1:55 - 2:30] Shift Handover Read-Back & Step-Up PIN Authorization
- **Action**: Presenter switches back to **Dr. Aarav Sharma** (Doctor role).
- **Voice Command**:
  > *"Draft shift handover from Morning to Evening"*
- **WardOS Spoken Output**:
  > *"Drafting handover for Morning to Evening. Please listen to the read-back and confirm on screen to approve."*
- **On Screen**: Handover tab opens. The **"Confirm & Approve Handover"** button is greyed out.
- **Presenter**:
  > *"By design, the outgoing clinician cannot approve a handover without the read-back step. The system reads the draft aloud first."*
- **Action**: Presenter clicks **"Read Back Draft Aloud"**. Audio synthesizer speaks patient summaries while an audio progress bar fills.
- **Action**: Read-back completes. "Confirm & Approve" becomes active. Doctor clicks it.
- **On Screen**: **Step-Up PIN Modal** pops up.
- **Presenter**:
  > *"Sensitive actions require an on-screen PIN entered within the last 60 seconds to prevent accidental execution."*
- **Action**: Doctor enters `1122`. The handover badge updates from amber **DRAFT** to emerald **APPROVED**.

---

### [2:30 - 2:50] Strict Safety Scope Guardrail (Refusal Proof)
- **Presenter**:
  > *"WardOS is strictly administrative. What happens if someone asks for medical advice?"*
- **Voice Command**:
  > *"What antibiotic should I prescribe for the patient in Bed 4?"*
- **WardOS Spoken Output**:
  > *"WardOS is an administrative ward assistant only. I cannot provide medical advice, diagnosis, drug dosages, or clinical interpretations. Please consult the attending doctor."*
- **On Screen**: Guardrail refusal flagged in transcript feed. No MCP tools are called.

---

### [2:50 - 3:00] Security Audit Log & Conclusion
- **Action**: Presenter clicks **"Audit Log"** to slide open the side drawer.
- **On Screen**: Complete tamper-evident audit trail showing role, timestamp, tool actions, and security events (permission denied, step-up verifications).
- **Presenter**:
  > *"WardOS demonstrates how an MCP server powers ambient voice assistance with Alexa+, keeping Indian hospital wards organized, safe, and accountable. Thank you!"*
