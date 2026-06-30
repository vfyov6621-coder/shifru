import argon2 from 'argon2';
import { SignJWT, jwtVerify } from 'jose';
import { createHash } from 'crypto';
import { db } from './db';
import { generateMasterKey, deriveChannelKey, encryptChannelKey, decryptChannelKey, generateVerificationToken } from './crypto';

const JWT_SECRET = new TextEncoder().encode(
  process.env.JWT_SECRET || 'quantum-shield-dev-secret-change-in-production'
);

// ============================================================
// Password Hashing — Argon2id (quantum-resistant, memory-hard)
// ============================================================

export async function hashPassword(password: string): Promise<string> {
  return argon2.hash(password, {
    type: argon2.argon2id,
    memoryCost: 65536,   // 64 MB
    timeCost: 3,          // 3 iterations
    parallelism: 4,       // 4 threads
    hashLength: 32,       // 256-bit output
    saltLength: 16,       // 128-bit salt
  });
}

export async function verifyPassword(hashedPassword: string, plainPassword: string): Promise<boolean> {
  try {
    return await argon2.verify(hashedPassword, plainPassword);
  } catch {
    return false;
  }
}

// ============================================================
// JWT — stateless session tokens
// ============================================================

export interface JwtPayload {
  userId: string;
  email: string;
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

// ============================================================
// Session helpers — extract user from request
// ============================================================

export async function getSessionUser(req: Request): Promise<JwtPayload | null> {
  const authHeader = req.headers.get('authorization');
  if (!authHeader?.startsWith('Bearer ')) return null;
  const token = authHeader.slice(7);
  return verifyToken(token);
}

// ============================================================
// API Key authentication
// ============================================================

export async function getUserByApiKey(apiKey: string) {
  // API key format: qs_XXXXXXXX_...
  const { hashApiKey } = await import('./crypto');
  const keyHash = hashApiKey(apiKey);

  const apiKeyRecord = await db.apiKey.findUnique({
    where: { keyHash },
    include: { user: true },
  });

  if (!apiKeyRecord) return null;

  // Update last used
  await db.apiKey.update({
    where: { id: apiKeyRecord.id },
    data: { lastUsed: new Date() },
  });

  return apiKeyRecord.user;
}

// ============================================================
// Channel key management
// ============================================================

export async function createUserMasterKey(password: string, salt: string): Promise<Buffer> {
  const { deriveKeyFromPassword } = await import('./crypto');
  return deriveKeyFromPassword(password, salt);
}

export function getServerKey(): Buffer {
  const hash = createHash('sha512').update(process.env.JWT_SECRET || 'quantum-shield-dev-secret-change-in-production').digest('hex');
  return Buffer.from(hash, 'hex').subarray(0, 32);
}

export async function createChannelForUser(
  userId: string,
  name: string,
  description: string | null,
  password: string,
  rounds?: number
) {
  const user = await db.user.findUnique({ where: { id: userId } });
  if (!user) throw new Error('User not found');

  // Derive user master key from password + stored salt
  const { deriveKeyFromPassword } = await import('./crypto');
  const userMasterKey = deriveKeyFromPassword(password, user.masterKeySalt);

  // Generate a unique channel key
  const { key: channelKey, salt: _ckSalt } = generateMasterKey();

  // Encrypt the channel key with the user's master key (for web UI)
  const encryptedKey = encryptChannelKey(channelKey, userMasterKey);
  // Encrypt the channel key with server key (for API access via API keys)
  const serverKey = getServerKey();
  const apiEncryptedKey = encryptChannelKey(channelKey, serverKey);

  const channel = await db.channel.create({
    data: {
      name,
      description,
      adminId: userId,
      encryptedKey,
      apiEncryptedKey,
      rounds: rounds ?? 4,
    },
  });

  return channel;
}

export async function getChannelDecryptionKey(
  channelId: string,
  userId: string,
  password: string
): Promise<Buffer> {
  const channel = await db.channel.findFirst({
    where: { id: channelId, adminId: userId },
  });
  if (!channel) throw new Error('Channel not found');

  const user = await db.user.findUnique({ where: { id: userId } });
  if (!user) throw new Error('User not found');

  const { deriveKeyFromPassword } = await import('./crypto');
  const userMasterKey = deriveKeyFromPassword(password, user.masterKeySalt);
  return decryptChannelKey(channel.encryptedKey, userMasterKey);
}

export async function getChannelDecryptionKeyByApiKey(
  channelId: string,
  apiKey: string
): Promise<Buffer> {
  const user = await getUserByApiKey(apiKey);
  if (!user) throw new Error('Invalid API key');

  const channel = await db.channel.findFirst({
    where: { id: channelId, adminId: user.id },
  });
  if (!channel) throw new Error('Channel not found');

  const { decryptChannelKey } = await import('./crypto');
  const serverKey = getServerKey();
  return decryptChannelKey(channel.apiEncryptedKey, serverKey);
}

// ============================================================
// Verification tokens
// ============================================================

export async function createVerificationToken(userId: string): Promise<string> {
  const token = generateVerificationToken();
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours

  await db.verificationToken.create({
    data: {
      token,
      userId,
      expiresAt,
    },
  });

  return token;
}

export async function verifyEmailToken(token: string): Promise<boolean> {
  const record = await db.verificationToken.findUnique({
    where: { token },
  });

  if (!record) return false;
  if (record.used) return false;
  if (record.expiresAt < new Date()) return false;

  await db.verificationToken.update({
    where: { id: record.id },
    data: { used: true },
  });

  await db.user.update({
    where: { id: record.userId },
    data: { isVerified: true },
  });

  return true;
}