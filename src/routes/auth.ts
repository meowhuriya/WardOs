import express from 'express';
import rateLimit from 'express-rate-limit';
import {
  authenticateStaff,
  loadStaff,
  stepUpAuthenticate,
  verifySessionToken,
} from '../auth.js';
import { logAudit } from '../store.js';

const router = express.Router();

// Track locked sessions in memory
const lockedSessions = new Set<string>();

export function isSessionLocked(staffId: string): boolean {
  return lockedSessions.has(staffId);
}

export function lockSession(staffId: string): void {
  lockedSessions.add(staffId);
}

export function unlockSession(staffId: string): void {
  lockedSessions.delete(staffId);
}

// Rate limit login attempts: 20 per 15 minutes per IP
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  message: { error: 'Too many login attempts from this IP, please try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
});

// GET /api/auth/staff-list (Public list of staff for demo login selection)
router.get('/staff-list', (req, res) => {
  const staff = loadStaff();
  const publicList = staff.map(s => ({
    id: s.id,
    name: s.name,
    role: s.role,
    isLocked: s.locked_until ? s.locked_until > Date.now() : false,
  }));
  res.json({ staff: publicList });
});

// POST /api/auth/login
router.post('/login', loginLimiter, (req, res) => {
  const { staff_id, pin } = req.body;
  if (!staff_id || !pin) {
    res.status(400).json({ error: 'staff_id and pin are required' });
    return;
  }

  const result = authenticateStaff(staff_id, pin);
  if (!result.success) {
    logAudit(
      'login_failed',
      'security',
      { staff_id, error: result.error, locked: result.locked },
      'system'
    );
    res.status(result.locked ? 423 : 401).json({ error: result.error, locked: result.locked });
    return;
  }

  // Clear session lock if any
  unlockSession(staff_id);

  // Set httpOnly cookie
  res.cookie('wardos_token', result.token, {
    httpOnly: true,
    sameSite: 'strict',
    secure: process.env.NODE_ENV === 'production',
    maxAge: 15 * 60 * 1000, // 15 mins
  });

  logAudit(
    'login_success',
    'security',
    { staff_id, role: result.user?.role },
    result.user?.role
  );

  res.json({
    success: true,
    token: result.token,
    user: result.user,
  });
});

// POST /api/auth/step-up
router.post('/step-up', (req, res) => {
  const token = req.cookies?.wardos_token || req.headers.authorization?.replace(/^Bearer\s+/i, '');
  if (!token) {
    res.status(401).json({ error: 'Authentication token required' });
    return;
  }

  const session = verifySessionToken(token);
  if (!session) {
    res.status(401).json({ error: 'Invalid or expired session token' });
    return;
  }

  const { pin } = req.body;
  if (!pin) {
    res.status(400).json({ error: 'PIN required for step-up verification' });
    return;
  }

  const result = stepUpAuthenticate(session.staff_id, pin);
  if (!result.success) {
    logAudit(
      'step_up_failed',
      'security',
      { staff_id: session.staff_id, error: result.error },
      session.role
    );
    res.status(401).json({ error: result.error });
    return;
  }

  // Refresh cookie with updated step-up timestamp
  if (result.token) {
    res.cookie('wardos_token', result.token, {
      httpOnly: true,
      sameSite: 'strict',
      secure: process.env.NODE_ENV === 'production',
      maxAge: 15 * 60 * 1000,
    });
  }

  logAudit(
    'step_up_success',
    'security',
    { staff_id: session.staff_id, action: 'pin_verified_within_60s' },
    session.role
  );

  res.json({
    success: true,
    token: result.token,
    lastStepUpAt: result.lastStepUpAt,
  });
});

// POST /api/auth/lock
router.post('/lock', (req, res) => {
  const token = req.cookies?.wardos_token || req.headers.authorization?.replace(/^Bearer\s+/i, '');
  if (token) {
    const session = verifySessionToken(token);
    if (session) {
      lockSession(session.staff_id);
      logAudit('session_locked', 'security', { staff_id: session.staff_id }, session.role);
    }
  }
  res.json({ success: true, message: 'Session locked' });
});

// POST /api/auth/unlock
router.post('/unlock', (req, res) => {
  const token = req.cookies?.wardos_token || req.headers.authorization?.replace(/^Bearer\s+/i, '');
  if (!token) {
    res.status(401).json({ error: 'Authentication token required' });
    return;
  }

  const session = verifySessionToken(token);
  if (!session) {
    res.status(401).json({ error: 'Invalid or expired session' });
    return;
  }

  const { pin } = req.body;
  if (!pin) {
    res.status(400).json({ error: 'PIN required to unlock' });
    return;
  }

  const result = stepUpAuthenticate(session.staff_id, pin);
  if (!result.success) {
    logAudit('unlock_failed', 'security', { staff_id: session.staff_id }, session.role);
    res.status(401).json({ error: 'Incorrect PIN to unlock' });
    return;
  }

  unlockSession(session.staff_id);
  logAudit('session_unlocked', 'security', { staff_id: session.staff_id }, session.role);

  res.json({ success: true, message: 'Session unlocked', token: result.token });
});

// GET /api/auth/me
router.get('/me', (req, res) => {
  const token = req.cookies?.wardos_token || req.headers.authorization?.replace(/^Bearer\s+/i, '');
  if (!token) {
    res.status(401).json({ authenticated: false });
    return;
  }

  const session = verifySessionToken(token);
  if (!session) {
    res.status(401).json({ authenticated: false, error: 'Session expired' });
    return;
  }

  const isLocked = isSessionLocked(session.staff_id);

  res.json({
    authenticated: true,
    user: {
      id: session.staff_id,
      name: session.name,
      role: session.role,
      lastStepUpAt: session.lastStepUpAt,
      isLocked,
    },
  });
});

// POST /api/auth/logout
router.post('/logout', (req, res) => {
  const token = req.cookies?.wardos_token || req.headers.authorization?.replace(/^Bearer\s+/i, '');
  if (token) {
    const session = verifySessionToken(token);
    if (session) {
      unlockSession(session.staff_id);
      logAudit('logout', 'security', { staff_id: session.staff_id }, session.role);
    }
  }
  res.clearCookie('wardos_token');
  res.json({ success: true, message: 'Logged out successfully' });
});

export default router;
