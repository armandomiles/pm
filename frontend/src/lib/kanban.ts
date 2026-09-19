export type CardPriority = "low" | "medium" | "high";

export type Card = {
  id: string;
  title: string;
  details: string;
  dueDate?: string | null;
  priority?: CardPriority | null;
  assignee?: string | null;
};

export type Column = {
  id: string;
  title: string;
  cardIds: string[];
};

export type BoardData = {
  columns: Column[];
  cards: Record<string, Card>;
};

export const isOverdue = (dueDate: string | null | undefined): boolean => {
  if (!dueDate) {
    return false;
  }
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return new Date(`${dueDate}T00:00:00`) < today;
};

export const formatDueDate = (dueDate: string): string => {
  return new Date(`${dueDate}T00:00:00`).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
};

export type CardFilter = {
  text: string;
  priority: CardPriority | "all";
  overdueOnly: boolean;
  assignee: string | "all";
};

export const defaultCardFilter: CardFilter = {
  text: "",
  priority: "all",
  overdueOnly: false,
  assignee: "all",
};

export const isCardFilterActive = (filter: CardFilter): boolean =>
  filter.text.trim() !== "" || filter.priority !== "all" || filter.overdueOnly || filter.assignee !== "all";

export const matchesCardFilter = (card: Card, filter: CardFilter): boolean => {
  if (filter.priority !== "all" && card.priority !== filter.priority) {
    return false;
  }
  if (filter.overdueOnly && !isOverdue(card.dueDate)) {
    return false;
  }
  if (filter.assignee !== "all" && card.assignee !== filter.assignee) {
    return false;
  }
  const text = filter.text.trim().toLowerCase();
  if (text) {
    const haystack = `${card.title} ${card.details}`.toLowerCase();
    if (!haystack.includes(text)) {
      return false;
    }
  }
  return true;
};

export const initialData: BoardData = {
  columns: [
    { id: "col-backlog", title: "Backlog", cardIds: ["card-1", "card-2"] },
    { id: "col-discovery", title: "Discovery", cardIds: ["card-3"] },
    {
      id: "col-progress",
      title: "In Progress",
      cardIds: ["card-4", "card-5"],
    },
    { id: "col-review", title: "Review", cardIds: ["card-6"] },
    { id: "col-done", title: "Done", cardIds: ["card-7", "card-8"] },
  ],
  cards: {
    "card-1": {
      id: "card-1",
      title: "Align roadmap themes",
      details: "Draft quarterly themes with impact statements and metrics.",
    },
    "card-2": {
      id: "card-2",
      title: "Gather customer signals",
      details: "Review support tags, sales notes, and churn feedback.",
    },
    "card-3": {
      id: "card-3",
      title: "Prototype analytics view",
      details: "Sketch initial dashboard layout and key drill-downs.",
    },
    "card-4": {
      id: "card-4",
      title: "Refine status language",
      details: "Standardize column labels and tone across the board.",
    },
    "card-5": {
      id: "card-5",
      title: "Design card layout",
      details: "Add hierarchy and spacing for scanning dense lists.",
    },
    "card-6": {
      id: "card-6",
      title: "QA micro-interactions",
      details: "Verify hover, focus, and loading states.",
    },
    "card-7": {
      id: "card-7",
      title: "Ship marketing page",
      details: "Final copy approved and asset pack delivered.",
    },
    "card-8": {
      id: "card-8",
      title: "Close onboarding sprint",
      details: "Document release notes and share internally.",
    },
  },
};

export const moveCard = (
  columns: Column[],
  activeId: string,
  overId: string
): Column[] => {
  const droppedOnColumn = columns.some((column) => column.id === overId);
  const source = columns.find((column) => column.cardIds.includes(activeId));
  const target = droppedOnColumn
    ? columns.find((column) => column.id === overId)
    : columns.find((column) => column.cardIds.includes(overId));

  if (!source || !target) {
    return columns;
  }

  const nextSourceCardIds = source.cardIds.filter((cardId) => cardId !== activeId);
  // Within one column source and target are the same list, so the card is removed
  // before it is re-inserted; across columns the target keeps all of its cards.
  const nextTargetCardIds = source === target ? nextSourceCardIds : [...target.cardIds];
  const insertIndex = droppedOnColumn
    ? nextTargetCardIds.length
    : target.cardIds.indexOf(overId);
  nextTargetCardIds.splice(insertIndex, 0, activeId);

  return columns.map((column) => {
    if (column === target) {
      return { ...column, cardIds: nextTargetCardIds };
    }
    if (column === source) {
      return { ...column, cardIds: nextSourceCardIds };
    }
    return column;
  });
};

export const createId = (prefix: string) => {
  const randomPart = Math.random().toString(36).slice(2, 8);
  const timePart = Date.now().toString(36);
  return `${prefix}-${randomPart}${timePart}`;
};
