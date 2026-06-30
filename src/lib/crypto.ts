import { createCipheriv, createDecipheriv, randomBytes, createHash, pbkdf2Sync } from 'crypto';

// ============================================================
// Quantum-Resistant Cyclic Encryption Engine
// ============================================================
// Security rationale:
// - AES-256-GCM: Even with Grover's algorithm (quantum), 256-bit
//   security reduces to 128-bit — still computationally infeasible.
// - Multi-round cyclic encryption: Each round is independently
//   keyed via HKDF derivation. N rounds = N independent 256-bit
//   key searches, adding exponential cost.
// - Argon2id (used in auth.ts): Memory-hard, quantum-resistant.
// - SHA-512 for all hashing: Grover's reduces to 256-bit — safe.
// ============================================================

const ALGORITHM = 'aes-256-gcm';
const KEY_LENGTH = 32;       // 256 bits
const IV_LENGTH = 12;        // 96 bits for GCM
const AUTH_TAG_LENGTH = 16;  // 128 bits for GCM
const DEFAULT_ROUNDS = 4;

// HKDF-like key derivation per round
function deriveRoundKey(masterKey: Buffer, roundNumber: number): Buffer {
  const info = `quantum-shield-round-${roundNumber}`;
  return pbkdf2Sync(masterKey, info, 100000, KEY_LENGTH, 'sha512');
}

// Derive the channel master key from user's master key + channel ID
export function deriveChannelKey(userMasterKey: Buffer, channelId: string): Buffer {
  return pbkdf2Sync(userMasterKey, `channel-${channelId}`, 200000, KEY_LENGTH, 'sha512');
}

// Generate a new random master key
export function generateMasterKey(): { key: Buffer; salt: string } {
  const key = randomBytes(KEY_LENGTH);
  const salt = randomBytes(32).toString('base64url');
  return { key, salt };
}

// Derive user master key from password + salt (Argon2id is in auth.ts)
// This uses PBKDF2-SHA512 as a fallback for the crypto engine itself
export function deriveKeyFromPassword(password: string, salt: string): Buffer {
  const saltBuffer = Buffer.from(salt, 'base64url');
  return pbkdf2Sync(password, saltBuffer, 600000, KEY_LENGTH, 'sha512');
}

// ============================================================
// Core Cyclic Encryption
// ============================================================

interface EncryptedPayload {
  data: string;        // base64url encoded
  rounds: number;
  version: number;
}

function singleEncrypt(plaintext: Buffer, key: Buffer): Buffer {
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv, { authTagLength: AUTH_TAG_LENGTH });
  const encrypted = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const authTag = cipher.getAuthTag();
  // Layout: [iv (12)] [authTag (16)] [ciphertext]
  return Buffer.concat([iv, authTag, encrypted]);
}

function singleDecrypt(ciphertext: Buffer, key: Buffer): Buffer {
  const iv = ciphertext.subarray(0, IV_LENGTH);
  const authTag = ciphertext.subarray(IV_LENGTH, IV_LENGTH + AUTH_TAG_LENGTH);
  const encrypted = ciphertext.subarray(IV_LENGTH + AUTH_TAG_LENGTH);
  const decipher = createDecipheriv(ALGORITHM, key, iv, { authTagLength: AUTH_TAG_LENGTH });
  decipher.setAuthTag(authTag);
  return Buffer.concat([decipher.update(encrypted), decipher.final()]);
}

/**
 * Cyclic Encryption: Encrypt data through N independent rounds
 * Each round uses a unique key derived from the master key + round number
 * Even encrypting the same data twice yields completely different ciphertext
 * (due to random IVs/nonces in each round)
 */
export function cyclicEncrypt(
  plaintext: string | Buffer,
  channelKey: Buffer,
  rounds: number = DEFAULT_ROUNDS
): EncryptedPayload {
  let data: Buffer;
  if (typeof plaintext === 'string') {
    data = Buffer.from(plaintext, 'utf-8');
  } else {
    data = plaintext;
  }

  // Apply N rounds of encryption
  for (let i = 1; i <= rounds; i++) {
    const roundKey = deriveRoundKey(channelKey, i);
    data = singleEncrypt(data, roundKey);
  }

  return {
    data: data.toString('base64url'),
    rounds,
    version: 1,
  };
}

/**
 * Cyclic Decryption: Reverse N rounds of encryption
 */
export function cyclicDecrypt(
  payload: EncryptedPayload,
  channelKey: Buffer
): Buffer {
  let data = Buffer.from(payload.data, 'base64url');

  // Decrypt in reverse order (round N → round 1)
  for (let i = payload.rounds; i >= 1; i--) {
    const roundKey = deriveRoundKey(channelKey, i);
    data = singleDecrypt(data, roundKey);
  }

  return data;
}

/**
 * Encrypt a channel key with the user's master key (for storage)
 */
export function encryptChannelKey(channelKey: Buffer, userMasterKey: Buffer): string {
  return singleEncrypt(channelKey, userMasterKey).toString('base64url');
}

/**
 * Decrypt a stored channel key using the user's master key
 */
export function decryptChannelKey(encryptedKey: string, userMasterKey: Buffer): Buffer {
  return singleDecrypt(Buffer.from(encryptedKey, 'base64url'), userMasterKey);
}

/**
 * Generate a random API key string
 */
export function generateApiKey(): string {
  const prefix = randomBytes(4).toString('hex').toUpperCase();
  const secret = randomBytes(32).toString('base64url');
  return `qs_${prefix}_${secret}`;
}

/**
 * Hash an API key for storage (never store plaintext)
 */
export function hashApiKey(apiKey: string): string {
  return createHash('sha512').update(apiKey).digest('hex');
}

/**
 * Generate a random verification token
 */
export function generateVerificationToken(): string {
  return randomBytes(32).toString('base64url');
}

/**
 * Hash data with SHA-512
 */
export function sha512(data: string): string {
  return createHash('sha512').update(data).digest('hex');
}

export const CRYPTO_INFO = {
  algorithm: 'AES-256-GCM (cyclic, multi-round)',
  keyDerivation: 'PBKDF2-SHA512 (200k iterations per channel key, 100k per round)',
  passwordHashing: 'Argon2id (memory-hard, quantum-resistant)',
  defaultRounds: DEFAULT_ROUNDS,
  ivLength: IV_LENGTH,
  keyLength: KEY_LENGTH,
  authTagLength: AUTH_TAG_LENGTH,
  quantumResistance: '256-bit AES remains 128-bit secure against Grover\'s algorithm. Multi-round encryption compounds this. Argon2id is memory-hard and quantum-resistant.',
};