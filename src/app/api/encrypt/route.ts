import { NextRequest, NextResponse } from 'next/server';
import { getSessionUser, getChatKeyByPassword, getUserByApiKey, getChatKeyByApiKey, checkRateLimit, incrementRateLimit, requireVerified } from '@/lib/auth';
import { chainEncrypt } from '@/lib/crypto';
import { db } from '@/lib/db';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { data, chatId, password } = body;
    if (!data || !chatId) {
      return NextResponse.json({ error: 'Данные и chatId обязательны' }, { status: 400 });
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

    // Rate limit
    const { allowed, dailyRemaining, monthlyRemaining } = await checkRateLimit(userId);
    if (!allowed) {
      return NextResponse.json({ error: 'Лимит запросов исчерпан', dailyRemaining, monthlyRemaining }, { status: 429 });
    }

    const result = chainEncrypt(data, chatKey);

    await db.encryptionLog.create({
      data: { action: 'encrypt', chatId, userId, inputLen: data.length, outputLen: result.data.length },
    });
    await incrementRateLimit(userId);

    return NextResponse.json({ encrypted: result.data, chain: result.chain, version: result.version, chatId });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Ошибка шифрования';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}