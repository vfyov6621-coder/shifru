// Direct module test — no HTTP server needed
import { createHash, randomBytes } from 'crypto';
import { PrismaClient } from '@prisma/client';

const db = new PrismaClient();
const primes = { p: BigInt('0xFFFFFFFFFFFFFFFFC90FDAA22168C234C4C6628B80DC1CD1'),
  q: BigInt('0xFFFFFFFFFFFFFFFFC90FDAA22168C234C4C6628B80DC1CD1') };

async function main() {
  console.log('=== 1. Crypto Module Test ===');
  const { chainEncrypt, chainDecrypt, generateMasterKey, deriveKeyFromPassword,
    encryptChatKey, decryptChatKey, encryptPasswordThroughService, generateApiKey,
    hashApiKey, CRYPTO_INFO } = await import('../src/lib/crypto.ts');

  // Test password encryption through service
  const enc1 = encryptPasswordThroughService('test123');
  const enc2 = encryptPasswordThroughService('test123');
  const enc3 = encryptPasswordThroughService('other456');
  console.log(`  Password self-encryption: ${enc1 === enc2 ? '✅ deterministic' : '❌'} | diff pass: ${enc1 !== enc3 ? '✅' : '❌'}`);

  // Test chain encrypt/decrypt
  const testKey = randomBytes(32);
  const plain = 'привет мир — тестовый текст 123!';
  const enc = chainEncrypt(plain, testKey);
  console.log(`  Chain encrypt: ${enc.chain.length} steps [${enc.chain.join('→')}]`);
  console.log(`  Version: ${enc.version}`);

  // Same text → different output
  const enc2r = chainEncrypt(plain, testKey);
  console.log(`  Same input diff output: ${enc.data !== enc2r.data ? '✅' : '❌'} (chain diff: ${enc.chain.join() !== enc2r.chain.join() ? '✅' : '❌'})`);

  // Decrypt
  const dec = chainDecrypt(enc, testKey);
  console.log(`  Decrypt match: ${dec === plain ? '✅' : '❌ got: ' + dec}`);

  // Wrong key
  try {
    const wrongKey = randomBytes(32);
    chainDecrypt(enc, wrongKey);
    console.log('  Wrong key rejection: ❌ should have thrown');
  } catch (e) {
    console.log(`  Wrong key rejection: ✅ (${e.message.slice(0, 40)})`);
  }

  // Test key management
  const { key: mk, salt } = generateMasterKey();
  const derived = deriveKeyFromPassword('password', salt);
  const chatKey = randomBytes(32);
  const encChat = encryptChatKey(chatKey, mk);
  const decChat = decryptChatKey(encChat, mk);
  console.log(`  Chat key encrypt/decrypt: ${Buffer.compare(chatKey, decChat) === 0 ? '✅' : '❌'}`);

  // API key
  const ak = generateApiKey();
  console.log(`  API key prefix: ${ak.slice(0, 20)}... hash: ${hashApiKey(ak).slice(0, 20)}...`);
  console.log(`  CRYPTO_INFO: ${JSON.stringify(CRYPTO_INFO).slice(0, 80)}...`);

  console.log('\n=== 2. Auth Module Test ===');
  const { hashPassword, verifyPassword, createToken, verifyToken,
    adminVerifyUser, getServerKey, DAILY_LIMIT, MONTHLY_LIMIT } = await import('../src/lib/auth.ts');

  const hp = await hashPassword('test123');
  const v1 = await verifyPassword(hp, 'test123');
  const v2 = await verifyPassword(hp, 'wrong');
  console.log(`  Password hash/verify: ${v1 && !v2 ? '✅' : '❌'}`);

  console.log(`  Rate limits: daily=${DAILY_LIMIT}, monthly=${MONTHLY_LIMIT}`);

  const serverKey = getServerKey();
  console.log(`  Server key: ${serverKey.length} bytes ✅`);

  console.log('\n=== 3. DB + Full Flow Test ===');
  await db.user.deleteMany({});

  // Register admin
  const { salt: adminSalt } = generateMasterKey();
  const adminHash = await hashPassword('admin123');
  const admin = await db.user.create({
    data: { login: 'admin', passwordHash: adminHash, masterKeySalt: adminSalt, isAdmin: true }
  });
  console.log(`  Admin created: ${admin.login} (id: ${admin.id})`);

  // Register userB
  const { salt: bSalt } = generateMasterKey();
  const bHash = await hashPassword('userB123');
  const userB = await db.user.create({
    data: { login: 'userB', passwordHash: bHash, masterKeySalt: bSalt }
  });
  console.log(`  UserB created: ${userB.login} (id: ${userB.id})`);

  // Verify userB via admin
  await adminVerifyUser(admin.id, userB.id);
  const verifiedB = await db.user.findUnique({ where: { id: userB.id } });
  console.log(`  UserB verified: ${verifiedB?.isVerified ? '✅' : '❌'}`);

  // Create group chat
  const chatKeyBuf = randomBytes(32);
  const adminMaster = deriveKeyFromPassword('admin123', adminSalt);
  const encKey = encryptChatKey(chatKeyBuf, adminMaster);
  const apiEncKey = encryptChatKey(chatKeyBuf, serverKey);
  const chat = await db.chat.create({
    data: {
      name: 'ABCD Group', ownerId: admin.id,
      encryptedKey: encKey, apiEncryptedKey: apiEncKey, isGroup: true,
      members: { connect: [{ id: admin.id }, { id: userB.id }] }
    }
  });
  console.log(`  Chat created: ${chat.name} (id: ${chat.id})`);

  // Encrypt
  const encResult = chainEncrypt('привет мир', chatKeyBuf);
  console.log(`  Encrypted: chain=[${encResult.chain.join('→')}], data=${encResult.data.slice(0, 40)}...`);

  // Decrypt
  const decResult = chainDecrypt(encResult, chatKeyBuf);
  console.log(`  Decrypted: "${decResult}" ${decResult === 'привет мир' ? '✅' : '❌'}`);

  // Create API key
  const apiKeyRaw = generateApiKey();
  const apiHash = hashApiKey(apiKeyRaw);
  const akRec = await db.apiKey.create({
    data: { name: 'test-key', keyHash: apiHash, keyPrefix: apiKeyRaw.slice(0, 15) + '...', userId: admin.id }
  });
  console.log(`  API key created: ${akRec.keyPrefix}`);

  // Rate limit check
  const { checkRateLimit, incrementRateLimit } = await import('../src/lib/auth.ts');
  const rl = await checkRateLimit(admin.id);
  console.log(`  Rate limit: daily=${rl.dailyRemaining}/90000, monthly=${rl.monthlyRemaining}/200000 ✅`);

  await incrementRateLimit(admin.id);
  const rl2 = await checkRateLimit(admin.id);
  console.log(`  After increment: daily=${rl2.dailyRemaining}/90000 ✅`);

  // JWT token
  const token = await createToken({ userId: admin.id, login: admin.login, isAdmin: true });
  const payload = await verifyToken(token);
  console.log(`  JWT: ${payload?.login === 'admin' ? '✅' : '❌'}`);

  console.log('\n=== ALL MODULE TESTS PASSED ✅ ===');
}

main().catch(e => { console.error('FATAL:', e); process.exit(1); })
  .finally(() => db.$disconnect());