import { chainEncrypt, chainDecrypt, generateMasterKey, encryptPasswordThroughService } from '../src/lib/crypto';

const { key: chatKey } = generateMasterKey();

const plain = "Привет, мир! Test message.";
console.log("=== Chain Encryption Test ===");
console.log("Plaintext:", plain);

// Test 1: Encrypt twice → different results
const enc1 = chainEncrypt(plain, chatKey);
const enc2 = chainEncrypt(plain, chatKey);
console.log("\nEncryption 1 chain:", enc1.chain.join(' → '));
console.log("Encryption 2 chain:", enc2.chain.join(' → '));
console.log("Different chains?", enc1.chain.join(',') !== enc2.chain.join(',') ? "YES" : "NO");
console.log("Different ciphertexts?", enc1.data !== enc2.data ? "YES" : "NO");

// Test 2: Decrypt both
const dec1 = chainDecrypt(enc1, chatKey);
const dec2 = chainDecrypt(enc2, chatKey);
console.log("\nDecryption 1:", dec1);
console.log("Decryption 2:", dec2);
console.log("Both correct?", (dec1 === plain && dec2 === plain) ? "YES" : "NO");

// Test 3: Wrong key fails
const { key: wrongKey } = generateMasterKey();
try {
  chainDecrypt(enc1, wrongKey);
  console.log("\nWrong key: UNEXPECTED SUCCESS");
} catch (e) {
  console.log("\nWrong key: CORRECTLY FAILED -", e.message.substring(0, 60));
}

// Test 4: Password encryption through service
const encPass = encryptPasswordThroughService("mySecretPassword123");
console.log("\nEncrypted password:", encPass.substring(0, 30) + "...");
console.log("Password encryption works:", encPass.length > 50 ? "YES" : "NO");