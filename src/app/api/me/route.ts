import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSessionUser, checkRateLimit } from '@/lib/auth';

export async function GET(req: NextRequest) {
  try {
    const session = await getSessionUser(req);
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const user = await db.user.findUnique({
      where: { id: session.userId },
      select: {
        id: true, login: true, createdAt: true,
        _count: { select: { chats: true, apiKeys: true, encryptionLogs: true } },
      },
    });

    const limits = await checkRateLimit(session.userId);

    return NextResponse.json({ user, rateLimits: limits });
  } catch (error) {
    return NextResponse.json({ error: 'Ошибка сервера' }, { status: 500 });
  }
}