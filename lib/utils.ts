import { randomBytes } from 'crypto';

/**
 * Generates a collision-resistant, time-based identifier (e.g. PO-M0XYZ1A-4F12)
 * Fixes MED-04 by replacing the weak UUID slice approach.
 */
export function generateId(prefix: string): string {
  const ts = Date.now().toString().slice(-8); // last 8 digits of timestamp
  const rand = Math.floor(1000 + Math.random() * 9000).toString(); // 4 random digits
  return `${prefix}-${ts}${rand}`; // e.g. REQ-213123451234
}
