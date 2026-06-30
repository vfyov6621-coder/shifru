import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSessionUser } from '@/lib/auth';

export async function GET(req: NextRequest) {
  try {
    const session = await getSessionUser(req);
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const channels = await db.channel.findMany({
      where: { adminId: session.userId },
      select: {
        id: true,
        name: true,
        description: true,
        rounds: true,
        createdAt: true,
        _count: { select: { encryptionLogs: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    return NextResponse.json({ channels });
  } catch (error) {
    console.error('Get channels error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await getSessionUser(req);
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();
    const { name, description, rounds, password } = body;

    if (!name || !password) {
      return NextResponse.json({ error: 'Channel name and your password are required' }, { status: 400 });
    }

    const { createChannelForUser } = await import('@/lib/auth');
    const channel = await createChannelForUser(
      session.userId,
      name,
      description || null,
      password,
      rounds
    );

    return NextResponse.json({
      channel: {
        id: channel.id,
        name: channel.name,
        description: channel.description,
        rounds: channel.rounds,
        createdAt: channel.createdAt,
      },
    }, { status: 201 });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Internal server error';
    console.error('Create channel error:', error);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const session = await getSessionUser(req);
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const channelId = searchParams.get('id');

    if (!channelId) {
      return NextResponse.json({ error: 'Channel ID is required' }, { status: 400 });
    }

    const channel = await db.channel.findFirst({
      where: { id: channelId, adminId: session.userId },
    });

    if (!channel) {
      return NextResponse.json({ error: 'Channel not found' }, { status: 404 });
    }

    await db.channel.delete({ where: { id: channelId } });

    return NextResponse.json({ message: 'Channel deleted' });
  } catch (error) {
    console.error('Delete channel error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}