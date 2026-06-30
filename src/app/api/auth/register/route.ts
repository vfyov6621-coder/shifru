import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { hashPassword, createToken, createVerificationToken } from '@/lib/auth';
import { generateMasterKey } from '@/lib/crypto';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { email, password, name } = body;

    if (!email || !password) {
      return NextResponse.json({ error: 'Email and password are required' }, { status: 400 });
    }

    if (password.length < 8) {
      return NextResponse.json({ error: 'Password must be at least 8 characters' }, { status: 400 });
    }

    const existing = await db.user.findUnique({ where: { email } });
    if (existing) {
      return NextResponse.json({ error: 'Email already registered' }, { status: 409 });
    }

    const { salt } = generateMasterKey();
    const masterKeySalt = salt;
    const passwordHash = await hashPassword(password);

    const user = await db.user.create({
      data: {
        email,
        name: name || null,
        passwordHash,
        masterKeySalt,
      },
    });

    const verificationToken = await createVerificationToken(user.id);

    return NextResponse.json({
      message: 'Registration successful. Please verify your email.',
      userId: user.id,
      verificationToken,
    }, { status: 201 });
  } catch (error) {
    console.error('Registration error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}