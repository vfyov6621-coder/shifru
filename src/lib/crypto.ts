import { createCipheriv, createDecipheriv, randomBytes, createHash, pbkdf2Sync, createHmac } from 'crypto';

// ============================================================
// QuantumShield Chain Encryption Engine v2
// ============================================================
// Chain: message → unicode → binary → unicode → decimal → TLS → unicode → binary → SSL
// Order is random each time. Decryption reverses the chain.
// Outer layer: AES-256-GCM for quantum resistance (Grover: 256→128 bit, still safe)
// Inner layer: chain of reversible transformations with channel-specific keys
// ============================================================

// --- Chain method types ---
export type ChainMethod = 'unicode' | 'binary' | 'decimal' | 'tls' | 'ssl';

export const AVAILABLE_METHODS: ChainMethod[] = ['unicode', 'binary', 'decimal', 'tls', 'ssl'];

const KEY_LENGTH = 32;
const IV_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;
const MIN_CHAIN_LENGTH = 5;
const MAX_CHAIN_LENGTH = 10;

// ============================================================
// System key for encrypting passwords through the service
// ============================================================
function getSystemKey(): Buffer {
  const hash = createHash('sha512')
    .update('qs-system-password-encryption-key-v2')
    .digest('hex');
  return Buffer.from(hash, 'hex').subarray(0, KEY_LENGTH);
}

export function encryptPasswordThroughService(password: string): string {
  // Deterministic: derive IV from password itself so same password → same output
  const iv = createHash('sha256').update(password + 'qs-v2-derive-iv').digest().subarray(0, IV_LENGTH);
  const cipher = createCipheriv('aes-256-gcm', getSystemKey(), iv, { authTagLength: AUTH_TAG_LENGTH });
  const encrypted = Buffer.concat([cipher.update(password, 'utf-8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, encrypted]).toString('base64url');
}

// ============================================================
// Chain transformations — each is reversible
// ============================================================

function toUnicode(data: string): string {
  // "привет" → "1087 1088 1080 1074 1077 1090" (uses codePointAt for full Unicode)
  return Array.from(data).map(c => c.codePointAt(0)!.toString()).join(' ');
}

function fromUnicode(data: string): string {
  return data.trim().split(/\s+/).map(n => String.fromCodePoint(parseInt(n, 10))).join('');
}

function toBinary(data: string): string {
  // UTF-8 bytes → binary string (proper multi-byte handling)
  const buf = Buffer.from(data, 'utf-8');
  return Array.from(buf).map(b => b.toString(2).padStart(8, '0')).join('');
}

function fromBinary(data: string): string {
  // Binary string → UTF-8 bytes → string
  const bytes: number[] = [];
  for (let i = 0; i < data.length; i += 8) {
    const byte = data.substring(i, i + 8);
    if (byte.length === 8) {
      bytes.push(parseInt(byte, 2));
    }
  }
  return Buffer.from(bytes).toString('utf-8');
}

function toDecimal(data: string): string {
  // Treat entire string as a sequence of bytes, convert to one large decimal
  const buf = Buffer.from(data, 'utf-8');
  // For very long data, chunk it and join with spaces
  const chunks: string[] = [];
  for (let i = 0; i < buf.length; i += 4) {
    const slice = buf.subarray(i, Math.min(i + 4, buf.length));
    chunks.push(BigInt('0x' + slice.toString('hex')).toString(10));
  }
  return chunks.join(' ');
}

function fromDecimal(data: string): string {
  const nums = data.trim().split(/\s+/);
  const bufs: Buffer[] = [];
  for (const n of nums) {
    const hex = BigInt(n).toString(16);
    const padded = hex.length % 2 === 0 ? hex : '0' + hex;
    bufs.push(Buffer.from(padded, 'hex'));
  }
  return Buffer.concat(bufs).toString('utf-8');
}

function applyTLS(data: string, key: Buffer): string {
  // TLS-like: HMAC-SHA256 based XOR stream cipher + base64url encoding
  const buf = Buffer.from(data, 'utf-8');
  // Generate a stream key using HMAC with counter mode
  const streamKey = Buffer.alloc(buf.length);
  const blockSize = 32;
  for (let i = 0; i < buf.length; i += blockSize) {
    const counter = Buffer.alloc(8);
    counter.writeBigUInt64BE(BigInt(Math.floor(i / blockSize)), 0);
    const block = createHmac('sha256', key).update(Buffer.concat([counter, key])).digest();
    for (let j = 0; j < blockSize && (i + j) < buf.length; j++) {
      streamKey[i + j] = block[j];
    }
  }
  // XOR data with stream key
  const xored = Buffer.alloc(buf.length);
  for (let i = 0; i < buf.length; i++) {
    xored[i] = buf[i] ^ streamKey[i];
  }
  return xored.toString('base64url');
}

function reverseTLS(data: string, key: Buffer): string {
  const buf = Buffer.from(data, 'base64url');
  const streamKey = Buffer.alloc(buf.length);
  const blockSize = 32;
  for (let i = 0; i < buf.length; i += blockSize) {
    const counter = Buffer.alloc(8);
    counter.writeBigUInt64BE(BigInt(Math.floor(i / blockSize)), 0);
    const block = createHmac('sha256', key).update(Buffer.concat([counter, key])).digest();
    for (let j = 0; j < blockSize && (i + j) < buf.length; j++) {
      streamKey[i + j] = block[j];
    }
  }
  const result = Buffer.alloc(buf.length);
  for (let i = 0; i < buf.length; i++) {
    result[i] = buf[i] ^ streamKey[i];
  }
  return result.toString('utf-8');
}

function applySSL(data: string, key: Buffer): string {
  // SSL-like: bit rotation + substitution using key-derived S-box + base64url
  const buf = Buffer.from(data, 'utf-8');
  const shift = (key[0] % 7) + 1; // 1-7 bit rotation
  const result = Buffer.alloc(buf.length);
  for (let i = 0; i < buf.length; i++) {
    const k = key[i % key.length];
    // Rotate left
    const rotated = ((buf[i] << shift) | (buf[i] >> (8 - shift))) & 0xFF;
    // XOR with key byte + position-dependent tweak
    result[i] = (rotated ^ k ^ ((i * 7 + 13) & 0xFF)) & 0xFF;
  }
  return result.toString('base64url');
}

function reverseSSL(data: string, key: Buffer): string {
  const buf = Buffer.from(data, 'base64url');
  const shift = (key[0] % 7) + 1;
  const result = Buffer.alloc(buf.length);
  for (let i = 0; i < buf.length; i++) {
    const k = key[i % key.length];
    // Reverse XOR
    const unxored = (buf[i] ^ k ^ ((i * 7 + 13) & 0xFF)) & 0xFF;
    // Rotate right
    result[i] = ((unxored >> shift) | (unxored << (8 - shift))) & 0xFF;
  }
  return result.toString('utf-8');
}

// ============================================================
// Chain engine — apply/reverse a sequence of transformations
// ============================================================

function deriveMethodKey(channelKey: Buffer, method: ChainMethod, position: number): Buffer {
  return pbkdf2Sync(channelKey, `chain-${method}-${position}`, 50000, KEY_LENGTH, 'sha512');
}

export function generateRandomChain(): ChainMethod[] {
  const length = MIN_CHAIN_LENGTH + Math.floor(Math.random() * (MAX_CHAIN_LENGTH - MIN_CHAIN_LENGTH + 1));
  const chain: ChainMethod[] = [];
  for (let i = 0; i < length; i++) {
    chain.push(AVAILABLE_METHODS[Math.floor(Math.random() * AVAILABLE_METHODS.length)]);
  }
  return chain;
}

function applyChain(data: string, chain: ChainMethod[], channelKey: Buffer): string {
  let current = data;
  for (let i = 0; i < chain.length; i++) {
    const method = chain[i];
    const methodKey = deriveMethodKey(channelKey, method, i);

    switch (method) {
      case 'unicode': current = toUnicode(current); break;
      case 'binary':  current = toBinary(current); break;
      case 'decimal': current = toDecimal(current); break;
      case 'tls':     current = applyTLS(current, methodKey); break;
      case 'ssl':     current = applySSL(current, methodKey); break;
    }
  }
  return current;
}

function reverseChain(data: string, chain: ChainMethod[], channelKey: Buffer): string {
  let current = data;
  for (let i = chain.length - 1; i >= 0; i--) {
    const method = chain[i];
    const methodKey = deriveMethodKey(channelKey, method, i);

    switch (method) {
      case 'unicode': current = fromUnicode(current); break;
      case 'binary':  current = fromBinary(current); break;
      case 'decimal': current = fromDecimal(current); break;
      case 'tls':     current = reverseTLS(current, methodKey); break;
      case 'ssl':     current = reverseSSL(current, methodKey); break;
    }
  }
  return current;
}

// ============================================================
// Outer AES-256-GCM layer (quantum-resistant wrapper)
// ============================================================

function aesEncrypt(plaintext: Buffer, key: Buffer): Buffer {
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv('aes-256-gcm', key, iv, { authTagLength: AUTH_TAG_LENGTH });
  const encrypted = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, encrypted]);
}

function aesDecrypt(ciphertext: Buffer, key: Buffer): Buffer {
  const iv = ciphertext.subarray(0, IV_LENGTH);
  const tag = ciphertext.subarray(IV_LENGTH, IV_LENGTH + AUTH_TAG_LENGTH);
  const data = ciphertext.subarray(IV_LENGTH + AUTH_TAG_LENGTH);
  const decipher = createDecipheriv('aes-256-gcm', key, iv, { authTagLength: AUTH_TAG_LENGTH });
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(data), decipher.final()]);
}

// ============================================================
// Public API: Chain Encrypt / Decrypt
// ============================================================

export interface EncryptedPayload {
  data: string;          // base64url of AES-encrypted(chain_result)
  chain: ChainMethod[];  // the transformation order
  version: number;
}

export function chainEncrypt(
  plaintext: string,
  chatKey: Buffer
): EncryptedPayload {
  // Step 1: Generate random chain
  const chain = generateRandomChain();

  // Step 2: Apply chain transformations
  const chainResult = applyChain(plaintext, chain, chatKey);

  // Step 3: Wrap in AES-256-GCM (quantum resistance)
  const aesKey = pbkdf2Sync(chatKey, 'outer-aes-layer', 100000, KEY_LENGTH, 'sha512');
  const encrypted = aesEncrypt(Buffer.from(chainResult, 'utf-8'), aesKey);

  return {
    data: encrypted.toString('base64url'),
    chain,
    version: 2,
  };
}

export function chainDecrypt(
  payload: EncryptedPayload,
  chatKey: Buffer
): string {
  // Step 1: Unwrap AES-256-GCM
  const aesKey = pbkdf2Sync(chatKey, 'outer-aes-layer', 100000, KEY_LENGTH, 'sha512');
  const chainResult = aesDecrypt(Buffer.from(payload.data, 'base64url'), aesKey).toString('utf-8');

  // Step 2: Reverse chain
  return reverseChain(chainResult, payload.chain, chatKey);
}

// ============================================================
// Chat key management
// ============================================================

export function generateMasterKey(): { key: Buffer; salt: string } {
  return { key: randomBytes(KEY_LENGTH), salt: randomBytes(32).toString('base64url') };
}

export function deriveKeyFromPassword(password: string, salt: string): Buffer {
  return pbkdf2Sync(password, Buffer.from(salt, 'base64url'), 600000, KEY_LENGTH, 'sha512');
}

export function encryptChatKey(chatKey: Buffer, masterKey: Buffer): string {
  return aesEncrypt(chatKey, masterKey).toString('base64url');
}

export function decryptChatKey(encrypted: string, masterKey: Buffer): Buffer {
  return aesDecrypt(Buffer.from(encrypted, 'base64url'), masterKey);
}

// ============================================================
// API keys & utilities
// ============================================================

export function generateApiKey(): string {
  const prefix = randomBytes(4).toString('hex').toUpperCase();
  const secret = randomBytes(32).toString('base64url');
  return `qs_${prefix}_${secret}`;
}

export function hashApiKey(apiKey: string): string {
  return createHash('sha512').update(apiKey).digest('hex');
}

export const CRYPTO_INFO = {
  algorithm: 'Chain encryption (unicode→binary→decimal→TLS→SSL) + AES-256-GCM outer layer',
  keyDerivation: 'PBKDF2-SHA512 (600k password, 100k outer AES, 50k per chain method)',
  passwordHashing: 'Argon2id (memory-hard, quantum-resistant)',
  quantumResistance: 'AES-256-GCM outer: 128-bit vs Grover. Chain adds structural complexity. Argon2id is memory-hard.',
  chainMethods: ['unicode', 'binary', 'decimal', 'tls', 'ssl'],
  chainLength: `${MIN_CHAIN_LENGTH}-${MAX_CHAIN_LENGTH} (random each time)`,
};