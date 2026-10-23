// ============================================================
// WardOS - Frontend Application Engine
// ============================================================

const state = {
  currentUser: null,
  currentLang: 'en',
  activeTab: 'tab-ward',
  wardData: null,
  isListening: false,
  isSpeaking: false,
  staffList: [],
  selectedStaffId: null,
  keypadPin: '',
  stepUpPin: '',
  pendingStepUpAction: null,
  inactivityTimer: null,
  warningTimer: null,
  warningCountdown: 15,
  demoRunning: false,
  demoStep: 0,
  demoTimeoutId: null,
  roundsPatient: null,
  handoverDraft: null,
  isReadBackFinished: false,
};

// Language map for Web Speech API
const langSpeechMap = {
  en: 'en-IN',
  hi: 'hi-IN',
  te: 'te-IN',
};

// --- DOM ELEMENT REFERENCES ---
const elements = {
  // Top bar
  runDemoBtn: document.getElementById('runDemoBtn'),
  userAvatar: document.getElementById('userAvatar'),
  userNameDisplay: document.getElementById('userNameDisplay'),
  userRoleBadge: document.getElementById('userRoleBadge'),
  switchStaffBtn: document.getElementById('switchStaffBtn'),
  lockNowBtn: document.getElementById('lockNowBtn'),
  auditDrawerBtn: document.getElementById('auditDrawerBtn'),
  closeAuditDrawerBtn: document.getElementById('closeAuditDrawerBtn'),
  auditDrawer: document.getElementById('auditDrawer'),
  auditLogList: document.getElementById('auditLogList'),
  auditCountBadge: document.getElementById('auditCountBadge'),

  // Metrics
  metricBeds: document.getElementById('metricBeds'),
  metricBedsSub: document.getElementById('metricBedsSub'),
  metricOpenTasks: document.getElementById('metricOpenTasks'),
  metricOpenTasksSub: document.getElementById('metricOpenTasksSub'),
  metricOverdueTasks: document.getElementById('metricOverdueTasks'),
  metricPendingReports: document.getElementById('metricPendingReports'),
  metricPendingDrafts: document.getElementById('metricPendingDrafts'),
  metricTimeSaved: document.getElementById('metricTimeSaved'),

  // Voice Console
  voiceRing: document.getElementById('voiceRing'),
  micBtn: document.getElementById('micBtn'),
  voiceStatus: document.getElementById('voiceStatus'),
  voiceForm: document.getElementById('voiceForm'),
  voiceInput: document.getElementById('voiceInput'),
  transcriptFeed: document.getElementById('transcriptFeed'),
  demoCaptionBar: document.getElementById('demoCaptionBar'),
  demoStepBadge: document.getElementById('demoStepBadge'),
  demoCaptionText: document.getElementById('demoCaptionText'),
  stopDemoBtn: document.getElementById('stopDemoBtn'),

  // Brief & Rounds
  playBriefBtn: document.getElementById('playBriefBtn'),
  briefPreviewText: document.getElementById('briefPreviewText'),
  roundProgressBadge: document.getElementById('roundProgressBadge'),
  roundBed: document.getElementById('roundBed'),
  roundName: document.getElementById('roundName'),
  roundDiagnosis: document.getElementById('roundDiagnosis'),
  roundAdminSummary: document.getElementById('roundAdminSummary'),
  prevRoundBtn: document.getElementById('prevRoundBtn'),
  nextRoundBtn: document.getElementById('nextRoundBtn'),
  dictateNoteBtn: document.getElementById('dictateNoteBtn'),

  // Ward Board
  bedsGrid: document.getElementById('bedsGrid'),
  admitPatientBtn: document.getElementById('admitPatientBtn'),

  // Tasks
  taskCountBadge: document.getElementById('taskCountBadge'),
  taskRoleFilter: document.getElementById('taskRoleFilter'),
  addNewTaskBtn: document.getElementById('addNewTaskBtn'),
  overdueTaskList: document.getElementById('overdueTaskList'),
  dueTaskList: document.getElementById('dueTaskList'),
  doneTaskList: document.getElementById('doneTaskList'),
  overdueCountBadge: document.getElementById('overdueCountBadge'),
  dueCountBadge: document.getElementById('dueCountBadge'),
  doneCountBadge: document.getElementById('doneCountBadge'),

  // Handover
  handoverStatusBadge: document.getElementById('handoverStatusBadge'),
  handoverBadge: document.getElementById('handoverBadge'),
  handoverMeta: document.getElementById('handoverMeta'),
  readBackHandoverBtn: document.getElementById('readBackHandoverBtn'),
  approveHandoverBtn: document.getElementById('approveHandoverBtn'),
  readbackProgress: document.getElementById('readbackProgress'),
  readbackProgressBar: document.getElementById('readbackProgressBar'),
  readbackLabel: document.getElementById('readbackLabel'),
  handoverPatientsList: document.getElementById('handoverPatientsList'),

  // Diagnostics & Discharges
  pendingItemsList: document.getElementById('pendingItemsList'),
  dischargeChecklistsList: document.getElementById('dischargeChecklistsList'),
  addPendingReportBtn: document.getElementById('addPendingReportBtn'),
  startNewDischargeBtn: document.getElementById('startNewDischargeBtn'),

  // Modals
  loginModal: document.getElementById('loginModal'),
  staffPicker: document.getElementById('staffPicker'),
  loginFeedback: document.getElementById('loginFeedback'),
  stepUpModal: document.getElementById('stepUpModal'),
  stepUpActionDesc: document.getElementById('stepUpActionDesc'),
  stepUpFeedback: document.getElementById('stepUpFeedback'),
  autoLockWarningModal: document.getElementById('autoLockWarningModal'),
  lockCountdownSec: document.getElementById('lockCountdownSec'),
  stayActiveBtn: document.getElementById('stayActiveBtn'),
  lockNowConfirmBtn: document.getElementById('lockNowConfirmBtn'),
  dictateNoteModal: document.getElementById('dictateNoteModal'),
  noteBedInput: document.getElementById('noteBedInput'),
  noteObsInput: document.getElementById('noteObsInput'),
  notePlanInput: document.getElementById('notePlanInput'),
  cancelNoteBtn: document.getElementById('cancelNoteBtn'),
  dictateNoteForm: document.getElementById('dictateNoteForm'),
};

// ============================================================
// 1. INITIALIZATION & AUTHENTICATION
// ============================================================

async function initApp() {
  setupEventListeners();
  await checkSession();
}

async function checkSession() {
  try {
    const res = await fetch('/api/auth/me');
    if (res.ok) {
      const data = await res.json();
      if (data.authenticated && !data.user.isLocked) {
        setLoggedInUser(data.user);
        await refreshAllData();
        resetInactivityTimer();
        return;
      }
    }
  } catch (err) {
    console.error('Session check failed:', err);
  }
  showLoginModal();
}

async function showLoginModal() {
  elements.loginModal.style.display = 'flex';
  state.keypadPin = '';
  updatePinDots('login');
  elements.loginFeedback.textContent = '';

  try {
    const res = await fetch('/api/auth/staff-list');
    const data = await res.json();
    state.staffList = data.staff;
    renderStaffPicker();
  } catch (err) {
    elements.loginFeedback.textContent = 'Failed to load staff list';
  }
}

function renderStaffPicker() {
  elements.staffPicker.innerHTML = '';
  state.staffList.forEach((s, idx) => {
    const btn = document.createElement('button');
    btn.className = `staff-pick-btn ${idx === 0 ? 'selected' : ''}`;
    btn.dataset.id = s.id;
    btn.innerHTML = `
      <span class="staff-pick-name">${escapeHtml(s.name)}</span>
      <span class="role-badge ${s.role}">${s.role}</span>
    `;
    btn.addEventListener('click', () => {
      document.querySelectorAll('.staff-pick-btn').forEach(b => b.classList.remove('selected'));
      btn.classList.add('selected');
      state.selectedStaffId = s.id;
      state.keypadPin = '';
      updatePinDots('login');
      elements.loginFeedback.textContent = '';
    });
    elements.staffPicker.appendChild(btn);
  });
  state.selectedStaffId = state.staffList[0]?.id || 'doc-1';
}

function updatePinDots(type = 'login') {
  const pin = type === 'login' ? state.keypadPin : state.stepUpPin;
  const prefix = type === 'login' ? 'dot' : 'stepDot';
  for (let i = 1; i <= 4; i++) {
    const dot = document.getElementById(`${prefix}${i}`);
    if (dot) {
      if (i <= pin.length) dot.classList.add('filled');
      else dot.classList.remove('filled');
    }
  }
}

async function handlePinKey(digit, type = 'login') {
  if (type === 'login') {
    if (state.keypadPin.length < 4) {
      state.keypadPin += digit;
      updatePinDots('login');
      if (state.keypadPin.length === 4) {
        await submitLogin();
      }
    }
  } else {
    if (state.stepUpPin.length < 4) {
      state.stepUpPin += digit;
      updatePinDots('stepup');
      if (state.stepUpPin.length === 4) {
        await submitStepUp();
      }
    }
  }
}

async function submitLogin() {
  elements.loginFeedback.textContent = 'Verifying PIN...';
  try {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ staff_id: state.selectedStaffId, pin: state.keypadPin }),
    });
    const data = await res.json();
    if (!res.ok) {
      elements.loginFeedback.textContent = data.error || 'Login failed';
      state.keypadPin = '';
      updatePinDots('login');
      return;
    }
    elements.loginModal.style.display = 'none';
    setLoggedInUser(data.user);
    await refreshAllData();
    resetInactivityTimer();
    addTranscript('system', `Clinician ${data.user.name} (${data.user.role.toUpperCase()}) authenticated. WardOS ready.`);
  } catch (err) {
    elements.loginFeedback.textContent = 'Connection error during login';
    state.keypadPin = '';
    updatePinDots('login');
  }
}

function setLoggedInUser(user) {
  state.currentUser = user;
  elements.userNameDisplay.textContent = user.name;
  elements.userAvatar.textContent = user.name.split(' ').map(n => n[0]).join('').slice(0, 2);
  elements.userRoleBadge.textContent = user.role.toUpperCase();
  elements.userRoleBadge.className = `role-badge ${user.role}`;

  // Role permissions UI adjustments
  if (user.role === 'nurse') {
    elements.admitPatientBtn.style.display = 'none';
    elements.dictateNoteBtn.style.display = 'none';
  } else {
    elements.admitPatientBtn.style.display = 'block';
    elements.dictateNoteBtn.style.display = 'block';
  }
}

// ============================================================
// 2. AUTO-LOCK & SECURITY INACTIVITY
// ============================================================

function resetInactivityTimer() {
  if (state.inactivityTimer) clearTimeout(state.inactivityTimer);
  if (state.warningTimer) clearInterval(state.warningTimer);
  elements.autoLockWarningModal.style.display = 'none';

  // 1 minute 45 seconds -> warning
  state.inactivityTimer = setTimeout(() => {
    showAutoLockWarning();
  }, 105 * 1000);
}

function showAutoLockWarning() {
  state.warningCountdown = 15;
  elements.lockCountdownSec.textContent = state.warningCountdown;
  elements.autoLockWarningModal.style.display = 'flex';

  state.warningTimer = setInterval(() => {
    state.warningCountdown--;
    elements.lockCountdownSec.textContent = state.warningCountdown;
    if (state.warningCountdown <= 0) {
      clearInterval(state.warningTimer);
      lockSessionNow();
    }
  }, 1000);
}

async function lockSessionNow() {
  try {
    await fetch('/api/auth/lock', { method: 'POST' });
  } catch (e) {}
  if (state.isListening) stopListening();
  elements.autoLockWarningModal.style.display = 'none';
  showLoginModal();
}

// ============================================================
// 3. STEP-UP PIN CONFIRMATION
// ============================================================

function triggerStepUpConfirmation(actionDescription, onConfirmedCallback) {
  state.pendingStepUpAction = onConfirmedCallback;
  state.stepUpPin = '';
  updatePinDots('stepup');
  elements.stepUpActionDesc.textContent = actionDescription || 'Please confirm your 4-digit PIN on screen to authorize this sensitive clinical action.';
  elements.stepUpFeedback.textContent = '';
  elements.stepUpModal.style.display = 'flex';
}

async function submitStepUp() {
  elements.stepUpFeedback.textContent = 'Verifying PIN...';
  try {
    const res = await fetch('/api/auth/step-up', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pin: state.stepUpPin }),
    });
    const data = await res.json();
    if (!res.ok) {
      elements.stepUpFeedback.textContent = data.error || 'Incorrect PIN';
      state.stepUpPin = '';
      updatePinDots('stepup');
      return;
    }

    elements.stepUpModal.style.display = 'none';
    const callback = state.pendingStepUpAction;
    state.pendingStepUpAction = null;
    if (callback) {
      await callback();
    }
  } catch (err) {
    elements.stepUpFeedback.textContent = 'Error verifying step-up PIN';
    state.stepUpPin = '';
    updatePinDots('stepup');
  }
}

// ============================================================
// 4. DATA REFRESH & UI RENDERING
// ============================================================

async function refreshAllData() {
  try {
    // 1. Ward Board
    const boardRes = await fetch('/api/ward/board');
    if (boardRes.ok) {
      const boardJson = await boardRes.json();
      renderWardBoard(boardJson.data);
      elements.metricBeds.textContent = `${boardJson.data.occupied_beds_count} / ${boardJson.data.total_beds}`;
      elements.metricBedsSub.textContent = `${Math.round((boardJson.data.occupied_beds_count / boardJson.data.total_beds) * 100)}% Capacity`;
    }

    // 2. Tasks
    const tasksRes = await fetch('/api/ward/tasks');
    if (tasksRes.ok) {
      const tasksJson = await tasksRes.json();
      renderTasks(tasksJson.open, tasksJson.completed);
    }

    // 3. Diagnostics & Discharges
    const pendingRes = await fetch('/api/ward/pending');
    if (pendingRes.ok) {
      const pendingJson = await pendingRes.json();
      renderPendingItems(pendingJson.pending);
      elements.metricPendingReports.textContent = pendingJson.pending.length;
    }

    const dischargesRes = await fetch('/api/ward/discharges');
    if (dischargesRes.ok) {
      const discJson = await dischargesRes.json();
      renderDischarges(discJson.data);
    }

    // 4. Summary & Briefing
    const summaryRes = await fetch('/api/ward/summary');
    if (summaryRes.ok) {
      const sumJson = await summaryRes.json();
      elements.metricTimeSaved.textContent = `${sumJson.data.estimated_time_saved_minutes}m`;
      elements.metricPendingDrafts.textContent = sumJson.data.drafts_awaiting_approval;
    }

    // 5. Shift Handover
    const hoRes = await fetch('/api/ward/handovers');
    if (hoRes.ok) {
      const hoJson = await hoRes.json();
      if (hoJson.handovers && hoJson.handovers.length > 0) {
        state.handoverDraft = hoJson.handovers[0];
        renderHandover(state.handoverDraft);
      }
    }

    // 6. Audit Log
    loadAuditLog();
  } catch (err) {
    console.error('Error refreshing ward data:', err);
  }
}

function renderWardBoard(boardData) {
  elements.bedsGrid.innerHTML = '';
  boardData.beds.forEach(bed => {
    const card = document.createElement('div');
    card.className = `bed-card ${bed.status.replace(/\s+/g, '-')}`;
    card.innerHTML = `
      <div class="bed-header">
        <span class="bed-number">${escapeHtml(bed.bed)}</span>
        <span class="chip-status ${bed.status.replace(/\s+/g, '-')}">${escapeHtml(bed.status)}</span>
      </div>
      <div class="bed-patient-name">${bed.patient_name ? escapeHtml(bed.patient_name) : '<em style="color:var(--text-dim)">Empty</em>'}</div>
      <div class="bed-diagnosis">${bed.diagnosis_as_stated ? escapeHtml(bed.diagnosis_as_stated) : 'Available for admission'}</div>
      <div class="bed-footer">
        <span class="bed-tasks-count">${bed.open_tasks_count > 0 ? `<strong>${bed.open_tasks_count}</strong> tasks` : 'No open tasks'}</span>
      </div>
    `;
    card.addEventListener('click', () => {
      if (bed.patient_name) {
        handleVoiceCommand(`show details for ${bed.bed}`);
      }
    });
    elements.bedsGrid.appendChild(card);
  });
}

function renderTasks(openTasks = [], completedTasks = []) {
  const now = Date.now();
  const filterRole = elements.taskRoleFilter.value;

  let filteredOpen = openTasks;
  if (filterRole !== 'all') {
    filteredOpen = filteredOpen.filter(t => t.assigned_role === filterRole || t.assigned_role === 'all');
  }

  const overdue = filteredOpen.filter(t => new Date(t.due_time).getTime() < now);
  const due = filteredOpen.filter(t => new Date(t.due_time).getTime() >= now);

  elements.taskCountBadge.textContent = filteredOpen.length;
  elements.metricOpenTasks.textContent = filteredOpen.length;
  elements.metricOverdueTasks.textContent = overdue.length;
  elements.overdueCountBadge.textContent = overdue.length;
  elements.dueCountBadge.textContent = due.length;
  elements.doneCountBadge.textContent = completedTasks.length;

  // Render Overdue Column
  elements.overdueTaskList.innerHTML = '';
  overdue.forEach(t => elements.overdueTaskList.appendChild(createTaskElement(t, true)));

  // Render Due Column
  elements.dueTaskList.innerHTML = '';
  due.forEach(t => elements.dueTaskList.appendChild(createTaskElement(t, false)));

  // Render Done Column
  elements.doneTaskList.innerHTML = '';
  completedTasks.slice(0, 10).forEach(t => {
    const el = document.createElement('div');
    el.className = 'task-item';
    el.style.opacity = '0.7';
    el.innerHTML = `
      <div class="task-item-header">
        <span class="task-bed-chip">${escapeHtml(t.bed || 'Ward')}</span>
        <span class="task-role-tag">Completed</span>
      </div>
      <div class="task-desc" style="text-decoration: line-through;">${escapeHtml(t.description)}</div>
      <div class="task-footer">
        <span class="task-due-time">${t.completed_by ? `By: ${escapeHtml(t.completed_by)}` : 'Done'}</span>
      </div>
    `;
    elements.doneTaskList.appendChild(el);
  });
}

function createTaskElement(task, isOverdue) {
  const el = document.createElement('div');
  el.className = 'task-item';
  el.innerHTML = `
    <div class="task-item-header">
      <span class="task-bed-chip">${escapeHtml(task.bed || 'Ward')}</span>
      <span class="task-role-tag">${escapeHtml(task.assigned_role)}</span>
    </div>
    <div class="task-desc">${escapeHtml(task.description)}</div>
    <div class="task-footer">
      <span class="task-due-time ${isOverdue ? 'overdue' : ''}">${isOverdue ? 'OVERDUE' : 'Due this shift'}</span>
      <button class="btn-complete-task" data-id="${task.id}">Mark Done</button>
    </div>
  `;
  el.querySelector('.btn-complete-task').addEventListener('click', async (e) => {
    e.stopPropagation();
    await handleVoiceCommand(`complete task ${task.id}`);
  });
  return el;
}

function renderHandover(handover) {
  if (!handover) return;
  const isDraft = handover.status === 'draft';
  elements.handoverStatusBadge.textContent = isDraft ? 'DRAFT' : 'APPROVED';
  elements.handoverBadge.textContent = isDraft ? 'DRAFT - AWAITING APPROVAL' : 'APPROVED BY CLINICIAN';
  elements.handoverBadge.className = `badge-handover ${handover.status}`;

  elements.handoverMeta.innerHTML = `
    Shift: <strong>${escapeHtml(handover.from_shift)} &rarr; ${escapeHtml(handover.to_shift)}</strong> &bull; 
    Created by: <strong>${escapeHtml(handover.created_by)}</strong> (${handover.created_by_role}) &bull; 
    Read-back: <strong>${handover.read_back_confirmed ? 'CONFIRMED' : 'PENDING'}</strong>
  `;

  elements.approveHandoverBtn.disabled = !state.isReadBackFinished && !handover.read_back_confirmed;

  elements.handoverPatientsList.innerHTML = '';
  handover.patients.forEach(p => {
    const pCard = document.createElement('div');
    pCard.className = 'handover-patient-card';
    pCard.innerHTML = `
      <div class="ho-pat-header">
        <span class="ho-bed">${escapeHtml(p.bed)}</span>
        <span class="ho-name">${escapeHtml(p.name)}</span>
      </div>
      <div class="ho-field">
        <strong>Approved Notes As Stated:</strong> 
        <span>${escapeHtml(p.approved_round_note_as_stated)}</span>
      </div>
      <div class="ho-field">
        <strong>Open Tasks:</strong> 
        <span>${escapeHtml(p.open_tasks.join('; '))}</span>
      </div>
      <div class="ho-field">
        <strong>Pending Reports:</strong> 
        <span>${escapeHtml(p.pending_items.join('; '))}</span>
      </div>
      <div class="ho-field">
        <strong>Discharge Status:</strong> 
        <span>${escapeHtml(p.discharge_status)}</span>
      </div>
    `;
    elements.handoverPatientsList.appendChild(pCard);
  });
}

function renderPendingItems(items = []) {
  elements.pendingItemsList.innerHTML = '';
  if (items.length === 0) {
    elements.pendingItemsList.innerHTML = '<div style="color:var(--text-dim); padding:10px;">No pending reports at this time.</div>';
    return;
  }
  items.forEach(item => {
    const el = document.createElement('div');
    el.className = 'pending-item-card';
    el.innerHTML = `
      <div class="pending-item-info">
        <span class="item-type-badge">${escapeHtml(item.type)}</span>
        <span class="item-desc">${escapeHtml(item.description)}</span>
        <span class="item-patient">${escapeHtml(item.bed)} &bull; ${escapeHtml(item.patient_name)}</span>
      </div>
      <button class="btn-received" data-id="${item.id}">Mark Received</button>
    `;
    el.querySelector('.btn-received').addEventListener('click', async () => {
      await handleVoiceCommand(`report received for ${item.id}`);
    });
    elements.pendingItemsList.appendChild(el);
  });
}

function renderDischarges(dischargingPatients = []) {
  elements.dischargeChecklistsList.innerHTML = '';
  if (dischargingPatients.length === 0) {
    elements.dischargeChecklistsList.innerHTML = '<div style="color:var(--text-dim); padding:10px;">No active discharge workflows.</div>';
    return;
  }

  dischargingPatients.forEach(p => {
    const el = document.createElement('div');
    el.className = 'discharge-card';
    const cl = p.checklist || {};
    el.innerHTML = `
      <div class="discharge-header">
        <div>
          <strong>${escapeHtml(p.bed)}: ${escapeHtml(p.name)}</strong>
          <div style="font-size:11px; color:var(--text-dim);">Administrative Discharge Checklist</div>
        </div>
        <span class="chip-status awaiting-discharge">Awaiting Discharge</span>
      </div>
      <div class="discharge-checklist-items">
        <label class="checklist-checkbox-label">
          <input type="checkbox" data-bed="${p.bed}" data-item="summary_written" ${cl.summary_written ? 'checked' : ''}>
          <span>Summary Written</span>
        </label>
        <label class="checklist-checkbox-label">
          <input type="checkbox" data-bed="${p.bed}" data-item="bill_cleared" ${cl.bill_cleared ? 'checked' : ''}>
          <span>Bill Cleared</span>
        </label>
        <label class="checklist-checkbox-label">
          <input type="checkbox" data-bed="${p.bed}" data-item="medicines_handed_over" ${cl.medicines_handed_over ? 'checked' : ''}>
          <span>Meds Handed Over</span>
        </label>
        <label class="checklist-checkbox-label">
          <input type="checkbox" data-bed="${p.bed}" data-item="follow_up_date_given" ${cl.follow_up_date_given ? 'checked' : ''}>
          <span>Follow-up Date Given</span>
        </label>
        <label class="checklist-checkbox-label">
          <input type="checkbox" data-bed="${p.bed}" data-item="transport_arranged" ${cl.transport_arranged ? 'checked' : ''}>
          <span>Transport Arranged</span>
        </label>
      </div>
    `;

    el.querySelectorAll('input[type="checkbox"]').forEach(box => {
      box.addEventListener('change', async (e) => {
        const itemKey = e.target.dataset.item;
        const bed = e.target.dataset.bed;
        await handleVoiceCommand(`mark ${itemKey.replace(/_/g, ' ')} for ${bed}`);
      });
    });

    elements.dischargeChecklistsList.appendChild(el);
  });
}

async function loadAuditLog(filter) {
  try {
    const url = filter && filter !== 'all' ? `/api/ward/audit?filter=${filter}` : '/api/ward/audit';
    const res = await fetch(url);
    if (res.ok) {
      const data = await res.json();
      elements.auditCountBadge.textContent = `${data.data.length} entries`;
      elements.auditLogList.innerHTML = '';
      data.data.forEach(entry => {
        const item = document.createElement('div');
        item.className = `audit-entry-card ${entry.category}`;
        const timeStr = new Date(entry.timestamp).toLocaleTimeString();
        item.innerHTML = `
          <div class="audit-meta-row">
            <span class="audit-action-name">${escapeHtml(entry.action)}</span>
            <span class="audit-role-tag ${entry.role}">${escapeHtml(entry.role)}</span>
          </div>
          <div style="font-size:11px; color:var(--text-dim); display:flex; justify-content:space-between;">
            <span>Staff: ${escapeHtml(entry.staff_name || 'System')}</span>
            <span class="audit-time">${timeStr}</span>
          </div>
          <div class="audit-details-text">${escapeHtml(JSON.stringify(entry.details))}</div>
        `;
        elements.auditLogList.appendChild(item);
      });
    }
  } catch (err) {
    console.error('Error loading audit log:', err);
  }
}

// ============================================================
// 5. VOICE ASSISTANT & CHAT EXECUTION
// ============================================================

async function handleVoiceCommand(text) {
  resetInactivityTimer();
  addTranscript('user', text);
  elements.voiceStatus.textContent = 'Processing administrative command...';

  try {
    const res = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, language: state.currentLang }),
    });
    const data = await res.json();

    if (data.requiresStepUp) {
      triggerStepUpConfirmation(data.reply, async () => {
        // Retry the command after successful step-up PIN
        await handleVoiceCommand(text);
      });
      addTranscript('system', `[STEP-UP REQUIRED] On-screen PIN confirmation needed.`);
      return;
    }

    if (!res.ok) {
      addTranscript('assistant', data.error || 'Action could not be completed.');
      elements.voiceStatus.textContent = data.error || 'Error';
      speakText(data.error || 'Permission denied or error executing action.');
      return;
    }

    // Add tool chips if any were called
    let toolChip = '';
    if (data.toolCalls && data.toolCalls.length > 0) {
      toolChip = data.toolCalls.map(tc => `<span class="mcp-tool-chip">[mcp:${escapeHtml(tc.toolName)}]</span>`).join(' ');
    }

    addTranscript('assistant', `${data.reply} ${toolChip}`);
    elements.voiceStatus.textContent = 'Listening ready';

    // Speak reply
    speakText(data.reply);

    // Refresh UI
    await refreshAllData();

    // If rounds action, update active rounds card
    if (data.toolCalls?.some(tc => tc.toolName === 'start_rounds' || tc.toolName === 'get_next_round_patient')) {
      if (data.data?.current_patient) {
        updateRoundsCard(data.data);
      }
    }
  } catch (err) {
    console.error('Chat API error:', err);
    addTranscript('assistant', 'Unable to connect to WardOS MCP server.');
    elements.voiceStatus.textContent = 'Connection error';
  }
}

function updateRoundsCard(roundsData) {
  state.roundsPatient = roundsData.current_patient;
  elements.roundProgressBadge.textContent = `Patient ${roundsData.index} / ${roundsData.total_patients}`;
  elements.roundBed.textContent = roundsData.current_patient.bed;
  elements.roundName.textContent = `${roundsData.current_patient.name} (Age ${roundsData.current_patient.age})`;
  elements.roundDiagnosis.textContent = roundsData.current_patient.diagnosis_as_stated;
  elements.roundAdminSummary.innerHTML = `
    <span>Tasks: <strong>${roundsData.open_tasks.length} open</strong></span> &bull; 
    <span>Pending: <strong>${roundsData.pending_items.length} items</strong></span> &bull; 
    <span>Status: <strong class="chip-status ${roundsData.current_patient.status.replace(/\s+/g, '-')}">${roundsData.current_patient.status}</strong></span>
  `;
}

function addTranscript(role, text) {
  const item = document.createElement('div');
  item.className = `transcript-item ${role}`;
  const time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  const metaLabel = role === 'user' ? (state.currentUser?.name || 'Clinician') : role === 'assistant' ? 'WardOS Alexa+' : 'System';
  item.innerHTML = `
    <div class="transcript-meta">${escapeHtml(metaLabel)} &bull; ${time}</div>
    <div class="transcript-bubble">${text}</div>
  `;
  elements.transcriptFeed.appendChild(item);
  elements.transcriptFeed.scrollTop = elements.transcriptFeed.scrollHeight;
}

// Speech Synthesis
function speakText(text, onEnd) {
  if (!('speechSynthesis' in window)) {
    if (onEnd) onEnd();
    return;
  }

  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = langSpeechMap[state.currentLang] || 'en-IN';
  utterance.rate = 1.05;

  elements.voiceRing.classList.add('speaking');
  state.isSpeaking = true;

  utterance.onend = () => {
    elements.voiceRing.classList.remove('speaking');
    state.isSpeaking = false;
    if (onEnd) onEnd();
  };

  utterance.onerror = () => {
    elements.voiceRing.classList.remove('speaking');
    state.isSpeaking = false;
    if (onEnd) onEnd();
  };

  window.speechSynthesis.speak(utterance);
}

// Web Speech Recognition
let recognition = null;
function initSpeechRecognition() {
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRecognition) {
    elements.voiceStatus.textContent = 'Voice input not supported in this browser. Please use text input below.';
    return;
  }

  recognition = new SpeechRecognition();
  recognition.continuous = false;
  recognition.interimResults = false;
  recognition.lang = langSpeechMap[state.currentLang] || 'en-IN';

  recognition.onstart = () => {
    state.isListening = true;
    elements.micBtn.classList.add('active');
    elements.voiceRing.classList.add('listening');
    elements.voiceStatus.textContent = `Listening in ${state.currentLang.toUpperCase()}... Speak hands-free`;
  };

  recognition.onresult = (event) => {
    const transcript = event.results[0][0].transcript;
    elements.voiceInput.value = transcript;
    handleVoiceCommand(transcript);
  };

  recognition.onerror = (event) => {
    console.warn('Speech recognition error:', event.error);
    stopListening();
  };

  recognition.onend = () => {
    stopListening();
  };
}

function startListening() {
  if (!recognition) initSpeechRecognition();
  if (recognition) {
    try {
      recognition.lang = langSpeechMap[state.currentLang] || 'en-IN';
      recognition.start();
    } catch (e) {
      console.warn('Recognition start exception:', e);
    }
  }
}

function stopListening() {
  state.isListening = false;
  elements.micBtn.classList.remove('active');
  elements.voiceRing.classList.remove('listening');
  elements.voiceStatus.textContent = 'Click mic or type to speak to WardOS';
  if (recognition) {
    try { recognition.stop(); } catch (e) {}
  }
}

// Handover Read-Back Routine
function startHandoverReadBack() {
  if (!state.handoverDraft) return;

  elements.readbackProgress.style.display = 'block';
  elements.readbackProgressBar.style.width = '10%';
  elements.readbackLabel.textContent = 'Reading back shift handover draft aloud for clinician verification...';

  const pSummaries = state.handoverDraft.patients.map(p =>
    `${p.bed}, ${p.name}. Notes: ${p.approved_round_note_as_stated}. Tasks: ${p.open_tasks.join(', ')}. Pending reports: ${p.pending_items.join(', ')}.`
  ).join(' Next patient: ');

  const fullText = `Shift handover from ${state.handoverDraft.from_shift} to ${state.handoverDraft.to_shift}. ${pSummaries}. End of shift handover draft. Please confirm on screen to approve.`;

  // Animate progress bar over reading
  let progress = 10;
  const progressInterval = setInterval(() => {
    if (progress < 95) {
      progress += 5;
      elements.readbackProgressBar.style.width = `${progress}%`;
    }
  }, 1000);

  speakText(fullText, () => {
    clearInterval(progressInterval);
    elements.readbackProgressBar.style.width = '100%';
    elements.readbackLabel.textContent = '✓ Read-back completed. Outgoing clinician may now confirm and approve.';
    state.isReadBackFinished = true;
    elements.approveHandoverBtn.disabled = false;
  });
}

// ============================================================
// 6. AUTOMATED SCRIPTED DEMO RUNNER (3 MINUTE TOUR)
// ============================================================

async function startDemoRunner() {
  state.demoRunning = true;
  state.demoStep = 0;
  elements.demoCaptionBar.style.display = 'flex';
  elements.runDemoBtn.disabled = true;

  // Scripted demo sequence covering all requirements
  const scriptSteps = [
    {
      badge: 'DEMO 1/14',
      caption: 'Initial State: Staff Login as Dr. Aarav Sharma (Doctor role with full clinical administration rights)',
      action: async () => {
        setLoggedInUser({ id: 'doc-1', name: 'Dr. Aarav Sharma', role: 'doctor', lastStepUpAt: Date.now() });
        addTranscript('system', 'Demo: Authenticated as Dr. Aarav Sharma (Doctor).');
        await refreshAllData();
      },
      delay: 3500,
    },
    {
      badge: 'DEMO 2/14',
      caption: 'Voice Command: "Give me the morning brief" &rarr; Spoken ward summary of census, overdue tasks, and pending items',
      action: async () => {
        elements.voiceInput.value = 'give me the morning brief';
        await handleVoiceCommand('give me the morning brief');
      },
      delay: 4500,
    },
    {
      badge: 'DEMO 3/14',
      caption: 'Ward Rounds: Doctor says "Start ward rounds now" &rarr; Advances through 20-bed census in bed order',
      action: async () => {
        elements.voiceInput.value = 'start ward rounds now';
        await handleVoiceCommand('start ward rounds now');
      },
      delay: 4000,
    },
    {
      badge: 'DEMO 4/14',
      caption: 'Ward Rounds: Doctor advances &rarr; "Next patient in rounds" (Bed 2: Sunita Devi)',
      action: async () => {
        elements.voiceInput.value = 'next patient';
        await handleVoiceCommand('next patient');
      },
      delay: 3500,
    },
    {
      badge: 'DEMO 5/14',
      caption: 'Round Note: Doctor dictates round note for Bed 1 &rarr; Created strictly as DRAFT (Never adds unstated content)',
      action: async () => {
        elements.voiceInput.value = 'draft round note for bed 1 observations alert and stable plan ambulate in evening';
        await handleVoiceCommand('draft round note for bed 1 observations alert and stable plan ambulate in evening');
      },
      delay: 4000,
    },
    {
      badge: 'DEMO 6/14',
      caption: 'Switch Role to Nurse Ananya Rao &rarr; Nurse interface active (Task assignment & diagnostic reporting)',
      action: async () => {
        setLoggedInUser({ id: 'nurse-1', name: 'Nurse Ananya Rao', role: 'nurse', lastStepUpAt: Date.now() });
        addTranscript('system', 'Demo: Switched role to Nurse Ananya Rao (Nurse).');
        await refreshAllData();
      },
      delay: 3500,
    },
    {
      badge: 'DEMO 7/14',
      caption: 'Nurse Voice Command: "Add task for bed 3 verify oxygen flow rate setting" &rarr; Logged to task board',
      action: async () => {
        elements.voiceInput.value = 'add task for bed 3 verify oxygen flow rate setting';
        await handleVoiceCommand('add task for bed 3 verify oxygen flow rate setting');
      },
      delay: 4000,
    },
    {
      badge: 'DEMO 8/14',
      caption: 'Diagnostic Item: Nurse logs "CBC report received for Bed 1" &rarr; Marked received with timestamp',
      action: async () => {
        elements.voiceInput.value = 'CBC report received for Bed 1';
        await handleVoiceCommand('CBC report received for Bed 1');
      },
      delay: 4000,
    },
    {
      badge: 'DEMO 9/14',
      caption: 'Discharge Workflow: "Start discharge for Bed 4" &rarr; Administrative checklist initiated',
      action: async () => {
        elements.voiceInput.value = 'start discharge for bed 4';
        await handleVoiceCommand('start discharge for bed 4');
      },
      delay: 4000,
    },
    {
      badge: 'DEMO 10/14',
      caption: 'SECURITY PROOF: Nurse attempts to approve shift handover &rarr; Strictly rejected with 403 Forbidden ("Permission denied for nurse role")',
      action: async () => {
        elements.voiceInput.value = 'confirm and approve handover';
        await handleVoiceCommand('confirm and approve handover');
      },
      delay: 4500,
    },
    {
      badge: 'DEMO 11/14',
      caption: 'Doctor Re-authentication & Handover Draft: "Draft shift handover from Morning to Evening"',
      action: async () => {
        setLoggedInUser({ id: 'doc-1', name: 'Dr. Aarav Sharma', role: 'doctor', lastStepUpAt: Date.now() });
        elements.voiceInput.value = 'draft shift handover';
        await handleVoiceCommand('draft shift handover');
        switchTab('tab-handover');
      },
      delay: 4500,
    },
    {
      badge: 'DEMO 12/14',
      caption: 'SAFETY GUARDRAIL PROOF: Voice request for clinical advice "What antibiotic should I prescribe for Bed 4?" &rarr; Politely refused!',
      action: async () => {
        elements.voiceInput.value = 'What antibiotic should I prescribe for Bed 4?';
        await handleVoiceCommand('What antibiotic should I prescribe for Bed 4?');
      },
      delay: 4500,
    },
    {
      badge: 'DEMO 13/14',
      caption: 'Security Audit Log: Opening drawer showing full audit trail with roles, timestamps, and security events',
      action: async () => {
        openAuditDrawer();
        await loadAuditLog('all');
      },
      delay: 4000,
    },
    {
      badge: 'DEMO 14/14',
      caption: 'End-of-Shift: "Show end of shift summary" &rarr; Demonstrates estimated time saved by WardOS voice automation',
      action: async () => {
        closeAuditDrawer();
        elements.voiceInput.value = 'show end of shift summary';
        await handleVoiceCommand('show end of shift summary');
      },
      delay: 4500,
    },
  ];

  async function executeStep(index) {
    if (!state.demoRunning || index >= scriptSteps.length) {
      stopDemoRunner();
      return;
    }

    const step = scriptSteps[index];
    elements.demoStepBadge.textContent = step.badge;
    elements.demoCaptionText.textContent = step.caption;

    try {
      await step.action();
    } catch (e) {
      console.warn('Demo step action error:', e);
    }

    state.demoTimeoutId = setTimeout(() => {
      executeStep(index + 1);
    }, step.delay);
  }

  executeStep(0);
}

function stopDemoRunner() {
  state.demoRunning = false;
  if (state.demoTimeoutId) clearTimeout(state.demoTimeoutId);
  elements.demoCaptionBar.style.display = 'none';
  elements.runDemoBtn.disabled = false;
  elements.voiceStatus.textContent = 'Demo finished. You can now test any voice or typed command.';
}

// ============================================================
// 7. EVENT LISTENERS & SETUP
// ============================================================

function setupEventListeners() {
  // Activity listeners to reset auto-lock inactivity timer
  ['mousemove', 'keydown', 'click', 'touchstart'].forEach(evt => {
    window.addEventListener(evt, () => {
      if (!state.currentUser) return;
      resetInactivityTimer();
    }, { passive: true });
  });

  // Language Switcher
  document.querySelectorAll('.lang-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.lang-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      state.currentLang = btn.dataset.lang;
      addTranscript('system', `Language switched to ${btn.textContent.trim()} (${langSpeechMap[state.currentLang]}).`);
    });
  });

  // Navigation Tabs
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      switchTab(btn.dataset.tab);
    });
  });

  // Voice Mic Button
  elements.micBtn.addEventListener('click', () => {
    if (state.isListening) stopListening();
    else startListening();
  });

  // Voice Form
  elements.voiceForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const val = elements.voiceInput.value.trim();
    if (val) {
      elements.voiceInput.value = '';
      handleVoiceCommand(val);
    }
  });

  // Quick Prompt Chips
  document.querySelectorAll('.chip').forEach(chip => {
    chip.addEventListener('click', () => {
      const cmd = chip.dataset.cmd;
      if (cmd) handleVoiceCommand(cmd);
    });
  });

  // Play Morning Brief Button
  elements.playBriefBtn.addEventListener('click', async () => {
    const res = await fetch('/api/ward/brief');
    if (res.ok) {
      const data = await res.json();
      elements.briefPreviewText.textContent = data.data.spoken_brief;
      speakText(data.data.spoken_brief);
      addTranscript('assistant', data.data.spoken_brief);
    }
  });

  // Ward Rounds Controls
  elements.prevRoundBtn.addEventListener('click', () => handleVoiceCommand('previous patient'));
  elements.nextRoundBtn.addEventListener('click', () => handleVoiceCommand('next patient'));
  elements.dictateNoteBtn.addEventListener('click', () => {
    if (state.roundsPatient) {
      elements.noteBedInput.value = state.roundsPatient.bed;
      elements.dictateModalSubtitle.textContent = `Drafting round note for ${state.roundsPatient.name}. Status will be DRAFT.`;
      elements.dictateNoteModal.style.display = 'flex';
    }
  });

  elements.cancelNoteBtn.addEventListener('click', () => {
    elements.dictateNoteModal.style.display = 'none';
  });

  elements.dictateNoteForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const bed = elements.noteBedInput.value;
    const obs = elements.noteObsInput.value.trim();
    const plan = elements.notePlanInput.value.trim();
    elements.dictateNoteModal.style.display = 'none';
    elements.noteObsInput.value = '';
    elements.notePlanInput.value = '';
    await handleVoiceCommand(`draft round note for ${bed} observations: ${obs} plan: ${plan}`);
  });

  // Handover Read-back & Approval
  elements.readBackHandoverBtn.addEventListener('click', () => {
    startHandoverReadBack();
  });

  elements.approveHandoverBtn.addEventListener('click', () => {
    if (!state.handoverDraft) return;
    triggerStepUpConfirmation(`Confirm and approve shift handover for ${state.handoverDraft.from_shift} to ${state.handoverDraft.to_shift}`, async () => {
      await handleVoiceCommand(`confirm and approve handover ${state.handoverDraft.id}`);
    });
  });

  // Audit Drawer Toggle
  elements.auditDrawerBtn.addEventListener('click', openAuditDrawer);
  elements.closeAuditDrawerBtn.addEventListener('click', closeAuditDrawer);

  document.querySelectorAll('.filter-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.filter-tab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      loadAuditLog(tab.dataset.filter);
    });
  });

  // Lock Now Button
  elements.lockNowBtn.addEventListener('click', lockSessionNow);
  elements.lockNowConfirmBtn.addEventListener('click', lockSessionNow);
  elements.stayActiveBtn.addEventListener('click', () => {
    elements.autoLockWarningModal.style.display = 'none';
    resetInactivityTimer();
  });

  // Switch Staff Button
  elements.switchStaffBtn.addEventListener('click', showLoginModal);

  // Keypad Handlers
  document.querySelectorAll('.key-btn[data-val]').forEach(btn => {
    btn.addEventListener('click', () => handlePinKey(btn.dataset.val, 'login'));
  });
  document.getElementById('keypadClear')?.addEventListener('click', () => {
    state.keypadPin = '';
    updatePinDots('login');
  });
  document.getElementById('keypadBackspace')?.addEventListener('click', () => {
    state.keypadPin = state.keypadPin.slice(0, -1);
    updatePinDots('login');
  });

  // Step-Up Keypad Handlers
  document.querySelectorAll('.step-key[data-val]').forEach(btn => {
    btn.addEventListener('click', () => handlePinKey(btn.dataset.val, 'stepup'));
  });
  document.getElementById('stepClear')?.addEventListener('click', () => {
    state.stepUpPin = '';
    updatePinDots('stepup');
  });
  document.getElementById('stepCancel')?.addEventListener('click', () => {
    elements.stepUpModal.style.display = 'none';
    state.pendingStepUpAction = null;
  });

  // Demo Runner Button
  elements.runDemoBtn.addEventListener('click', startDemoRunner);
  elements.stopDemoBtn.addEventListener('click', stopDemoRunner);

  // Task Filter
  elements.taskRoleFilter.addEventListener('change', () => refreshAllData());

  // Quick Action Buttons
  elements.addNewTaskBtn.addEventListener('click', () => {
    const desc = prompt('Enter task description:');
    if (desc) handleVoiceCommand(`add task for ward: ${desc}`);
  });

  elements.admitPatientBtn.addEventListener('click', () => {
    const name = prompt('Enter patient full name:');
    if (!name) return;
    const bed = prompt('Enter bed number (e.g. Bed 16):', 'Bed 16');
    if (!bed) return;
    const diag = prompt('Enter diagnosis exactly as stated by clinician:');
    if (!diag) return;

    triggerStepUpConfirmation(`Admit patient ${name} to ${bed}`, async () => {
      await handleVoiceCommand(`admit patient ${name} age 45 to ${bed} diagnosis: ${diag}`);
    });
  });

  elements.addPendingReportBtn.addEventListener('click', () => {
    const bed = prompt('Enter bed (e.g. Bed 4):', 'Bed 4');
    if (!bed) return;
    const desc = prompt('Enter report description (e.g. CBC report):', 'CBC report');
    if (desc) handleVoiceCommand(`bed ${bed} CBC report pending hai`);
  });

  elements.startNewDischargeBtn.addEventListener('click', () => {
    const bed = prompt('Enter bed for discharge (e.g. Bed 7):', 'Bed 7');
    if (bed) {
      triggerStepUpConfirmation(`Initiate discharge for ${bed}`, async () => {
        await handleVoiceCommand(`start discharge for ${bed}`);
      });
    }
  });
}

function switchTab(tabId) {
  state.activeTab = tabId;
  document.querySelectorAll('.tab-btn').forEach(b => {
    if (b.dataset.tab === tabId) b.classList.add('active');
    else b.classList.remove('active');
  });
  document.querySelectorAll('.tab-content').forEach(c => {
    if (c.id === tabId) c.classList.add('active');
    else c.classList.remove('active');
  });
}

function openAuditDrawer() {
  elements.auditDrawer.classList.add('open');
  loadAuditLog();
}

function closeAuditDrawer() {
  elements.auditDrawer.classList.remove('open');
}

function escapeHtml(str) {
  if (typeof str !== 'string') return String(str || '');
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// Start application
window.addEventListener('DOMContentLoaded', initApp);
