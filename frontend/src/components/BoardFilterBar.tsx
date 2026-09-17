import { defaultCardFilter, isCardFilterActive, type CardFilter, type CardPriority } from "@/lib/kanban";

type BoardFilterBarProps = {
  filter: CardFilter;
  onChange: (filter: CardFilter) => void;
  matchCount: number;
  totalCount: number;
};

export const BoardFilterBar = ({ filter, onChange, matchCount, totalCount }: BoardFilterBarProps) => {
  const isActive = isCardFilterActive(filter);

  return (
    <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-[var(--stroke)] bg-white/80 px-4 py-3 shadow-[var(--shadow)] backdrop-blur">
      <input
        value={filter.text}
        onChange={(event) => onChange({ ...filter, text: event.target.value })}
        placeholder="Search cards..."
        aria-label="Search cards"
        className="min-w-[180px] flex-1 rounded-xl border border-[var(--stroke)] bg-white px-3 py-2 text-sm outline-none focus:border-[var(--primary-blue)]"
      />
      <select
        value={filter.priority}
        onChange={(event) =>
          onChange({ ...filter, priority: event.target.value as CardPriority | "all" })
        }
        aria-label="Filter by priority"
        className="rounded-xl border border-[var(--stroke)] bg-white px-3 py-2 text-sm text-[var(--navy-dark)] outline-none focus:border-[var(--primary-blue)]"
      >
        <option value="all">All priorities</option>
        <option value="high">High priority</option>
        <option value="medium">Medium priority</option>
        <option value="low">Low priority</option>
      </select>
      <label className="flex items-center gap-2 text-sm font-medium text-[var(--navy-dark)]">
        <input
          type="checkbox"
          checked={filter.overdueOnly}
          onChange={(event) => onChange({ ...filter, overdueOnly: event.target.checked })}
        />
        Overdue only
      </label>
      {isActive ? (
        <>
          <span className="text-xs font-semibold uppercase tracking-wide text-[var(--gray-text)]">
            {matchCount} of {totalCount} cards
          </span>
          <button
            type="button"
            onClick={() => onChange(defaultCardFilter)}
            className="rounded-full border border-[var(--stroke)] px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-[var(--gray-text)] transition hover:text-[var(--navy-dark)]"
          >
            Clear filters
          </button>
        </>
      ) : null}
    </div>
  );
};
