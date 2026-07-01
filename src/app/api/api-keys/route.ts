import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSessionUser } from '@/lib/auth';
import { generateApiKey, hashApiKey } from '@/lib/crypto';

export async function GET(req: NextRequest) {
  try {
    const session = await getSessionUser(req);
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const keys = await db.apiKey.findMany({
      where: { userId: session.userId },
      select: { id: true, name: true, keyPrefix: true, lastUsed: true, createdAt: true },
      orderBy: { createdAt: 'desc' },
    });

    return NextResponse.json({ keys });
  } catch (error) {
    return NextResponse.json({ error: 'Ошибка сервера' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await getSessionUser(req);
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { name } = await req.json();
    if (!name) return NextResponse.json({ error: 'Название обязательно' }, { status: 400 });

    const rawKey = generateApiKey();
    const keyHash = hashApiKey(rawKey);

    const record = await db.apiKey.create({
      data: { name, keyHash, keyPrefix: rawKey.slice(0, 15) + '...', userId: session.userId },
    });

    return NextResponse.json({ apiKey: rawKey, id: record.id, name: record.name }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: 'Ошибка сервера' }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const session = await getSessionUser(req);
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { searchParams } = new URL(req.url);
    const keyId = searchParams.get('id');
    if (!keyId) return NextResponse.json({ error: 'ID ключа обязателен' }, { status: 400 });

    const key = await db.apiKey.findFirst({ where: { id: keyId, userId: session.userId } });
    if (!key) return NextResponse.json({ error: 'Ключ не найден' }, { status: 404 });

    await db.apiKey.delete({ where: { id: keyId } });
    return NextResponse.json({ message: 'Ключ удалён' });
  } catch (error) {
    return NextResponse.json({ error: 'Ошибка сервера' }, { status: 500 });
  }
}