import { describe, it, expect } from "vitest";
import { splitContent, chunkSource, extractKeywords } from "@/lib/knowledge/chunker";
import { normalize, tokenize, scoreText } from "@/lib/knowledge/search";
import { LocalKnowledgeEngine } from "@/lib/knowledge/LocalKnowledgeEngine";
import { openTestDatabase } from "@/lib/db/database";
import { migrate } from "@/lib/db/migrations";

describe("chunker", () => {
  it("splits long text into bounded chunks", () => {
    const text = Array(40).fill("The applicant must submit the Aadhaar card at the MeeSeva counter.").join(" ");
    const chunks = splitContent(text);
    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks.every((c) => c.length <= 800)).toBe(true);
  });

  it("keeps short text as one chunk", () => {
    expect(splitContent("Short notice.")).toEqual(["Short notice."]);
  });

  it("chunkSource tags document id + keywords", () => {
    const chunks = chunkSource({
      id: "test-doc",
      title: "Income Certificate",
      department: "Revenue",
      state: "Telangana",
      type: "certificate",
      sourceUrl: "https://example.in",
      language: "en",
      publishedDate: "2024-01-01",
      effectiveDate: "2024-01-01",
      lastVerified: "2026-01-01",
      text: "Income certificate issued by Tahsildar through MeeSeva centres.",
    });
    expect(chunks.length).toBe(1);
    expect(chunks[0].documentId).toBe("test-doc");
    expect(chunks[0].keywords).toContain("income");
  });

  it("extractKeywords drops stop words", () => {
    expect(extractKeywords("the and for income certificate")).toContain("income");
    expect(extractKeywords("the and for")).toEqual([]);
  });
});

describe("search primitives", () => {
  it("normalize/tokenize handle English + Telugu", () => {
    expect(normalize("  Income   Certificate ")).toBe("income certificate");
    expect(tokenize("రేషన్ కార్డు ration")).toContain("ration");
  });

  it("scoreText weights title matches", () => {
    const tokens = ["income", "certificate"];
    const titleHit = scoreText(tokens, "income certificate office", "Income Certificate Guide");
    const bodyHit = scoreText(tokens, "income certificate office", "Unrelated Pamphlet");
    expect(titleHit.score).toBeGreaterThan(bodyHit.score);
    expect(titleHit.matched).toContain("income");
  });
});

describe("LocalKnowledgeEngine retrieval", () => {
  it("ranks the income-certificate doc for an income query", async () => {
    const db = openTestDatabase();
    migrate(db);
    const engine = new LocalKnowledgeEngine(db);
    const hits = await engine.search("income certificate MeeSeva application acknowledgement");
    expect(hits.length).toBeGreaterThan(0);
    expect(hits[0].documentId).toBe("tg-meeseva-income-cert");
    expect(hits[0].sourceMetadata.department).toContain("Telangana");
  });

  it("returns nothing for gibberish", async () => {
    const db = openTestDatabase();
    migrate(db);
    const engine = new LocalKnowledgeEngine(db);
    expect(await engine.search("xyzzy qqqqq zzzzzz")).toEqual([]);
  });

  it("resolves full source content for traceability", async () => {
    const db = openTestDatabase();
    migrate(db);
    const engine = new LocalKnowledgeEngine(db);
    const src = await engine.getSource("goi-pmkisan");
    expect(src.title).toContain("PM-KISAN");
    expect(src.content.length).toBeGreaterThan(50);
  });
});
