import { formatDueDate, isOverdue, type Card } from "@/lib/kanban";

const PRIORITY_STYLES: Record<string, string> = {
  high: "bg-[var(--secondary-purple)] text-white",
  medium: "bg-[var(--accent-yellow)] text-[var(--navy-dark)]",
  low: "bg-[var(--surface)] text-[var(--gray-text)]",
};

const PRIORITY_LABELS: Record<string, string> = {
  high: "High",
  medium: "Medium",
  low: "Low",
};

type CardMetaProps = {
  card: Card;
};

export const CardMeta = ({ card }: CardMetaProps) => {
  if (!card.dueDate && !card.priority && !card.assignee) {
    return null;
  }

  return (
    <div className="mt-3 flex flex-wrap items-center gap-2">
      {card.priority ? (
        <span
          className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${PRIORITY_STYLES[card.priority]}`}
        >
          {PRIORITY_LABELS[card.priority]}
        </span>
      ) : null}
      {card.dueDate ? (
        <span
          className={`text-xs font-semibold ${isOverdue(card.dueDate) ? "text-red-700" : "text-[var(--gray-text)]"}`}
        >
          Due {formatDueDate(card.dueDate)}
        </span>
      ) : null}
      {card.assignee ? (
        <span className="rounded-full bg-[var(--surface)] px-2 py-0.5 text-[10px] font-semibold text-[var(--navy-dark)]">
          @{card.assignee}
        </span>
      ) : null}
    </div>
  );
};
