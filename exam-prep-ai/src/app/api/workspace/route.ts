import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { authOptions } from "@/lib/auth-options";
import { prisma } from "@/lib/prisma";

type WorkspacePayload = {
  sourceLibrary?: unknown;
  activeSourceId?: string | null;
  sourceText?: string;
  cover?: unknown;
  drafts?: unknown;
};

const toJsonValue = (value: unknown) => {
  if (value === undefined) {
    return undefined;
  }
  if (value === null) {
    return Prisma.JsonNull;
  }
  return value as Prisma.InputJsonValue;
};

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const workspace = await prisma.userWorkspace.findUnique({
    where: { userId: session.user.id },
  });

  return NextResponse.json({ workspace });
}

export async function PUT(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await req.json()) as WorkspacePayload;

  const workspace = await prisma.userWorkspace.upsert({
    where: { userId: session.user.id },
    create: {
      userId: session.user.id,
      sourceLibrary: toJsonValue(body.sourceLibrary),
      activeSourceId: body.activeSourceId ?? null,
      sourceText: body.sourceText ?? "",
      cover: toJsonValue(body.cover),
      drafts: toJsonValue(body.drafts),
    },
    update: {
      sourceLibrary: toJsonValue(body.sourceLibrary),
      activeSourceId: body.activeSourceId ?? null,
      sourceText: body.sourceText ?? "",
      cover: toJsonValue(body.cover),
      drafts: toJsonValue(body.drafts),
    },
  });

  return NextResponse.json({ ok: true, updatedAt: workspace.updatedAt });
}
