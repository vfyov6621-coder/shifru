import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSessionUser, createChatForUser } from '@/lib/auth';

export async function GET(req: NextRequest) {
  try {
    const session = await getSessionUser(req);
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const chats = await db.chat.findMany({
      where: { ownerId: session.userId },
      select: {
        id: true, name: true, createdAt: true,
        _count: { select: { encryptionLogs: true } },
        members: { select: { id: true, login: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    return NextResponse.json({ chats });
  } catch (error) {
    console.error('Get chats error:', error);
    return NextResponse.json({ error: 'Ошибка сервера' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await getSessionUser(req);
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { name, password } = await req.json();
    if (!name || !password) {
      return NextResponse.json({ error: 'Название и пароль обязательны' }, { status: 400 });
    }

    const chat = await createChatForUser(session.userId, name, password);
    return NextResponse.json({
      chat: { id: chat.id, name: chat.name, createdAt: chat.createdAt },
    }, { status: 201 });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Ошибка сервера';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const session = await getSessionUser(req);
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { searchParams } = new URL(req.url);
    const chatId = searchParams.get('id');
    if (!chatId) return NextResponse.json({ error: 'ID чата обязателен' }, { status: 400 });

    const chat = await db.chat.findFirst({ where: { id: chatId, ownerId: session.userId } });
    if (!chat) return NextResponse.json({ error: 'Чат не найден' }, { status: 404 });

    await db.chat.delete({ where: { id: chatId } });
    return NextResponse.json({ message: 'Чат удалён' });
  } catch (error) {
    return NextResponse.json({ error: 'Ошибка сервера' }, { status: 500 });
  }
}