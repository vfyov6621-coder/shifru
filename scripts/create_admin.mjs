import { PrismaClient } from '@prisma/client';
import { createHash, randomBytes, scrypt } from 'crypto';
import { promisify } from 'util';

const scryptAsync = promisify(scrypt);
const prisma = new PrismaClient();

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
  const login = 'admin';
  const password = 'ShifruAdmin2026!';

  // Check if admin already exists
  const existing = await prisma.user.findUnique({ where: { login } });
  if (existing) {
    // Update to admin with new password
    const hash = await hashPassword(password);
    const masterKeySalt = randomBytes(32).toString('base64url');
    await prisma.user.update({
      where: { login },
      data: {
        passwordHash: hash,
        masterKeySalt,
        isAdmin: true,
        isVerified: true,
      }
    });
    console.log('Admin account updated:', login);
  } else {
    const hash = await hashPassword(password);
    const masterKeySalt = randomBytes(32).toString('base64url');
    await prisma.user.create({
      data: {
        login,
        passwordHash: hash,
        masterKeySalt,
        isAdmin: true,
        isVerified: true,
      }
    });
    console.log('Admin account created:', login);
  }

  console.log('\n=== Админ аккаунт ===');
  console.log('Логин:', login);
  console.log('Пароль:', password);
  console.log('======================');
}

main().catch(console.error).finally(() => prisma.$disconnect());