import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSessionUser, checkRateLimit } from '@/lib/auth';

export async function GET(req: NextRequest) {
  try {
    const session = await getSessionUser(req);
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const user = await db.user.findUnique({
      where: { id: session.userId },
    });

    if (!user) return NextResponse.json({ error: 'Пользователь не найден' }, { status: 404 });

    // Count relations manually
    const chatCount = (await db.execute(
      'SELECT COUNT(*) as c FROM "_ChatToUser" WHERE "B" = ?',
      [session.userId]
    )).rows[0]?.c ?? 0;

    const apiKeyCount = (await db.execute(
      'SELECT COUNT(*) as c FROM "ApiKey" WHERE "userId" = ?',
      [session.userId]
    )).rows[0]?.c ?? 0;

    const encLogCount = (await db.execute(
      'SELECT COUNT(*) as c FROM "EncryptionLog" WHERE "userId" = ?',
      [session.userId]
    )).rows[0]?.c ?? 0;

    const limits = await checkRateLimit(session.userId);

    return NextResponse.json({
      user: {
        id: user.id,
        login: user.login,
        isVerified: user.isVerified,
        isAdmin: user.isAdmin,
        createdAt: user.createdAt,
        _count: { chats: Number(chatCount), apiKeys: Number(apiKeyCount), encryptionLogs: Number(encLogCount) },
      },
      rateLimits: limits,
    });
  } catch (error) {
    console.error('/me error:', error);
    return NextResponse.json({ error: 'Ошибка сервера' }, { status: 500 });
  }
}