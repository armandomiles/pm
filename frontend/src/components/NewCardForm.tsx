import { useState, type FormEvent } from "react";
import type { CardPriority } from "@/lib/kanban";
import { PlusIcon } from "@/components/icons";

const initialFormState = {
  title: "",
  details: "",
  dueDate: "",
  priority: "" as CardPriority | "",
  assignee: "",
};

type NewCardFormProps = {
  members?: string[];
  onAdd: (
    title: string,
    details: string,
    dueDate: string | null,
    priority: CardPriority | null,
    assignee: string | null
  ) => void;
};

export const NewCardForm = ({ members = [], onAdd }: NewCardFormProps) => {
  const [isOpen, setIsOpen] = useState(false);
  const [formState, setFormState] = useState(initialFormState);

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!formState.title.trim()) {
      return;
    }
    onAdd(
      formState.title.trim(),
      formState.details.trim(),
      formState.dueDate || null,
      formState.priority || null,
      formState.assignee || null
    );
    setFormState(initialFormState);
    setIsOpen(false);
  };

  return (
    <div className="mt-4">
      {isOpen ? (
        <form onSubmit={handleSubmit} className="space-y-3">
          <input
            value={formState.title}
            onChange={(event) =>
              setFormState((prev) => ({ ...prev, title: event.target.value }))
            }
            placeholder="Card title"
            className="w-full rounded-xl border border-[var(--stroke)] bg-white px-3 py-2 text-sm font-medium text-[var(--navy-dark)] outline-none transition focus:border-[var(--primary-blue)]"
            required
          />
          <textarea
            value={formState.details}
            onChange={(event) =>
              setFormState((prev) => ({ ...prev, details: event.target.value }))
            }
            placeholder="Details"
            rows={3}
            className="w-full resize-none rounded-xl border border-[var(--stroke)] bg-white px-3 py-2 text-sm text-[var(--gray-text)] outline-none transition focus:border-[var(--primary-blue)]"
          />
          <div className="flex items-center gap-2">
            <input
              type="date"
              value={formState.dueDate}
              onChange={(event) =>
                setFormState((prev) => ({ ...prev, dueDate: event.target.value }))
              }
              aria-label="Due date"
              className="flex-1 rounded-xl border border-[var(--stroke)] bg-white px-3 py-2 text-xs text-[var(--navy-dark)] outline-none transition focus:border-[var(--primary-blue)]"
            />
            <select
              value={formState.priority}
              onChange={(event) =>
                setFormState((prev) => ({ ...prev, priority: event.target.value as CardPriority | "" }))
              }
              aria-label="Priority"
              className="rounded-xl border border-[var(--stroke)] bg-white px-3 py-2 text-xs text-[var(--navy-dark)] outline-none transition focus:border-[var(--primary-blue)]"
            >
              <option value="">No priority</option>
              <option value="low">Low</option>
              <option value="medium">Medium</option>
              <option value="high">High</option>
            </select>
          </div>
          {members.length > 0 ? (
            <select
              value={formState.assignee}
              onChange={(event) =>
                setFormState((prev) => ({ ...prev, assignee: event.target.value }))
              }
              aria-label="Assignee"
              className="w-full rounded-xl border border-[var(--stroke)] bg-white px-3 py-2 text-xs text-[var(--navy-dark)] outline-none transition focus:border-[var(--primary-blue)]"
            >
              <option value="">Unassigned</option>
              {members.map((username) => (
                <option key={username} value={username}>
                  {username}
                </option>
              ))}
            </select>
          ) : null}
          <div className="flex items-center gap-2">
            <button
              type="submit"
              className="rounded-full bg-[var(--secondary-purple)] px-4 py-2 text-xs font-semibold uppercase tracking-wide text-white transition hover:brightness-110"
            >
              Add card
            </button>
            <button
              type="button"
              onClick={() => {
                setIsOpen(false);
                setFormState(initialFormState);
              }}
              className="rounded-full border border-[var(--stroke)] px-3 py-2 text-xs font-semibold uppercase tracking-wide text-[var(--gray-text)] transition hover:text-[var(--navy-dark)]"
            >
              Cancel
            </button>
          </div>
        </form>
      ) : (
        <button
          type="button"
          onClick={() => setIsOpen(true)}
          className="flex w-full items-center justify-center gap-1.5 rounded-full border border-dashed border-[var(--stroke)] px-3 py-2 text-xs font-semibold uppercase tracking-wide text-[var(--primary-blue)] transition hover:border-[var(--primary-blue)]"
        >
          <PlusIcon className="h-3.5 w-3.5" />
          Add a card
        </button>
      )}
    </div>
  );
};
