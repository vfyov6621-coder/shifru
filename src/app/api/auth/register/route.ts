import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { hashPassword, createToken } from '@/lib/auth';
import { generateMasterKey } from '@/lib/crypto';

export async function POST(req: NextRequest) {
  try {
    const { login, password } = await req.json();
    if (!login || !password) {
      return NextResponse.json({ error: 'Логин и пароль обязательны' }, { status: 400 });
    }
    if (login.length < 3) {
      return NextResponse.json({ error: 'Логин минимум 3 символа' }, { status: 400 });
    }
    if (password.length < 6) {
      return NextResponse.json({ error: 'Пароль минимум 6 символов' }, { status: 400 });
    }

    const existing = await db.user.findUnique({ where: { login } });
    if (existing) {
      return NextResponse.json({ error: 'Логин занят' }, { status: 409 });
    }

    const { salt } = generateMasterKey();
    const passwordHash = await hashPassword(password);

    const user = await db.user.create({
      data: { login, passwordHash, masterKeySalt: salt },
    });

    const token = await createToken({ userId: user.id, login: user.login });
    return NextResponse.json({ token, user: { id: user.id, login: user.login } }, { status: 201 });
  } catch (error) {
    console.error('Register error:', error);
    return NextResponse.json({ error: 'Ошибка сервера' }, { status: 500 });
  }
}