import { createClient } from '@libsql/client';
import { createHash, randomBytes, scrypt, createCipheriv } from 'crypto';
import { promisify } from 'util';

const scryptAsync = promisify(scrypt);

// EXACT copy from crypto.ts
const KEY_LENGTH = 32;
const IV_LENGTH = 16;
const AUTH_TAG_LENGTH = 16;

function getSystemKey(): Buffer {
  const hash = createHash('sha512')
    .update('shifru-system-password-encryption-key-v2')
    .digest('hex');
  return Buffer.from(hash, 'hex').subarray(0, KEY_LENGTH);
}

function encryptPasswordThroughService(password: string): string {
  const iv = createHash('sha256').update(password + 'qs-v2-derive-iv').digest().subarray(0, IV_LENGTH);
  const cipher = createCipheriv('aes-256-gcm', getSystemKey(), iv, { authTagLength: AUTH_TAG_LENGTH });
  const encrypted = Buffer.concat([cipher.update(password, 'utf-8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, encrypted]).toString('base64url');
}

async function hashPassword(password) {
  const serviceEncrypted = encryptPasswordThroughService(password);
  const salt = randomBytes(32);
  const derived = await scryptAsync(serviceEncrypted, salt, 64, { N: 2048, r: 1, p: 1 });
  return `$scrypt$2048$1$1$${salt.toString('base64url')}$${derived.toString('base64url')}`;
}

const client = createClient({
  url: 'libsql://shifru-vfyov6621-coder.aws-eu-west-1.turso.io',
  authToken: 'eyJhbGciOiJFZERTQSIsInR5cCI6IkpXVCJ9.eyJpYXQiOjE3ODI5MDAxMjAsImlkIjoiMDE5ZjFkMjAtNmIwMS03MDk3LTgxZDctYTdmNmJjMjgzOGM4Iiwia2lkIjoiM0pyb0x5QlBpRTE1Q3VuY3RtekZ5cW9HWHphejZlNm5RRUkxV2JRX01RUSIsInJpZCI6IjgxYmE3YTRhLWQyZDMtNGFiMC04YmRiLWMxODBhZGY1MTE5NyJ9.rElr_RnZXC5tihxF_u5hj9OaYBv3t6U5MCR8g46HXgiH2vhM3m2DJzqmxWI3XsJEh3g6Jb2x_d-6UWesdcOiBw'
});

const login = 'admin';
const password = 'ShifruAdmin2026!';
const hash = await hashPassword(password);
const masterKeySalt = randomBytes(32).toString('base64url');
const id = 'admin_fixed';
const now = new Date().toISOString();

await client.execute({
  sql: `INSERT OR REPLACE INTO "User" (id, login, "passwordHash", "masterKeySalt", "isVerified", "isAdmin", "createdAt", "updatedAt")
        VALUES (?, ?, ?, ?, 1, 1, ?, ?)`,
  args: [id, login, hash, masterKeySalt, now, now]
});

console.log('Admin recreated with correct encryption!');

// Verify
const r = await client.execute({ sql: 'SELECT login, "passwordHash" FROM "User" WHERE login = ?', args: [login] });
console.log('Hash starts with:', r.rows[0].passwordHash.substring(0, 30));