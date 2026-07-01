import { createCipheriv, createDecipheriv, randomBytes, pbkdf2Sync } from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const KEY_LENGTH = 32;
const IV_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;

function deriveRoundKey(masterKey, roundNumber) {
  return pbkdf2Sync(masterKey, `quantum-shield-round-${roundNumber}`, 100000, KEY_LENGTH, 'sha512');
}

function singleEncrypt(plaintext, key) {
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv, { authTagLength: AUTH_TAG_LENGTH });
  const encrypted = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return Buffer.concat([iv, authTag, encrypted]);
}

function singleDecrypt(ciphertext, key) {
  const iv = ciphertext.subarray(0, IV_LENGTH);
  const authTag = ciphertext.subarray(IV_LENGTH, IV_LENGTH + AUTH_TAG_LENGTH);
  const encrypted = ciphertext.subarray(IV_LENGTH + AUTH_TAG_LENGTH);
  const decipher = createDecipheriv(ALGORITHM, key, iv, { authTagLength: AUTH_TAG_LENGTH });
  decipher.setAuthTag(authTag);
  return Buffer.concat([decipher.update(encrypted), decipher.final()]);
}

function cyclicEncrypt(plaintext, channelKey, rounds = 4) {
  let data = Buffer.from(plaintext, 'utf-8');
  for (let i = 1; i <= rounds; i++) {
    data = singleEncrypt(data, deriveRoundKey(channelKey, i));
  }
  return { data: data.toString('base64url'), rounds };
}

function cyclicDecrypt(payload, channelKey) {
  let data = Buffer.from(payload.data, 'base64url');
  for (let i = payload.rounds; i >= 1; i--) {
    data = singleDecrypt(data, deriveRoundKey(channelKey, i));
  }
  return data;
}

const channelKey = randomBytes(KEY_LENGTH);
const plain = "Hello World";

const enc1 = cyclicEncrypt(plain, channelKey, 4);
const enc2 = cyclicEncrypt(plain, channelKey, 4);

console.log("=== Cyclic Encryption Test ===");
console.log("Plaintext:", plain);
console.log("Encryption 1:", enc1.data.substring(0, 40) + "...");
console.log("Encryption 2:", enc2.data.substring(0, 40) + "...");
console.log("Different outputs?", enc1.data !== enc2.data ? "YES" : "NO");

const dec1 = cyclicDecrypt(enc1, channelKey).toString('utf-8');
const dec2 = cyclicDecrypt(enc2, channelKey).toString('utf-8');
console.log("Decryption 1:", dec1);
console.log("Decryption 2:", dec2);
console.log("Both correct?", (dec1 === plain && dec2 === plain) ? "YES" : "NO");

const wrongKey = randomBytes(KEY_LENGTH);
try {
  cyclicDecrypt(enc1, wrongKey);
  console.log("Wrong key: UNEXPECTED SUCCESS");
} catch (e) {
  console.log("Wrong key: CORRECTLY FAILED");
}
