import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

// Armazena ultimos webhooks recebidos para debug
const logs: { timestamp: string; body: any }[] = [];

export async function POST(req: NextRequest) {
  try {
    const body = await req.text();
    const entry = {
      timestamp: new Date().toISOString(),
      body: body,
    };
    logs.push(entry);
    // Mantem apenas os ultimos 20
    if (logs.length > 20) logs.shift();
    return NextResponse.json({ status: "ok" });
  } catch (error: any) {
    return NextResponse.json({ status: "ok" });
  }
}

export async function GET() {
  return NextResponse.json({
    total: logs.length,
    logs: logs.slice(-10),
  });
}
