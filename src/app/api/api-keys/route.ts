import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSessionUser } from '@/lib/auth';
import { generateApiKey, hashApiKey } from '@/lib/crypto';

export async function GET(req: NextRequest) {
  try {
    const session = await getSessionUser(req);
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const keys = await db.apiKey.findMany({
      where: { userId: session.userId },
      select: {
        id: true,
        name: true,
        keyPrefix: true,
        lastUsed: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
    });

    return NextResponse.json({ keys });
  } catch (error) {
    console.error('Get API keys error:', error);
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
    const { name } = body;

    if (!name) {
      return NextResponse.json({ error: 'Key name is required' }, { status: 400 });
    }

    const rawKey = generateApiKey();
    const keyHash = hashApiKey(rawKey);
    const keyPrefix = rawKey.slice(0, 15) + '...';

    const apiKeyRecord = await db.apiKey.create({
      data: {
        name,
        keyHash,
        keyPrefix,
        userId: session.userId,
      },
    });

    return NextResponse.json({
      apiKey: rawKey,
      id: apiKeyRecord.id,
      name: apiKeyRecord.name,
      prefix: keyPrefix,
      message: 'Save this API key now — it will not be shown again!',
    }, { status: 201 });
  } catch (error) {
    console.error('Create API key error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const session = await getSessionUser(req);
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const keyId = searchParams.get('id');

    if (!keyId) {
      return NextResponse.json({ error: 'Key ID is required' }, { status: 400 });
    }

    const key = await db.apiKey.findFirst({
      where: { id: keyId, userId: session.userId },
    });

    if (!key) {
      return NextResponse.json({ error: 'API key not found' }, { status: 404 });
    }

    await db.apiKey.delete({ where: { id: keyId } });

    return NextResponse.json({ message: 'API key deleted' });
  } catch (error) {
    console.error('Delete API key error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}