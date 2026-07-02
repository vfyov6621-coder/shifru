import { NextRequest, NextResponse } from 'next/server';
import { getSessionUser, adminVerifyUser, adminUnverifyUser } from '@/lib/auth';

// POST /api/admin/verify — verify/unverify a user
export async function POST(req: NextRequest) {
  try {
    const session = await getSessionUser(req);
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    if (!session.isAdmin) {
      return NextResponse.json({ error: 'Нет прав' }, { status: 403 });
    }

    const { userId, action } = await req.json();
    if (!userId || !action) {
      return NextResponse.json({ error: 'userId и action обязательны' }, { status: 400 });
    }

    if (action === 'verify') {
      const result = await adminVerifyUser(session.userId, userId);
      if (!result.success) return NextResponse.json({ error: result.error }, { status: 400 });
      return NextResponse.json({ message: 'Пользователь верифицирован' });
    }

    if (action === 'unverify') {
      const result = await adminUnverifyUser(session.userId, userId);
      if (!result.success) return NextResponse.json({ error: result.error }, { status: 400 });
      return NextResponse.json({ message: 'Верификация снята' });
    }

    return NextResponse.json({ error: 'Неверное действие' }, { status: 400 });
  } catch (error) {
    console.error('Admin verify error:', error);
    return NextResponse.json({ error: 'Ошибка сервера' }, { status: 500 });
  }
}