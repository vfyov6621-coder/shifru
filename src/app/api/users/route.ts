import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSessionUser } from '@/lib/auth';

// GET /api/users?search=abc — search verified users (for adding to chats)
export async function GET(req: NextRequest) {
  try {
    const session = await getSessionUser(req);
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { searchParams } = new URL(req.url);
    const search = searchParams.get('search') || '';

    const users = await db.user.findMany({
      where: {
        id: { not: session.userId },
        isVerified: true,
        ...(search ? { login: { contains: search } } : {}),
      },
      select: { id: true, login: true },
      take: 20,
    });

    return NextResponse.json({ users });
  } catch (error) {
    console.error('Users search error:', error);
    return NextResponse.json({ error: 'Ошибка сервера' }, { status: 500 });
  }
}