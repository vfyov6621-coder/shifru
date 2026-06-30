import { NextRequest, NextResponse } from 'next/server';
import { getSessionUser, getChannelDecryptionKey, getUserByApiKey, getChannelDecryptionKeyByApiKey } from '@/lib/auth';
import { cyclicDecrypt } from '@/lib/crypto';
import { db } from '@/lib/db';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { encrypted, channelId, rounds, password } = body;

    if (!encrypted || !channelId || !rounds) {
      return NextResponse.json({ error: 'Encrypted data, channelId, and rounds are required' }, { status: 400 });
    }

    let channelKey: Buffer;
    let userId: string;

    const authHeader = req.headers.get('authorization');
    const apiKeyHeader = req.headers.get('x-api-key');

    if (authHeader?.startsWith('Bearer ')) {
      const session = await getSessionUser(req);
      if (!session) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
      }
      if (!password) {
        return NextResponse.json({ error: 'Password is required for web UI decryption' }, { status: 400 });
      }
      userId = session.userId;
      channelKey = await getChannelDecryptionKey(channelId, userId, password);
    } else if (apiKeyHeader) {
      const user = await getUserByApiKey(apiKeyHeader);
      if (!user) {
        return NextResponse.json({ error: 'Invalid API key' }, { status: 401 });
      }
      userId = user.id;
      channelKey = await getChannelDecryptionKeyByApiKey(channelId, apiKeyHeader);
    } else {
      return NextResponse.json({ error: 'Authorization required' }, { status: 401 });
    }

    const result = cyclicDecrypt(
      { data: encrypted, rounds, version: 1 },
      channelKey
    );

    const decrypted = result.toString('utf-8');

    await db.encryptionLog.create({
      data: {
        action: 'decrypt',
        channelId,
        userId,
        inputLen: encrypted.length,
        outputLen: decrypted.length,
      },
    });

    return NextResponse.json({
      decrypted,
      channelId,
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Decryption failed — data may be corrupted or wrong channel/key';
    console.error('Decrypt error:', error);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}