import { NextRequest, NextResponse } from 'next/server';
import { getSessionUser, getChatKeyByPassword, getUserByApiKey, getChatKeyByApiKey, checkRateLimit, incrementRateLimit, requireVerified } from '@/lib/auth';
import { chainDecrypt, type EncryptedPayload, type ChainMethod } from '@/lib/crypto';
import { db } from '@/lib/db';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { encrypted, chatId, chain, password } = body;
    if (!encrypted || !chatId || !chain) {
      return NextResponse.json({ error: 'encrypted, chatId и chain обязательны' }, { status: 400 });
    }

    let chatKey: Buffer;
    let userId: string;

    const authHeader = req.headers.get('authorization');
    const apiKeyHeader = req.headers.get('x-api-key');

    if (authHeader?.startsWith('Bearer ')) {
      const session = await getSessionUser(req);
      if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
      if (!password) return NextResponse.json({ error: 'Пароль обязателен' }, { status: 400 });

      // Check verification
      const verified = await requireVerified(session.userId);
      if (!verified) return NextResponse.json({ error: 'Аккаунт не верифицирован. Ожидайте подтверждения администратором.' }, { status: 403 });

      userId = session.userId;
      chatKey = await getChatKeyByPassword(chatId, userId, password);
    } else if (apiKeyHeader) {
      const user = await getUserByApiKey(apiKeyHeader);
      if (!user) return NextResponse.json({ error: 'Неверный API-ключ' }, { status: 401 });
      userId = user.id;
      chatKey = await getChatKeyByApiKey(chatId, apiKeyHeader);
    } else {
      return NextResponse.json({ error: 'Требуется авторизация' }, { status: 401 });
    }

    const { allowed, dailyRemaining, monthlyRemaining } = await checkRateLimit(userId);
    if (!allowed) {
      return NextResponse.json({ error: 'Лимит запросов исчерпан', dailyRemaining, monthlyRemaining }, { status: 429 });
    }

    const payload: EncryptedPayload = { data: encrypted, chain: chain as ChainMethod[], version: 2 };
    const decrypted = chainDecrypt(payload, chatKey);

    await db.encryptionLog.create({
      data: { action: 'decrypt', chatId, userId, inputLen: encrypted.length, outputLen: decrypted.length },
    });
    await incrementRateLimit(userId);

    return NextResponse.json({ decrypted, chatId });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Ошибка дешифровки';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}