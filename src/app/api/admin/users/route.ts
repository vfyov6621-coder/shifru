import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSessionUser } from '@/lib/auth';

// GET /api/admin/users — list all users (admin only)
export async function GET(req: NextRequest) {
  try {
    const session = await getSessionUser(req);
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    if (!session.isAdmin) {
      return NextResponse.json({ error: 'Нет прав' }, { status: 403 });
    }

    const users = await db.user.findMany({
      orderBy: { createdAt: 'desc' },
    });

    // Enrich with counts
    const enriched = await Promise.all(users.map(async (u: any) => {
      const chatCount = (await db.execute(
        'SELECT COUNT(*) as c FROM "_ChatToUser" WHERE "B" = ?',
        [u.id]
      )).rows[0]?.c ?? 0;

      const apiKeyCount = (await db.execute(
        'SELECT COUNT(*) as c FROM "ApiKey" WHERE "userId" = ?',
        [u.id]
      )).rows[0]?.c ?? 0;

      const encLogCount = (await db.execute(
        'SELECT COUNT(*) as c FROM "EncryptionLog" WHERE "userId" = ?',
        [u.id]
      )).rows[0]?.c ?? 0;

      return {
        id: u.id,
        login: u.login,
        isVerified: u.isVerified,
        isAdmin: u.isAdmin,
        createdAt: u.createdAt,
        _count: {
          chats: Number(chatCount),
          apiKeys: Number(apiKeyCount),
          encryptionLogs: Number(encLogCount),
        },
      };
    }));

    return NextResponse.json({ users: enriched });
  } catch (error) {
    console.error('Admin users error:', error);
    return NextResponse.json({ error: 'Ошибка сервера' }, { status: 500 });
  }
}