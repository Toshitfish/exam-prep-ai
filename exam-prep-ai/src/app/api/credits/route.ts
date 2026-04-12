import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";
import { prisma } from "@/lib/prisma";

type CreditBody = {
  amount?: number;
  feature?: string;
  mode?: "check" | "consume";
};

const INFINITE_CREDITS_BALANCE = 1_000_000_000;

const parseCsvEnv = (value: string | undefined) =>
  (value ?? "")
    .split(",")
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);

const isInfiniteCreditsAccount = (userId: string, email?: string | null) => {
  const configuredEmails = [
    ...parseCsvEnv(process.env.INFINITE_CREDITS_EMAILS),
    ...parseCsvEnv(process.env.INFINITE_CREDITS_EMAIL),
  ];
  const configuredUserIds = [
    ...parseCsvEnv(process.env.INFINITE_CREDITS_USER_IDS),
    ...parseCsvEnv(process.env.INFINITE_CREDITS_USER_ID),
  ];

  const normalizedUserId = userId.trim().toLowerCase();
  const normalizedEmail = (email ?? "").trim().toLowerCase();

  return configuredUserIds.includes(normalizedUserId) || (normalizedEmail ? configuredEmails.includes(normalizedEmail) : false);
};

const parseAmount = (raw: unknown) => {
  if (typeof raw !== "number" || !Number.isFinite(raw)) {
    return null;
  }

  const normalized = Math.floor(raw);
  if (normalized <= 0) {
    return null;
  }

  return normalized;
};

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (isInfiniteCreditsAccount(session.user.id, session.user.email)) {
    return NextResponse.json({ credits: INFINITE_CREDITS_BALANCE, infinite: true });
  }

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { credits: true },
  });

  if (!user) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  return NextResponse.json({ credits: user.credits, infinite: false });
}

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (isInfiniteCreditsAccount(session.user.id, session.user.email)) {
    const body = (await req.json().catch(() => ({}))) as CreditBody;
    const feature = typeof body.feature === "string" ? body.feature.trim().slice(0, 120) : "tool";
    return NextResponse.json({ ok: true, credits: INFINITE_CREDITS_BALANCE, charged: 0, feature, infinite: true });
  }

  const body = (await req.json().catch(() => ({}))) as CreditBody;
  const amount = parseAmount(body.amount);
  const mode = body.mode ?? "check";

  if (!amount) {
    return NextResponse.json({ error: "Invalid amount" }, { status: 400 });
  }

  const feature = typeof body.feature === "string" ? body.feature.trim().slice(0, 120) : "tool";

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { credits: true },
  });

  if (!user) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  if (mode === "check") {
    if (user.credits < amount) {
      return NextResponse.json(
        { error: `Not enough credits for ${feature}.`, credits: user.credits, required: amount },
        { status: 409 },
      );
    }

    return NextResponse.json({ ok: true, credits: user.credits, required: amount, feature });
  }

  if (mode !== "consume") {
    return NextResponse.json({ error: "Invalid mode" }, { status: 400 });
  }

  const updateResult = await prisma.user.updateMany({
    where: {
      id: session.user.id,
      credits: { gte: amount },
    },
    data: {
      credits: { decrement: amount },
    },
  });

  if (updateResult.count === 0) {
    const latest = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { credits: true },
    });

    return NextResponse.json(
      {
        error: `Not enough credits for ${feature}.`,
        credits: latest?.credits ?? 0,
        required: amount,
      },
      { status: 409 },
    );
  }

  const latest = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { credits: true },
  });

  return NextResponse.json({ ok: true, credits: latest?.credits ?? 0, charged: amount, feature });
}
