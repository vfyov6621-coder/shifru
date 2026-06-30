import { NextRequest, NextResponse } from 'next/server';
import { getSessionUser, getChannelDecryptionKey, getUserByApiKey, getChannelDecryptionKeyByApiKey } from '@/lib/auth';
import { cyclicEncrypt } from '@/lib/crypto';
import { db } from '@/lib/db';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { data, channelId, password } = body;

    if (!data || !channelId) {
      return NextResponse.json({ error: 'Data and channelId are required' }, { status: 400 });
    }

    let channelKey: Buffer;
    let userId: string;

    // Check auth: Bearer JWT or API key
    const authHeader = req.headers.get('authorization');
    const apiKeyHeader = req.headers.get('x-api-key');

    if (authHeader?.startsWith('Bearer ')) {
      // JWT auth (web UI) — needs password to derive channel key
      const session = await getSessionUser(req);
      if (!session) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
      }
      if (!password) {
        return NextResponse.json({ error: 'Password is required for web UI encryption' }, { status: 400 });
      }
      userId = session.userId;
      channelKey = await getChannelDecryptionKey(channelId, userId, password);
    } else if (apiKeyHeader) {
      // API key auth (external API) — uses server key
      userId = (await getUserByApiKey(apiKeyHeader))?.id || '';
      if (!userId) {
        return NextResponse.json({ error: 'Invalid API key' }, { status: 401 });
      }
      channelKey = await getChannelDecryptionKeyByApiKey(channelId, apiKeyHeader);
    } else {
      return NextResponse.json({ error: 'Authorization required (Bearer token or X-API-Key header)' }, { status: 401 });
    }

    // Get channel rounds
    const channel = await db.channel.findUnique({ where: { id: channelId } });
    if (!channel) {
      return NextResponse.json({ error: 'Channel not found' }, { status: 404 });
    }

    const result = cyclicEncrypt(data, channelKey, channel.rounds);

    // Log the operation
    await db.encryptionLog.create({
      data: {
        action: 'encrypt',
        channelId,
        userId,
        inputLen: typeof data === 'string' ? data.length : (data as ArrayBuffer).byteLength,
        outputLen: result.data.length,
      },
    });

    return NextResponse.json({
      encrypted: result.data,
      rounds: result.rounds,
      version: result.version,
      channelId,
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Internal server error';
    console.error('Encrypt error:', error);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}