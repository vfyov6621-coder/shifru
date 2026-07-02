import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSessionUser } from '@/lib/auth';

// GET /api/users?search=abc — search verified users (for adding to chats)
export async function GET(req: NextRequest) {
  try {
    const session = await getSessionUser(req);
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { searchParams } = new URL(req.url);
    const search = searchParams.get('search') || '';

    let sql = 'SELECT id, login FROM "User" WHERE id != ? AND "isVerified" = 1';
    const args: any[] = [session.userId];

    if (search) {
      sql += ' AND login LIKE ?';
      args.push(`%${search}%`);
    }

    sql += ' LIMIT 20';

    const r = await db.execute(sql, args);
    const users = r.rows.map((row: any) => ({ id: row.id, login: row.login }));

    return NextResponse.json({ users });
  } catch (error) {
    console.error('Users search error:', error);
    return NextResponse.json({ error: 'Ошибка сервера' }, { status: 500 });
  }
}