import { createClient } from '@libsql/client';
import { createHash, randomBytes, scrypt } from 'crypto';
import { promisify } from 'util';

const scryptAsync = promisify(scrypt);

const SERVICE_KEY = 'shifru-system-password-encryption-key-v2';

function encryptPasswordThroughService(password) {
  const key = createHash('sha256').update(SERVICE_KEY).digest();
  const iv = randomBytes(16);
  const cipher = createCipheriv('aes-256-cbc', key, iv);
  let enc = cipher.update(password, 'utf8');
  enc = Buffer.concat([enc, cipher.final()]);
  return iv.toString('base64url') + ':' + enc.toString('base64url');
}

import { createCipheriv } from 'crypto';

async function hashPassword(password) {
  const serviceEncrypted = encryptPasswordThroughService(password);
  const salt = randomBytes(32);
  const derived = await scryptAsync(serviceEncrypted, salt, 64, { N: 2048, r: 1, p: 1 });
  return `$scrypt$2048$1$1$${salt.toString('base64url')}$${derived.toString('base64url')}`;
}

async function main() {
  const client = createClient({
    url: 'libsql://shifru-vfyov6621-coder.aws-eu-west-1.turso.io',
    authToken: 'eyJhbGciOiJFZERTQSIsInR5cCI6IkpXVCJ9.eyJpYXQiOjE3ODI5MDAxMjAsImlkIjoiMDE5ZjFkMjAtNmIwMS03MDk3LTgxZDctYTdmNmJjMjgzOGM4Iiwia2lkIjoiM0pyb0x5QlBpRTE1Q3VuY3RtekZ5cW9HWHphejZlNm5RRUkxV2JRX01RUSIsInJpZCI6IjgxYmE3YTRhLWQyZDMtNGFiMC04YmRiLWMxODBhZGY1MTE5NyJ9.rElr_RnZXC5tihxF_u5hj9OaYBv3t6U5MCR8g46HXgiH2vhM3m2DJzqmxWI3XsJEh3g6Jb2x_d-6UWesdcOiBw'
  });

  const login = 'admin';
  const password = 'ShifruAdmin2026!';
  const hash = await hashPassword(password);
  const masterKeySalt = randomBytes(32).toString('base64url');
  const id = 'admin_' + randomBytes(8).toString('hex');
  const now = new Date().toISOString();

  await client.execute({
    sql: `INSERT OR REPLACE INTO "User" (id, login, "passwordHash", "masterKeySalt", "isVerified", "isAdmin", "createdAt", "updatedAt")
          VALUES (?, ?, ?, ?, 1, 1, ?, ?)`,
    args: [id, login, hash, masterKeySalt, now, now]
  });

  const result = await client.execute({ sql: 'SELECT id, login, "isAdmin", "isVerified" FROM "User" WHERE login = ?', args: [login] });
  console.log('Admin created in Turso:', result.rows);
}

main().catch(console.error);