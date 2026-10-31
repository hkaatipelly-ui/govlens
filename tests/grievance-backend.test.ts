import { describe, it, expect, beforeEach, vi } from "vitest";
import { openTestDatabase } from "@/lib/db/database";
import { migrate } from "@/lib/db/migrations";
import { GrievanceService, ALLOWED_TRANSITIONS } from "@/lib/grievances/GrievanceService";

function freshService() {
  const db = openTestDatabase();
  migrate(db);
  return new GrievanceService(db);
}

const validInput = (ownerId: string, over: any = {}) => ({
  ownerId,
  subject: "No water supply for 3 days",
  description: "Our lane has had no water since Monday evening.",
  category: "Water supply",
  location: "Ward 12",
  ...over,
});

describe("Phase 5 — grievance service", () => {
  it("creates a persisted grievance with a unique GL reference", () => {
    const svc = freshService();
    const g = svc.create(validInput("user-a"));
    expect(g.referenceNumber).toMatch(/^GL-[A-Z2-9]{4}-[A-Z2-9]{4}$/);
    expect(g.status).toBe("SUBMITTED");
    // re-fetch via get (same owner) returns stored record
    const again = svc.get(g.id, "user-a");
    expect(again?.subject).toBe("No water supply for 3 days");
    expect(again?.referenceNumber).toBe(g.referenceNumber);
  });

  it("records an initial SUBMITTED status history entry", () => {
    const svc = freshService();
    const g = svc.create(validInput("user-a"));
    const h = svc.history(g.id, "user-a")!;
    expect(h.status).toBe("SUBMITTED");
    expect(h.history).toHaveLength(1);
    expect(h.history[0].newStatus).toBe("SUBMITTED");
    expect(h.history[0].previousStatus).toBeNull();
    // internal note not exposed to citizen view
    expect(h.history[0].internalNote).toBeUndefined();
  });

  it("rejects invalid/missing inputs", () => {
    const svc = freshService();
    expect(() => svc.create(validInput("u", { subject: "" }) as any)).toThrow();
    expect(() => svc.create(validInput("u", { description: "" }) as any)).toThrow();
    expect(() => svc.create(validInput("u", { category: "" }) as any)).toThrow();
    expect(() => svc.create(validInput("u", { subject: "x".repeat(201) }) as any)).toThrow();
  });

  it("enforces ownership on get/history", () => {
    const svc = freshService();
    const g = svc.create(validInput("user-a"));
    expect(svc.get(g.id, "user-b")).toBeNull();
    expect(svc.history(g.id, "user-b")).toBeNull();
    expect(svc.list("user-b").items).toHaveLength(0);
  });

  it("paginates and sorts the caller's grievances only", () => {
    const svc = freshService();
    for (let i = 0; i < 5; i++) svc.create(validInput("user-a", { subject: `s${i}` }));
    svc.create(validInput("user-b"));
    const page = svc.list("user-a", 2, 0);
    expect(page.total).toBe(5);
    expect(page.items).toHaveLength(2);
    const all = svc.list("user-a", 50, 0).items;
    expect(all.map((g) => g.ownerId).every((o) => o === "user-a")).toBe(true);
  });

  it("supports valid status transitions and chains history", () => {
    const svc = freshService();
    const g = svc.create(validInput("user-a"));
    const g2 = svc.updateStatus(g.id, "user-a", "UNDER_REVIEW", "actor1", "caseworker", "Under review by dept.", "internal detail");
    expect(g2?.status).toBe("UNDER_REVIEW");
    const h = svc.history(g.id, "user-a")!;
    expect(h.history).toHaveLength(2);
    expect(h.history[1].publicMessage).toBe("Under review by dept.");
    expect(h.history[1].internalNote).toBeUndefined(); // citizen view excludes internal

    // caseworker-privileged history includes internal note
    const priv = svc.history(g.id, "user-a", true)!;
    expect(priv.history[1].internalNote).toBe("internal detail");
  });

  it("rejects invalid transitions", () => {
    const svc = freshService();
    const g = svc.create(validInput("user-a"));
    expect(() => svc.updateStatus(g.id, "user-a", "RESOLVED", "a", "caseworker")).toThrow(/Invalid transition/);
  });

  it("validates the transition map", () => {
    expect(ALLOWED_TRANSITIONS.SUBMITTED).toContain("UNDER_REVIEW");
    expect(ALLOWED_TRANSITIONS.CLOSED).toHaveLength(0);
  });

  it("creates distinct reference numbers for multiple grievances", () => {
    const svc = freshService();
    const refs = new Set<string>();
    for (let i = 0; i < 50; i++) refs.add(svc.create(validInput("user-a")).referenceNumber);
    expect(refs.size).toBe(50);
  });
});
