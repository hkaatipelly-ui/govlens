import { describe, it, expect } from "vitest";
import { openTestDatabase } from "@/lib/db/database";
import { migrate } from "@/lib/db/migrations";
import { getSessionService } from "@/lib/sessions/SessionService";
import { getCaseService } from "@/lib/cases/CaseService";
import { SourceService } from "@/lib/sources/SourceService";
import { LocalKnowledgeEngine } from "@/lib/knowledge/LocalKnowledgeEngine";
import type { DocumentExtraction } from "@/lib/extraction/schemas";

function extraction(overrides: Partial<DocumentExtraction> = {}): DocumentExtraction {
  return {
    documentType: "Income Certificate",
    title: null,
    organization: "Revenue Department",
    summary: "Acknowledgement for income certificate.",
    deadline: "7 days",
    amount: "Rs 45",
    referenceNumber: "MSC1",
    requiredDocuments: ["Aadhaar card"],
    requiredActions: ["Visit counter"],
    warningSignals: [],
    language: "en",
    sourceIds: ["tg-meeseva-income-cert"],
    ...overrides,
  };
}

describe("session isolation", () => {
  it("two sessions keep separate documents and histories", () => {
    const db = openTestDatabase();
    migrate(db);
    const sessions = getSessionService(db);

    const a = sessions.create({ documentText: "Document A text", language: "en" });
    const b = sessions.create({ documentText: "Document B text", language: "te" });

    sessions.addMessage(a.id, { role: "user", content: "deadline?", grounded: null });
    sessions.addMessage(a.id, { role: "assistant", content: "7 days", grounded: true });

    // B sees none of A's context
    expect(sessions.get(b.id)!.documentText).toBe("Document B text");
    expect(sessions.history(b.id)).toEqual([]);
    expect(sessions.history(a.id)).toHaveLength(2);
  });

  it("re-analyzing the same document reuses the session id", () => {
    const db = openTestDatabase();
    migrate(db);
    const sessions = getSessionService(db);
    const first = sessions.create({ documentText: "Same text", language: "en" });
    const second = sessions.create({ documentText: "Same text", language: "en", sessionId: first.id });
    expect(second.id).toBe(first.id);
  });
});

describe("source traceability", () => {
  it("getSources returns real metadata and skips unknown ids", async () => {
    const db = openTestDatabase();
    migrate(db);
    void new LocalKnowledgeEngine(db); // seeds corpus
    const svc = new SourceService(db);
    const sources = await svc.getSources(["tg-meeseva-income-cert", "no-such-id"]);
    expect(sources).toHaveLength(1);
    expect(sources[0].title).toContain("Income Certificate");
    expect(sources[0].lastVerified).toMatch(/20\d\d/);
    expect(sources[0].sourceUrl).toContain("http");
  });
});

describe("case service", () => {
  it("creates, lists, reads and patches status", () => {
    const db = openTestDatabase();
    migrate(db);
    const cases = getCaseService(db);

    const created = cases.create({
      sessionId: "sess-1",
      originalText: "Ack receipt MSC1",
      extraction: extraction(),
      evidence: [],
      checklist: [{ id: "item-1", label: "Arrange: Aadhaar card", done: false }],
    });
    expect(created.status).toBe("open");
    expect(created.title).toContain("MSC1");
    expect(created.requiredDocuments).toEqual(["Aadhaar card"]);

    expect(cases.list()).toHaveLength(1);
    expect(cases.get(created.id)!.summary).toContain("Acknowledgement");

    const updated = cases.updateStatus(created.id, "completed");
    expect(updated!.status).toBe("completed");
    expect(cases.get("missing")).toBeNull();
  });
});
