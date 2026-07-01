import { PrismaClient } from '@prisma/client';

const db = new PrismaClient();

async function main() {
  // Clean up
  await db.user.deleteMany();
  console.log('✓ DB cleaned');

  // Register
  const argon2 = await import('argon2');
  const { encryptPasswordThroughService, generateMasterKey, chainEncrypt, chainDecrypt, createChatForUser, hashApiKey, generateApiKey } = await import('../src/lib/crypto');

  const { hashPassword } = await import('../src/lib/auth');

  const password = 'testpass123';
  const hash = await hashPassword(password);
  console.log('✓ Password hashed');

  const { salt } = generateMasterKey();
  const user = await db.user.create({
    data: { login: 'admin', passwordHash: hash, masterKeySalt: salt },
  });
  console.log('✓ User created:', user.login, user.id);

  // Verify password
  const { verifyPassword } = await import('../src/lib/auth');
  const valid = await verifyPassword(user.passwordHash, password);
  console.log('✓ Password verify:', valid);

  // Create chat
  const { createChatForUser: createChat } = await import('../src/lib/auth');
  const chat = await createChat(user.id, 'Чат с Ваней', password);
  console.log('✓ Chat created:', chat.name, chat.id);

  // Encrypt
  const { getChatKeyByPassword } = await import('../src/lib/auth');
  const chatKey = await getChatKeyByPassword(chat.id, user.id, password);
  const enc = chainEncrypt('Привет, Ваня!', chatKey);
  console.log('✓ Encrypted chain:', enc.chain.join(' → '));
  console.log('  Ciphertext:', enc.data.substring(0, 40) + '...');

  // Encrypt again → different result
  const enc2 = chainEncrypt('Привет, Ваня!', chatKey);
  console.log('✓ Encrypted chain 2:', enc2.chain.join(' → '));
  console.log('  Different chains:', enc.chain.join() !== enc2.chain.join());
  console.log('  Different ciphertexts:', enc.data !== enc2.data);

  // Decrypt both
  const dec1 = chainDecrypt(enc, chatKey);
  const dec2 = chainDecrypt(enc2, chatKey);
  console.log('✓ Decrypted 1:', dec1);
  console.log('✓ Decrypted 2:', dec2);
  console.log('✓ Both correct:', dec1 === 'Привет, Ваня!' && dec2 === 'Привет, Ваня!');

  // Create API key
  const rawKey = generateApiKey();
  const keyHash = hashApiKey(rawKey);
  const apiKeyRec = await db.apiKey.create({
    data: { name: 'test-key', keyHash, keyPrefix: rawKey.slice(0, 15) + '...', userId: user.id },
  });
  console.log('✓ API key created:', apiKeyRec.keyPrefix);

  // Rate limit check
  const { checkRateLimit, incrementRateLimit, DAILY_LIMIT, MONTHLY_LIMIT } = await import('../src/lib/auth');
  const before = await checkRateLimit(user.id);
  console.log('✓ Rate limit before:', before.dailyRemaining, '/', DAILY_LIMIT);
  await incrementRateLimit(user.id);
  const after = await checkRateLimit(user.id);
  console.log('✓ Rate limit after:', after.dailyRemaining, '/', DAILY_LIMIT);

  await db.$disconnect();
  console.log('\n✅ ALL TESTS PASSED');
}

main().catch(e => { console.error('❌', e.message); process.exit(1); });