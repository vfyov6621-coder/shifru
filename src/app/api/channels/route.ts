import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSessionUser, createChatForUser } from '@/lib/auth';

export async function GET(req: NextRequest) {
  try {
    const session = await getSessionUser(req);
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    // Get chats where user is a member
    const chats = await db.chat.findMany({
      where: { members: { some: { id: session.userId } } },
    });

    // For each chat, get member logins and counts
    const enriched = await Promise.all(chats.map(async (chat: any) => {
      const members = await db.execute(
        `SELECT u.id, u.login FROM "User" u
         INNER JOIN "_ChatToUser" ctu ON ctu."B" = u.id
         WHERE ctu."A" = ?`,
        [chat.id]
      );

      const logCount = (await db.execute(
        'SELECT COUNT(*) as c FROM "EncryptionLog" WHERE "chatId" = ?',
        [chat.id]
      )).rows[0]?.c ?? 0;

      return {
        id: chat.id,
        name: chat.name,
        isGroup: Boolean(chat.isGroup),
        createdAt: chat.createdAt,
        _count: {
          encryptionLogs: Number(logCount),
          members: members.rows.length,
        },
        members: members.rows.map((r: any) => ({ id: r.id, login: r.login })),
      };
    }));

    return NextResponse.json({ chats: enriched });
  } catch (error) {
    console.error('Get chats error:', error);
    return NextResponse.json({ error: 'Ошибка сервера' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await getSessionUser(req);
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { name, password, memberIds } = await req.json();
    if (!name || !password) {
      return NextResponse.json({ error: 'Название и пароль обязательны' }, { status: 400 });
    }

    const chat = await createChatForUser(session.userId, name, password, memberIds || []);
    return NextResponse.json({
      chat: { id: chat.id, name: chat.name, isGroup: chat.isGroup, createdAt: chat.createdAt },
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