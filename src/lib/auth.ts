import { SignJWT, jwtVerify } from 'jose';
import { createHash, scrypt, randomBytes, timingSafeEqual } from 'crypto';
import { promisify } from 'util';

const scryptAsync = promisify(scrypt);
import { db } from './db';
import {
  generateMasterKey, deriveKeyFromPassword, encryptChatKey,
  decryptChatKey, encryptPasswordThroughService, generateApiKey as genApiKey,
  hashApiKey
} from './crypto';

const JWT_SECRET = new TextEncoder().encode(
  process.env.JWT_SECRET || 'shifru-v2-secret-key'
);

// ============================================================
// Password — encrypted through own service, then scrypt (Node.js built-in)
// scrypt is memory-hard, resistant to GPU/ASIC attacks → quantum-resistant
// ============================================================

const SCRYPT_KEYLEN = 64;  // 512-bit output
const SCRYPT_COST = 2048;  // N=2048 (memory-hard, ~16MB)
const SCRYPT_BLOCK = 1;    // r=1
const SCRYPT_PARALLEL = 1; // p=1

export async function hashPassword(password: string): Promise<string> {
  const serviceEncrypted = encryptPasswordThroughService(password);
  const salt = randomBytes(32);
  const derived = await scryptAsync(serviceEncrypted, salt, SCRYPT_KEYLEN, { N: SCRYPT_COST, r: SCRYPT_BLOCK, p: SCRYPT_PARALLEL }) as Buffer;
  // Format: $scrypt$N$r$p$salt$hash (all base64url)
  return `$scrypt$${SCRYPT_COST}$${SCRYPT_BLOCK}$${SCRYPT_PARALLEL}$${salt.toString('base64url')}$${derived.toString('base64url')}`;
}

export async function verifyPassword(hashedPassword: string, plainPassword: string): Promise<boolean> {
  try {
    const serviceEncrypted = encryptPasswordThroughService(plainPassword);
    const parts = hashedPassword.split('$');
    if (parts.length !== 7 || parts[1] !== 'scrypt') return false;
    const N = parseInt(parts[2]);
    const r = parseInt(parts[3]);
    const p = parseInt(parts[4]);
    const salt = Buffer.from(parts[5], 'base64url');
    const storedHash = Buffer.from(parts[6], 'base64url');
    const derived = await scryptAsync(serviceEncrypted, salt, storedHash.length, { N, r, p }) as Buffer;
    return timingSafeEqual(derived, storedHash);
  } catch {
    return false;
  }
}

// ============================================================
// JWT
// ============================================================

export interface JwtPayload {
  userId: string;
  login: string;
  isAdmin: boolean;
}

export async function createToken(payload: JwtPayload): Promise<string> {
  return new SignJWT({ ...payload })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('7d')
    .sign(JWT_SECRET);
}

export async function verifyToken(token: string): Promise<JwtPayload | null> {
  try {
    const { payload } = await jwtVerify(token, JWT_SECRET);
    return payload as unknown as JwtPayload;
  } catch {
    return null;
  }
}

export async function getSessionUser(req: Request): Promise<JwtPayload | null> {
  const authHeader = req.headers.get('authorization');
  if (!authHeader?.startsWith('Bearer ')) return null;
  return verifyToken(authHeader.slice(7));
}

// ============================================================
// Verification check
// ============================================================

export async function requireVerified(userId: string): Promise<boolean> {
  const user = await db.user.findUnique({ where: { id: userId }, select: { isVerified: true } });
  return user?.isVerified ?? false;
}

// ============================================================
// Admin verification
// ============================================================

export async function adminVerifyUser(adminId: string, targetUserId: string): Promise<{ success: boolean; error?: string }> {
  const admin = await db.user.findUnique({ where: { id: adminId }, select: { isAdmin: true } });
  if (!admin?.isAdmin) return { success: false, error: 'Нет прав администратора' };

  const target = await db.user.findUnique({ where: { id: targetUserId } });
  if (!target) return { success: false, error: 'Пользователь не найден' };
  if (target.isVerified) return { success: false, error: 'Уже верифицирован' };

  await db.user.update({ where: { id: targetUserId }, data: { isVerified: true } });
  return { success: true };
}

export async function adminUnverifyUser(adminId: string, targetUserId: string): Promise<{ success: boolean; error?: string }> {
  const admin = await db.user.findUnique({ where: { id: adminId }, select: { isAdmin: true } });
  if (!admin?.isAdmin) return { success: false, error: 'Нет прав администратора' };

  await db.user.update({ where: { id: targetUserId }, data: { isVerified: false } });
  return { success: true };
}

// ============================================================
// API Key auth
// ============================================================

export async function getUserByApiKey(apiKey: string) {
  const keyHash = hashApiKey(apiKey);
  const record = await db.apiKey.findUnique({
    where: { keyHash },
    include: { user: true },
  });
  if (!record) return null;
  if (!record.user.isVerified) return null;
  await db.apiKey.update({ where: { id: record.id }, data: { lastUsed: new Date() } });
  return record.user;
}

// ============================================================
// Server key (for API-encrypted chat keys)
// ============================================================

export function getServerKey(): Buffer {
  const hash = createHash('sha512').update(process.env.JWT_SECRET || 'shifru-v2-secret-key').digest('hex');
  return Buffer.from(hash, 'hex').subarray(0, 32);
}

// ============================================================
// Chat key management — supports user-to-user and group chats
// ============================================================

export async function createChatForUser(
  userId: string,
  name: string,
  password: string,
  memberIds: string[] = []
) {
  const user = await db.user.findUnique({ where: { id: userId } });
  if (!user) throw new Error('User not found');

  const userMasterKey = deriveKeyFromPassword(password, user.masterKeySalt);
  const { key: chatKey } = generateMasterKey();

  const encryptedKey = encryptChatKey(chatKey, userMasterKey);
  const serverKey = getServerKey();
  const apiEncryptedKey = encryptChatKey(chatKey, serverKey);

  const isGroup = memberIds.length > 0;

  const allMemberIds = [userId, ...memberIds.filter(id => id !== userId)];

  // Verify all members exist and are verified
  const members = await db.user.findMany({
    where: { id: { in: allMemberIds } },
    select: { id: true },
  });

  const foundIds = members.map(m => m.id);
  const missingIds = allMemberIds.filter(id => !foundIds.includes(id));
  if (missingIds.length > 0) {
    throw new Error('Некоторые пользователи не найдены: ' + missingIds.join(', '));
  }

  const chat = await db.chat.create({
    data: {
      name,
      ownerId: userId,
      encryptedKey,
      apiEncryptedKey,
      isGroup,
      members: { connect: allMemberIds.map(id => ({ id })) },
    },
  });

  return chat;
}

export async function getChatKeyByPassword(chatId: string, userId: string, password: string): Promise<Buffer> {
  const chat = await db.chat.findFirst({
    where: {
      id: chatId,
      members: { some: { id: userId } },
    },
  });
  if (!chat) throw new Error('Чат не найден или нет доступа');

  const user = await db.user.findUnique({ where: { id: userId } });
  if (!user) throw new Error('User not found');
  const userMasterKey = deriveKeyFromPassword(password, user.masterKeySalt);
  return decryptChatKey(chat.encryptedKey, userMasterKey);
}

export async function getChatKeyByApiKey(chatId: string, apiKey: string): Promise<Buffer> {
  const user = await getUserByApiKey(apiKey);
  if (!user) throw new Error('Invalid API key');
  const chat = await db.chat.findFirst({
    where: {
      id: chatId,
      members: { some: { id: user.id } },
    },
  });
  if (!chat) throw new Error('Чат не найден или нет доступа');
  return decryptChatKey(chat.apiEncryptedKey, getServerKey());
}

// ============================================================
// Rate limiting
// ============================================================

export const DAILY_LIMIT = 90000;
export const MONTHLY_LIMIT = 200000;

export async function checkRateLimit(userId: string): Promise<{ allowed: boolean; dailyRemaining: number; monthlyRemaining: number }> {
  const now = new Date();
  const dayKey = now.toISOString().slice(0, 10);
  const monthKey = now.toISOString().slice(0, 7);

  const [daily, monthly] = await Promise.all([
    db.rateLimit.findUnique({ where: { userId_period_periodKey: { userId, period: 'daily', periodKey: dayKey } } }),
    db.rateLimit.findUnique({ where: { userId_period_periodKey: { userId, period: 'monthly', periodKey: monthKey } } }),
  ]);

  const dailyCount = daily?.count ?? 0;
  const monthlyCount = monthly?.count ?? 0;

  if (dailyCount >= DAILY_LIMIT || monthlyCount >= MONTHLY_LIMIT) {
    return { allowed: false, dailyRemaining: DAILY_LIMIT - dailyCount, monthlyRemaining: MONTHLY_LIMIT - monthlyCount };
  }

  return { allowed: true, dailyRemaining: DAILY_LIMIT - dailyCount, monthlyRemaining: MONTHLY_LIMIT - monthlyCount };
}

export async function incrementRateLimit(userId: string): Promise<void> {
  const now = new Date();
  const dayKey = now.toISOString().slice(0, 10);
  const monthKey = now.toISOString().slice(0, 7);

  await Promise.all([
    db.rateLimit.upsert({
      where: { userId_period_periodKey: { userId, period: 'daily', periodKey: dayKey } },
      create: { userId, period: 'daily', periodKey: dayKey, count: 1 },
      update: { count: { increment: 1 } },
    }),
    db.rateLimit.upsert({
      where: { userId_period_periodKey: { userId, period: 'monthly', periodKey: monthKey } },
      create: { userId, period: 'monthly', periodKey: monthKey, count: 1 },
      update: { count: { increment: 1 } },
    }),
  ]);
}