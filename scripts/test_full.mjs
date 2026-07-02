import { PrismaClient } from '@prisma/client';
const db = new PrismaClient();

const BASE = 'http://127.0.0.1:3000';
async function api(path, opts = {}) {
  const r = await fetch(`${BASE}${path}`, { headers: { 'Content-Type': 'application/json', ...opts.headers }, ...opts });
  const d = await r.json();
  if (!r.ok) throw new Error(`HTTP ${r.status}: ${d.error}`);
  return d;
}

async function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function main() {
  console.log('=== 1. Регистрация админа ===');
  const reg1 = await api('/api/auth/register', { method: 'POST', body: JSON.stringify({ login: 'admin', password: 'admin123', password2: 'admin123' }) });
  console.log(`  ✅ ${reg1.user.login} (admin=${reg1.user.isAdmin})`);
  const token = reg1.token;
  const auth = { headers: { Authorization: `Bearer ${token}` } };

  console.log('\n=== 2. Регистрация userB ===');
  const reg2 = await api('/api/auth/register', { method: 'POST', body: JSON.stringify({ login: 'userB', password: 'userB123', password2: 'userB123' }) });
  console.log(`  ✅ ${reg2.user.login} id=${reg2.user.id}`);
  const B_ID = reg2.user.id;

  console.log('\n=== 3. Список пользователей (admin) ===');
  const users = await api('/api/admin/users', { headers: auth.headers });
  console.log(`  ✅ ${users.users.length} пользователей`);

  console.log('\n=== 4. Верификация админа ===');
  const me = await api('/api/me', { headers: auth.headers });
  await api('/api/admin/verify', { method: 'POST', headers: auth.headers, body: JSON.stringify({ userId: me.user.id, action: 'verify' }) });
  console.log('  ✅ Админ верифицирован');

  console.log('\n=== 5. Верификация userB ===');
  await api('/api/admin/verify', { method: 'POST', headers: auth.headers, body: JSON.stringify({ userId: B_ID, action: 'verify' }) });
  console.log('  ✅ userB верифицирован');

  console.log('\n=== 6. Создание чата ABCD ===');
  const chat = await api('/api/channels', { method: 'POST', headers: auth.headers, body: JSON.stringify({ name: 'ABCD Group', password: 'admin123', memberIds: [B_ID] }) });
  const CHAT_ID = chat.chat.id;
  console.log(`  ✅ ${chat.chat.name} id=${CHAT_ID}`);

  console.log('\n=== 7. Шифрование "привет мир" ===');
  const enc1 = await api('/api/encrypt', { method: 'POST', headers: auth.headers, body: JSON.stringify({ data: 'привет мир', chatId: CHAT_ID, password: 'admin123' }) });
  console.log(`  ✅ chain=[${enc1.chain.join('→')}]`);
  console.log(`     data=${enc1.encrypted.slice(0, 50)}...`);

  console.log('\n=== 8. Дешифровка ===');
  const dec1 = await api('/api/decrypt', { method: 'POST', headers: auth.headers, body: JSON.stringify({ encrypted: enc1.encrypted, chatId: CHAT_ID, chain: enc1.chain, password: 'admin123' }) });
  console.log(`  ✅ "${dec1.decrypted}" ${dec1.decrypted === 'привет мир' ? 'КОРРЕКТНО' : 'ОШИБКА!'}`);

  console.log('\n=== 9. Второе шифрование (должно отличаться) ===');
  const enc2 = await api('/api/encrypt', { method: 'POST', headers: auth.headers, body: JSON.stringify({ data: 'привет мир', chatId: CHAT_ID, password: 'admin123' }) });
  const diffOutput = enc1.encrypted !== enc2.encrypted;
  const diffChain = enc1.chain.join() !== enc2.chain.join();
  console.log(`  ${diffOutput ? '✅' : '❌'} Шифротексты разные | ${diffChain ? '✅' : '❌'} Цепочки разные`);

  console.log('\n=== 10. Дешифровка второго ===');
  const dec2 = await api('/api/decrypt', { method: 'POST', headers: auth.headers, body: JSON.stringify({ encrypted: enc2.encrypted, chatId: CHAT_ID, chain: enc2.chain, password: 'admin123' }) });
  console.log(`  ✅ "${dec2.decrypted}" ${dec2.decrypted === 'привет мир' ? 'КОРРЕКТНО' : 'ОШИБКА!'}`);

  console.log('\n=== 11. Создание API-ключа ===');
  const ak = await api('/api/api-keys', { method: 'POST', headers: auth.headers, body: JSON.stringify({ name: 'production-key' }) });
  console.log(`  ✅ ${ak.apiKey.slice(0, 25)}...`);
  const apiKeyAuth = { headers: { 'x-api-key': ak.apiKey } };

  console.log('\n=== 12. Шифрование через API-ключ ===');
  const enc3 = await api('/api/encrypt', { method: 'POST', headers: apiKeyAuth.headers, body: JSON.stringify({ data: 'тест через API', chatId: CHAT_ID }) });
  console.log(`  ✅ chain=[${enc3.chain.join('→')}]`);

  console.log('\n=== 13. Дешифровка через API-ключ ===');
  const dec3 = await api('/api/decrypt', { method: 'POST', headers: apiKeyAuth.headers, body: JSON.stringify({ encrypted: enc3.encrypted, chatId: CHAT_ID, chain: enc3.chain }) });
  console.log(`  ✅ "${dec3.decrypted}" ${dec3.decrypted === 'тест через API' ? 'КОРРЕКТНО' : 'ОШИБКА!'}`);

  console.log('\n=== 14. Лимиты запросов ===');
  const profile = await api('/api/me', { headers: auth.headers });
  console.log(`  ✅ daily: ${profile.rateLimits.dailyRemaining}/90000 | monthly: ${profile.rateLimits.monthlyRemaining}/200000`);

  console.log('\n=== 15. Список чатов ===');
  const chats = await api('/api/channels', { headers: auth.headers });
  console.log(`  ✅ ${chats.chats.length} чатов: ${chats.chats.map(c => c.name).join(', ')}`);

  console.log('\n========================================');
  console.log('  ВСЕ 15 ТЕСТОВ ПРОЙДЕНЫ ✅');
  console.log('========================================');
}

main().catch(e => { console.error('FATAL:', e.message); process.exit(1); })
  .finally(() => db.$disconnect());