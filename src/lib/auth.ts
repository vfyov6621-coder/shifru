import argon2 from 'argon2';
import { SignJWT, jwtVerify } from 'jose';
import { createHash } from 'crypto';
import { db } from './db';
import {
  generateMasterKey, deriveKeyFromPassword, encryptChatKey,
  decryptChatKey, encryptPasswordThroughService, generateApiKey as genApiKey,
  hashApiKey, chainEncrypt, chainDecrypt, generateRandomChain
} from './crypto';

const JWT_SECRET = new TextEncoder().encode(
  process.env.JWT_SECRET || 'quantum-shield-v2-secret'
);

// ============================================================
// Password — encrypted through own service, then Argon2id
// ============================================================

export async function hashPassword(password: string): Promise<string> {
  // Step 1: Encrypt password through our chain service
  const serviceEncrypted = encryptPasswordThroughService(password);
  // Step 2: Hash the service-encrypted password with Argon2id
  return argon2.hash(serviceEncrypted, {
    type: argon2.argon2id,
    memoryCost: 65536,
    timeCost: 3,
    parallelism: 4,
    hashLength: 32,
    saltLength: 16,
  });
}

export async function verifyPassword(hashedPassword: string, plainPassword: string): Promise<boolean> {
  try {
    const serviceEncrypted = encryptPasswordThroughService(plainPassword);
    return await argon2.verify(hashedPassword, serviceEncrypted);
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
// API Key auth
// ============================================================

export async function getUserByApiKey(apiKey: string) {
  const keyHash = hashApiKey(apiKey);
  const record = await db.apiKey.findUnique({
    where: { keyHash },
    include: { user: true },
  });
  if (!record) return null;
  await db.apiKey.update({ where: { id: record.id }, data: { lastUsed: new Date() } });
  return record.user;
}

// ============================================================
// Server key (for API-encrypted chat keys)
// ============================================================

export function getServerKey(): Buffer {
  const hash = createHash('sha512').update(process.env.JWT_SECRET || 'quantum-shield-v2-secret').digest('hex');
  return Buffer.from(hash, 'hex').subarray(0, 32);
}

// ============================================================
// Chat key management
// ============================================================

export async function createChatForUser(
  userId: string,
  name: string,
  password: string
) {
  const user = await db.user.findUnique({ where: { id: userId } });
  if (!user) throw new Error('User not found');

  const userMasterKey = deriveKeyFromPassword(password, user.masterKeySalt);
  const { key: chatKey, salt: _ckSalt } = generateMasterKey();

  const encryptedKey = encryptChatKey(chatKey, userMasterKey);
  const serverKey = getServerKey();
  const apiEncryptedKey = encryptChatKey(chatKey, serverKey);

  const chat = await db.chat.create({
    data: {
      name,
      ownerId: userId,
      encryptedKey,
      apiEncryptedKey,
      members: { connect: { id: userId } },
    },
  });

  return chat;
}

export async function getChatKeyByPassword(chatId: string, userId: string, password: string): Promise<Buffer> {
  const chat = await db.chat.findFirst({ where: { id: chatId, ownerId: userId } });
  if (!chat) throw new Error('Chat not found');
  const user = await db.user.findUnique({ where: { id: userId } });
  if (!user) throw new Error('User not found');
  const userMasterKey = deriveKeyFromPassword(password, user.masterKeySalt);
  return decryptChatKey(chat.encryptedKey, userMasterKey);
}

export async function getChatKeyByApiKey(chatId: string, apiKey: string): Promise<Buffer> {
  const user = await getUserByApiKey(apiKey);
  if (!user) throw new Error('Invalid API key');
  const chat = await db.chat.findFirst({ where: { id: chatId, ownerId: user.id } });
  if (!chat) throw new Error('Chat not found');
  return decryptChatKey(chat.apiEncryptedKey, getServerKey());
}

// ============================================================
// Rate limiting
// ============================================================

export const DAILY_LIMIT = 90000;
export const MONTHLY_LIMIT = 200000;

export async function checkRateLimit(userId: string): Promise<{ allowed: boolean; dailyRemaining: number; monthlyRemaining: number }> {
  const now = new Date();
  const dayKey = now.toISOString().slice(0, 10);      // "2026-07-01"
  const monthKey = now.toISOString().slice(0, 7);      // "2026-07"

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