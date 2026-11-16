import crypto from 'crypto';
import { SignJWT, createRemoteJWKSet, jwtVerify } from 'jose';
import fs from 'fs';
import path from 'path';
import type { UserRole } from '../models/domain.js';

const FIREBASE_JWKS = createRemoteJWKSet(
  new URL('https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com')
);

let cachedSecret: Uint8Array | null = null;

function getSessionSecret(): Uint8Array {
  if (cachedSecret) return cachedSecret;
  const envSecret = process.env.SESSION_SECRET;
  if (envSecret && envSecret !== 'CHANGE_ME_WITH_STRONG_RANDOM_SECRET' && envSecret.length >= 32) {
    cachedSecret = new TextEncoder().encode(envSecret);
    return cachedSecret;
  }
  // Ephemeral process secret if not configured in env (persisted locally in dev only, gitignored)
  const devSecret = crypto.randomBytes(48).toString('hex');
  cachedSecret = new TextEncoder().encode(devSecret);
  return cachedSecret;
}

export function hashPassword(plainPassword: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const derived = crypto.scryptSync(plainPassword, salt, 64).toString('hex');
  return `scrypt$${salt}$${derived}`;
}

export function verifyPassword(plainPassword: string, storedHash: string): boolean {
  if (!storedHash || !storedHash.startsWith('scrypt$')) return false;
  const parts = storedHash.split('$');
  if (parts.length !== 3) return false;
  const [, salt, originalHex] = parts;
  const derivedBuffer = crypto.scryptSync(plainPassword, salt, 64);
  const originalBuffer = Buffer.from(originalHex, 'hex');
  if (derivedBuffer.length !== originalBuffer.length) return false;
  return crypto.timingSafeEqual(derivedBuffer, originalBuffer);
}

export function generateTemporaryPassword(): string {
  const upper = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  const lower = 'abcdefghijkmnpqrstuvwxyz';
  const digits = '23456789';
  const symbols = '!@#$%';
  const all = upper + lower + digits + symbols;

  const pick = (charset: string) => charset[crypto.randomInt(0, charset.length)];
  const chars = [
    pick(upper),
    pick(upper),
    pick(lower),
    pick(lower),
    pick(digits),
    pick(digits),
    pick(symbols),
    ...Array.from({ length: 5 }, () => pick(all)),
  ];

  // Fisher-Yates shuffle
  for (let i = chars.length - 1; i > 0; i--) {
    const j = crypto.randomInt(0, i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  return chars.join('');
}

export interface SessionTokenPayload {
  sub: string; // agent_id
  role: UserRole;
  tv: number; // token_version
  did: string; // device_id
}

export async function signSessionToken(payload: SessionTokenPayload): Promise<string> {
  return new SignJWT({
    role: payload.role,
    tv: payload.tv,
    did: payload.did,
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(payload.sub)
    .setIssuedAt()
    .setExpirationTime('12h')
    .setIssuer('sonelgaz-sidi-ali-backend')
    .sign(getSessionSecret());
}

export async function verifySessionToken(token: string): Promise<SessionTokenPayload | null> {
  try {
    const { payload } = await jwtVerify(token, getSessionSecret(), {
      issuer: 'sonelgaz-sidi-ali-backend',
    });
    if (!payload.sub || !payload.role || typeof payload.tv !== 'number') {
      return null;
    }
    return {
      sub: payload.sub,
      role: payload.role as UserRole,
      tv: payload.tv,
      did: typeof payload.did === 'string' ? payload.did : 'web-default',
    };
  } catch {
    return null;
  }
}

function getFirebaseProjectId(): string | null {
  if (process.env.FIREBASE_PROJECT_ID) return process.env.FIREBASE_PROJECT_ID;
  try {
    const configPath = path.resolve(process.cwd(), 'firebase-applet-config.json');
    if (fs.existsSync(configPath)) {
      const parsed = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
      return parsed.projectId || null;
    }
  } catch {
    // ignore
  }
  return null;
}

export interface VerifiedFirebaseUser {
  uid: string;
  email: string;
  emailVerified: boolean;
  name?: string;
}

export async function verifyFirebaseIdToken(idToken: string): Promise<VerifiedFirebaseUser | null> {
  const projectId = getFirebaseProjectId();
  if (!projectId) return null;

  try {
    const { payload } = await jwtVerify(idToken, FIREBASE_JWKS, {
      issuer: `https://securetoken.google.com/${projectId}`,
      audience: projectId,
    });

    const uid = typeof payload.sub === 'string' ? payload.sub : '';
    const email = typeof payload.email === 'string' ? payload.email.toLowerCase() : '';
    const emailVerified = payload.email_verified === true;
    const name = typeof payload.name === 'string' ? payload.name : undefined;

    if (!uid || !email) return null;
    return { uid, email, emailVerified, name };
  } catch {
    return null;
  }
}
