import { NextResponse } from "next/server";
import { checkOllamaHealth } from "@/app/lib/ai-engine";
import { storageKind } from "@/app/lib/case-management";

export async function GET() {
  const health = await checkOllamaHealth();
  return NextResponse.json({ ...health, storage: storageKind() });
}
