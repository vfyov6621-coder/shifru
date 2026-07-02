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
      select: {
        id: true, login: true, isVerified: true, isAdmin: true,
        createdAt: true,
        _count: { select: { chats: true, apiKeys: true, encryptionLogs: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    return NextResponse.json({ users });
  } catch (error) {
    console.error('Admin users error:', error);
    return NextResponse.json({ error: 'Ошибка сервера' }, { status: 500 });
  }
}