import {
  defaultCardFilter,
  formatDueDate,
  isCardFilterActive,
  isOverdue,
  matchesCardFilter,
  moveCard,
  type Card,
  type Column,
} from "@/lib/kanban";

describe("moveCard", () => {
  const baseColumns: Column[] = [
    { id: "col-a", title: "A", cardIds: ["card-1", "card-2"] },
    { id: "col-b", title: "B", cardIds: ["card-3"] },
  ];

  it("reorders cards in the same column", () => {
    const result = moveCard(baseColumns, "card-2", "card-1");
    expect(result[0].cardIds).toEqual(["card-2", "card-1"]);
  });

  it("moves cards to another column", () => {
    const result = moveCard(baseColumns, "card-2", "card-3");
    expect(result[0].cardIds).toEqual(["card-1"]);
    expect(result[1].cardIds).toEqual(["card-2", "card-3"]);
  });

  it("drops cards to the end of a column", () => {
    const result = moveCard(baseColumns, "card-1", "col-b");
    expect(result[0].cardIds).toEqual(["card-2"]);
    expect(result[1].cardIds).toEqual(["card-3", "card-1"]);
  });
});

describe("isOverdue", () => {
  it("returns false for a missing due date", () => {
    expect(isOverdue(null)).toBe(false);
    expect(isOverdue(undefined)).toBe(false);
  });

  it("returns true for a date in the past", () => {
    expect(isOverdue("2000-01-01")).toBe(true);
  });

  it("returns false for a date in the future", () => {
    expect(isOverdue("2999-01-01")).toBe(false);
  });
});

describe("formatDueDate", () => {
  it("formats an ISO date as a short month and day", () => {
    expect(formatDueDate("2026-09-30")).toBe(
      new Date("2026-09-30T00:00:00").toLocaleDateString(undefined, { month: "short", day: "numeric" })
    );
  });
});

describe("isCardFilterActive", () => {
  it("is false for the default filter", () => {
    expect(isCardFilterActive(defaultCardFilter)).toBe(false);
  });

  it("is true when any field diverges from the default", () => {
    expect(isCardFilterActive({ ...defaultCardFilter, text: "foo" })).toBe(true);
    expect(isCardFilterActive({ ...defaultCardFilter, priority: "high" })).toBe(true);
    expect(isCardFilterActive({ ...defaultCardFilter, overdueOnly: true })).toBe(true);
  });
});

describe("matchesCardFilter", () => {
  const card: Card = {
    id: "card-1",
    title: "Align roadmap themes",
    details: "Draft quarterly themes with impact statements.",
    dueDate: "2000-01-01",
    priority: "high",
  };

  it("matches everything under the default filter", () => {
    expect(matchesCardFilter(card, defaultCardFilter)).toBe(true);
  });

  it("matches text against title or details, case-insensitively", () => {
    expect(matchesCardFilter(card, { ...defaultCardFilter, text: "roadmap" })).toBe(true);
    expect(matchesCardFilter(card, { ...defaultCardFilter, text: "IMPACT" })).toBe(true);
    expect(matchesCardFilter(card, { ...defaultCardFilter, text: "nope" })).toBe(false);
  });

  it("filters by priority", () => {
    expect(matchesCardFilter(card, { ...defaultCardFilter, priority: "high" })).toBe(true);
    expect(matchesCardFilter(card, { ...defaultCardFilter, priority: "low" })).toBe(false);
  });

  it("filters by overdue-only", () => {
    expect(matchesCardFilter(card, { ...defaultCardFilter, overdueOnly: true })).toBe(true);
    expect(
      matchesCardFilter({ ...card, dueDate: "2999-01-01" }, { ...defaultCardFilter, overdueOnly: true })
    ).toBe(false);
  });

  it("combines all filter criteria", () => {
    expect(
      matchesCardFilter(card, { text: "roadmap", priority: "high", overdueOnly: true })
    ).toBe(true);
    expect(
      matchesCardFilter(card, { text: "roadmap", priority: "low", overdueOnly: true })
    ).toBe(false);
  });
});
