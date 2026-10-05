import crypto from 'node:crypto';
export const loginAttempts=new Map();
export function clearLoginAttempts(email){loginAttempts.delete(crypto.createHash('sha256').update(String(email||'').trim().toLowerCase()).digest('hex'));}
