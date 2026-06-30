import { NextRequest, NextResponse } from 'next/server';
import { verifyEmailToken } from '@/lib/auth';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { token } = body;

    if (!token) {
      return NextResponse.json({ error: 'Verification token is required' }, { status: 400 });
    }

    const success = await verifyEmailToken(token);
    if (!success) {
      return NextResponse.json({ error: 'Invalid or expired verification token' }, { status: 400 });
    }

    return NextResponse.json({ message: 'Email verified successfully!' });
  } catch (error) {
    console.error('Verification error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}