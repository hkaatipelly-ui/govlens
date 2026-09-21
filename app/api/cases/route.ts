import { NextResponse } from "next/server";
import { getCaseStore, storageKind } from "@/app/lib/case-management";
import type { DocumentAnalysis } from "@/app/types/document-extraction";
import type { KnowledgeChunk } from "@/app/types/knowledge-chunk";
import type { ChecklistItem } from "@/app/types/checklist-item";

export async function GET() {
  try {
    const store = getCaseStore();
    return NextResponse.json({ cases: store.list(), storage: storageKind() });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Could not list cases." },
      { status: 500 }
    );
  }
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as {
      documentText?: string;
      ocrConfidence?: number;
      analysis?: DocumentAnalysis;
      evidence?: KnowledgeChunk[];
      checklist?: ChecklistItem[];
      language?: "en" | "te" | "hi";
      userNote?: string;
    };
    if (!body.documentText?.trim() || !body.analysis) {
      return NextResponse.json(
        { error: "Case needs documentText and analysis. Analyze the document first." },
        { status: 400 }
      );
    }
    const store = getCaseStore();
    const created = store.create({
      documentText: body.documentText,
      ocrConfidence: body.ocrConfidence,
      analysis: body.analysis,
      evidence: body.evidence ?? [],
      checklist: body.checklist ?? [],
      language: body.language ?? "en",
      userNote: body.userNote,
    });
    return NextResponse.json({ case: created }, { status: 201 });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Could not create case." },
      { status: 500 }
    );
  }
}
