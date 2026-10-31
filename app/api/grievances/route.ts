import { NextResponse } from "next/server";
import { parseOrError, createGrievanceRequestSchema } from "@/lib/validation/apiSchemas";
import { getGrievanceService } from "@/lib/grievances/GrievanceService";
import { getOrCreateUserId } from "@/lib/auth/identity";

export async function GET(req: Request) {
  try {
    const ownerId = getOrCreateUserId();
    const url = new URL(req.url);
    const limit = Number(url.searchParams.get("limit") ?? "20");
    const offset = Number(url.searchParams.get("offset") ?? "0");
    const result = getGrievanceService().list(ownerId, limit, offset);
    return NextResponse.json({ grievances: result.items, total: result.total });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Could not list grievances." },
      { status: 500 }
    );
  }
}

export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request: body must be JSON." }, { status: 400 });
  }
  const parsed = parseOrError(createGrievanceRequestSchema, body);
  if (!parsed.ok) return NextResponse.json({ error: parsed.message }, { status: 400 });

  try {
    const ownerId = getOrCreateUserId();
    const idempotencyKey =
      req.headers.get("Idempotency-Key")?.trim() ?? parsed.data.idempotencyKey;
    const svc = getGrievanceService();
    const hint = svc.duplicateHint(ownerId, parsed.data.subject, parsed.data.description, parsed.data.category, parsed.data.location);
    const created = svc.create({
      ownerId,
      subject: parsed.data.subject,
      description: parsed.data.description,
      category: parsed.data.category,
      location: parsed.data.location,
      source: parsed.data.source ?? "public-service",
      attachments: parsed.data.attachments,
      idempotencyKey,
    });
    return NextResponse.json(
      {
        grievance: {
          id: created.id,
          referenceNumber: created.referenceNumber,
          subject: created.subject,
          category: created.category,
          status: created.status,
          createdAt: created.createdAt,
        },
        duplicateWarning: hint.possible
          ? "A similar grievance may already be recorded. Review it before submitting again."
          : undefined,
      },
      { status: 201 }
    );
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Could not create grievance." },
      { status: 500 }
    );
  }
}
