import crypto from 'node:crypto';
import fs from 'node:fs';
import jwt from 'jsonwebtoken';
import { config } from './config.js';
import { Role, Staff, UserSession } from './types.js';

const LOCKOUT_THRESHOLD = 5;
const LOCKOUT_DURATION_MS = 5 * 60 * 1000; // 5 minutes

export function hashPin(pin: string, salt: string): string {
  return crypto.scryptSync(pin, salt, 64).toString('hex');
}

export function generateSalt(): string {
  return crypto.randomBytes(16).toString('hex');
}

export function loadStaff(): Staff[] {
  if (!fs.existsSync(config.paths.staffDataFile)) {
    seedStaffFile();
  }
  try {
    const raw = fs.readFileSync(config.paths.staffDataFile, 'utf-8');
    return JSON.parse(raw);
  } catch (err) {
    seedStaffFile();
    const raw = fs.readFileSync(config.paths.staffDataFile, 'utf-8');
    return JSON.parse(raw);
  }
}

export function saveStaff(staffList: Staff[]): void {
  fs.writeFileSync(config.paths.staffDataFile, JSON.stringify(staffList, null, 2), 'utf-8');
}

export function seedStaffFile(): void {
  // Demo PINs:
  // doc-1 (Dr. Aarav Sharma): 1122
  // doc-2 (Dr. Priya Patel): 3344
  // nurse-1 (Nurse Ananya Rao): 5566
  // nurse-2 (Nurse Rajesh Kumar): 7788
  const defaultStaffConfig = [
    { id: 'doc-1', name: 'Dr. Aarav Sharma', role: 'doctor' as Role, pin: '1122' },
    { id: 'doc-2', name: 'Dr. Priya Patel', role: 'doctor' as Role, pin: '3344' },
    { id: 'nurse-1', name: 'Nurse Ananya Rao', role: 'nurse' as Role, pin: '5566' },
    { id: 'nurse-2', name: 'Nurse Rajesh Kumar', role: 'nurse' as Role, pin: '7788' },
  ];

  const staffList: Staff[] = defaultStaffConfig.map(s => {
    const salt = generateSalt();
    const pin_hash = hashPin(s.pin, salt);
    return {
      id: s.id,
      name: s.name,
      role: s.role,
      pin_hash,
      salt,
      failed_attempts: 0,
      locked_until: null,
    };
  });

  if (!fs.existsSync(config.paths.dataDir)) {
    fs.mkdirSync(config.paths.dataDir, { recursive: true });
  }
  saveStaff(staffList);
}

export function authenticateStaff(staffId: string, pin: string): { success: boolean; token?: string; user?: { id: string; name: string; role: Role }; error?: string; locked?: boolean } {
  const staffList = loadStaff();
  const staff = staffList.find(s => s.id === staffId);

  if (!staff) {
    return { success: false, error: 'Staff account not found' };
  }

  const now = Date.now();
  if (staff.locked_until && staff.locked_until > now) {
    const remainingSeconds = Math.ceil((staff.locked_until - now) / 1000);
    return {
      success: false,
      error: `Account locked due to multiple failed PIN attempts. Try again in ${remainingSeconds} seconds.`,
      locked: true,
    };
  }

  // Clear lock if expired
  if (staff.locked_until && staff.locked_until <= now) {
    staff.locked_until = null;
    staff.failed_attempts = 0;
  }

  const computedHash = hashPin(pin, staff.salt);
  const isValid = crypto.timingSafeEqual(
    Buffer.from(computedHash, 'hex'),
    Buffer.from(staff.pin_hash, 'hex')
  );

  if (!isValid) {
    staff.failed_attempts += 1;
    if (staff.failed_attempts >= LOCKOUT_THRESHOLD) {
      staff.locked_until = now + LOCKOUT_DURATION_MS;
      saveStaff(staffList);
      return {
        success: false,
        error: 'Account locked for 5 minutes due to 5 consecutive incorrect PIN entries.',
        locked: true,
      };
    }
    saveStaff(staffList);
    return {
      success: false,
      error: `Incorrect PIN. ${LOCKOUT_THRESHOLD - staff.failed_attempts} attempts remaining before account lockout.`,
    };
  }

  // Reset failed attempts on success
  staff.failed_attempts = 0;
  staff.locked_until = null;
  saveStaff(staffList);

  const sessionPayload: UserSession = {
    staff_id: staff.id,
    name: staff.name,
    role: staff.role,
    lastStepUpAt: Date.now(), // Fresh login grants step-up for 60s
  };

  const token = jwt.sign(sessionPayload, config.sessionSecret, { expiresIn: '15m' });

  return {
    success: true,
    token,
    user: {
      id: staff.id,
      name: staff.name,
      role: staff.role,
    },
  };
}

export function stepUpAuthenticate(staffId: string, pin: string): { success: boolean; lastStepUpAt?: number; token?: string; error?: string } {
  const staffList = loadStaff();
  const staff = staffList.find(s => s.id === staffId);

  if (!staff) {
    return { success: false, error: 'Staff account not found' };
  }

  const now = Date.now();
  if (staff.locked_until && staff.locked_until > now) {
    return { success: false, error: 'Account currently locked' };
  }

  const computedHash = hashPin(pin, staff.salt);
  const isValid = crypto.timingSafeEqual(
    Buffer.from(computedHash, 'hex'),
    Buffer.from(staff.pin_hash, 'hex')
  );

  if (!isValid) {
    staff.failed_attempts += 1;
    if (staff.failed_attempts >= LOCKOUT_THRESHOLD) {
      staff.locked_until = now + LOCKOUT_DURATION_MS;
    }
    saveStaff(staffList);
    return { success: false, error: 'Incorrect PIN' };
  }

  staff.failed_attempts = 0;
  saveStaff(staffList);

  const lastStepUpAt = Date.now();
  const sessionPayload: UserSession = {
    staff_id: staff.id,
    name: staff.name,
    role: staff.role,
    lastStepUpAt,
  };
  const token = jwt.sign(sessionPayload, config.sessionSecret, { expiresIn: '15m' });

  return { success: true, lastStepUpAt, token };
}

export function verifySessionToken(token: string): UserSession | null {
  try {
    const decoded = jwt.verify(token, config.sessionSecret) as UserSession;
    return decoded;
  } catch {
    return null;
  }
}
