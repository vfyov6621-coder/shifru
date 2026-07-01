import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { hashPassword, createToken } from '@/lib/auth';
import { generateMasterKey } from '@/lib/crypto';

export async function POST(req: NextRequest) {
  try {
    const { login, password, password2 } = await req.json();

    if (!login || !password || !password2) {
      return NextResponse.json({ error: 'Все поля обязательны' }, { status: 400 });
    }
    if (login.length < 3) {
      return NextResponse.json({ error: 'Логин минимум 3 символа' }, { status: 400 });
    }
    if (password.length < 6) {
      return NextResponse.json({ error: 'Пароль минимум 6 символов' }, { status: 400 });
    }
    if (password !== password2) {
      return NextResponse.json({ error: 'Пароли не совпадают' }, { status: 400 });
    }

    const existing = await db.user.findUnique({ where: { login } });
    if (existing) {
      return NextResponse.json({ error: 'Логин занят' }, { status: 409 });
    }

    const { salt } = generateMasterKey();
    const passwordHash = await hashPassword(password);

    // First registered user becomes admin
    const userCount = await db.user.count();
    const isAdmin = userCount === 0;

    const user = await db.user.create({
      data: { login, passwordHash, masterKeySalt: salt, isAdmin },
    });

    const token = await createToken({ userId: user.id, login: user.login, isAdmin });
    return NextResponse.json({
      token,
      user: { id: user.id, login: user.login, isVerified: user.isVerified, isAdmin: user.isAdmin },
    }, { status: 201 });
  } catch (error) {
    console.error('Register error:', error);
    return NextResponse.json({ error: 'Ошибка сервера' }, { status: 500 });
  }
}