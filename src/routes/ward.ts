import express from 'express';
import { verifySessionToken } from '../auth.js';
import * as tools from '../mcp/tools.js';
import { loadWardData, seedWardData } from '../store.js';

const router = express.Router();

// Middleware: ensure authenticated for ward data access
router.use((req, res, next) => {
  const token = req.cookies?.wardos_token || req.headers.authorization?.replace(/^Bearer\s+/i, '');
  if (!token) {
    res.status(401).json({ error: 'Authentication required' });
    return;
  }
  const session = verifySessionToken(token);
  if (!session) {
    res.status(401).json({ error: 'Session expired' });
    return;
  }
  (req as any).user = session;
  next();
});

router.get('/board', (req, res) => {
  const result = tools.getWardBoard();
  res.json(result);
});

router.get('/tasks', (req, res) => {
  const role = req.query.role as any;
  const result = tools.getOpenTasks(role);
  const data = loadWardData();
  const completed = data.tasks.filter(t => t.completed);
  res.json({
    open: result.data,
    completed,
  });
});

router.get('/pending', (req, res) => {
  const result = tools.getPendingItems();
  const data = loadWardData();
  const received = data.pending_items.filter(p => p.status === 'received');
  res.json({
    pending: result.data,
    received,
  });
});

router.get('/discharges', (req, res) => {
  const result = tools.getDischargeStatus();
  res.json(result);
});

router.get('/handovers', (req, res) => {
  const data = loadWardData();
  res.json({ handovers: data.handovers });
});

router.get('/round-notes', (req, res) => {
  const data = loadWardData();
  res.json({ notes: data.round_notes });
});

router.get('/summary', (req, res) => {
  const result = tools.getShiftSummary();
  res.json(result);
});

router.get('/brief', (req, res) => {
  const result = tools.getMorningBrief();
  res.json(result);
});

router.get('/audit', (req, res) => {
  const limit = parseInt(req.query.limit as string || '50', 10);
  const filter = req.query.filter as 'admin' | 'security' | undefined;
  const result = tools.getAuditLog(limit, filter);
  res.json(result);
});

// Reset seed for demo fresh start
router.post('/reset-seed', (req, res) => {
  seedWardData();
  res.json({ success: true, message: 'Ward data successfully reset to clean synthetic demo seed' });
});

export default router;
