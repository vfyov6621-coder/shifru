import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { verifyPassword, createToken, incrementRateLimit, checkRateLimit } from '@/lib/auth';

export async function POST(req: NextRequest) {
  try {
    const { login, password } = await req.json();
    if (!login || !password) {
      return NextResponse.json({ error: 'Логин и пароль обязательны' }, { status: 400 });
    }

    const user = await db.user.findUnique({ where: { login } });
    if (!user) {
      return NextResponse.json({ error: 'Неверные данные' }, { status: 401 });
    }

    const valid = await verifyPassword(user.passwordHash, password);
    if (!valid) {
      return NextResponse.json({ error: 'Неверные данные' }, { status: 401 });
    }

    const token = await createToken({ userId: user.id, login: user.login });
    return NextResponse.json({ token, user: { id: user.id, login: user.login } });
  } catch (error) {
    console.error('Login error:', error);
    return NextResponse.json({ error: 'Ошибка сервера' }, { status: 500 });
  }
}