import { describe, it, expect } from "vitest";
import { openTestDatabase } from "@/lib/db/database";
import { migrate } from "@/lib/db/migrations";
import { getSessionService } from "@/lib/sessions/SessionService";
import { getCaseService } from "@/lib/cases/CaseService";
import { verifyCaseworkerCode } from "@/lib/auth/identity";
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

    const a = sessions.create({ documentText: "Document A text", language: "en", ownerId: "owner-a" });
    const b = sessions.create({ documentText: "Document B text", language: "te", ownerId: "owner-b" });

    sessions.addMessage(a.id, { role: "user", content: "deadline?", grounded: null }, "owner-a");
    sessions.addMessage(a.id, { role: "assistant", content: "7 days", grounded: true }, "owner-a");

    // B sees none of A's context
    expect(sessions.get(b.id, "owner-b")!.documentText).toBe("Document B text");
    expect(sessions.history(b.id, "owner-b")).toEqual([]);
    expect(sessions.history(a.id, "owner-a")).toHaveLength(2);
  });

  it("owner scoping blocks cross-user session access", () => {
    const db = openTestDatabase();
    migrate(db);
    const sessions = getSessionService(db);
    const a = sessions.create({ documentText: "Secret A", language: "en", ownerId: "owner-a" });
    // Another owner cannot read it (null → route returns 404)
    expect(sessions.get(a.id, "owner-b")).toBeNull();
    expect(sessions.history(a.id, "owner-b")).toEqual([]);
    // And cannot hijack the session id for a new document
    expect(() =>
      sessions.create({ documentText: "Other text", language: "en", sessionId: a.id, ownerId: "owner-b" })
    ).toThrow();
  });

  it("re-analyzing the same document reuses the session id", () => {
    const db = openTestDatabase();
    migrate(db);
    const sessions = getSessionService(db);
    const first = sessions.create({ documentText: "Same text", language: "en", ownerId: "o" });
    const second = sessions.create({ documentText: "Same text", language: "en", sessionId: first.id, ownerId: "o" });
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
      ownerId: "owner-a",
      originalText: "Ack receipt MSC1",
      extraction: extraction(),
      evidence: [],
      checklist: [{ id: "item-1", label: "Arrange: Aadhaar card", done: false }],
    });
    expect(created.status).toBe("open");
    expect(created.title).toContain("MSC1");
    expect(created.requiredDocuments).toEqual(["Aadhaar card"]);

    // Owner-scoped list/detail; another owner sees nothing (null → 404)
    expect(cases.list("owner-a")).toHaveLength(1);
    expect(cases.list("owner-b")).toHaveLength(0);
    expect(cases.get(created.id, "owner-a")!.summary).toContain("Acknowledgement");
    expect(cases.get(created.id, "owner-b")).toBeNull();
    // Caseworker view still sees everything
    expect(cases.listAll()).toHaveLength(1);

    const updated = cases.updateStatus(created.id, "completed", "owner-a");
    expect(updated!.status).toBe("completed");
    expect(cases.updateStatus(created.id, "open", "owner-b")).toBeNull();
    expect(cases.get("missing", "owner-a")).toBeNull();
  });

  it("caseworker code verification is timing-safe and rejects wrong codes", () => {
    expect(verifyCaseworkerCode("definitely-wrong-code")).toBe(false);
  });
});
