"use client";

import { useEffect, useMemo, useState } from "react";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
  closestCorners,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { KanbanColumn } from "@/components/KanbanColumn";
import { KanbanCardPreview } from "@/components/KanbanCardPreview";
import { ChatSidebar } from "@/components/ChatSidebar";
import { createId, initialData, moveCard, type BoardData, type CardPriority } from "@/lib/kanban";
import type { CardEdits } from "@/components/KanbanCard";

type KanbanBoardProps = {
  boardId?: string;
  boardName?: string;
  onLogout?: () => void;
  onBack?: () => void;
};

export const KanbanBoard = ({ boardId, boardName, onLogout, onBack }: KanbanBoardProps) => {
  const isApiMode = Boolean(onLogout);
  const [board, setBoard] = useState<BoardData>(() => initialData);
  const [activeCardId, setActiveCardId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(isApiMode);
  const [saveError, setSaveError] = useState<string | null>(null);

  useEffect(() => {
    if (!isApiMode) {
      return;
    }

    fetch(`/api/boards/${boardId}`, { credentials: "include" })
      .then(async (response) => {
        if (!response.ok) {
          throw new Error("Unable to load the board.");
        }
        setBoard(await response.json());
      })
      .catch(() => setSaveError("Unable to load the board."))
      .finally(() => setIsLoading(false));
  }, [isApiMode, boardId]);

  const updateBoard = (nextBoard: BoardData) => {
    const previousBoard = board;
    setBoard(nextBoard);
    if (!isApiMode) {
      return;
    }

    setSaveError(null);
    fetch(`/api/boards/${boardId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify(nextBoard),
    }).then((response) => {
      if (!response.ok) {
        setSaveError("Unable to save the board.");
        setBoard(previousBoard);
      }
    }).catch(() => {
      setSaveError("Unable to save the board.");
      setBoard(previousBoard);
    });
  };

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 6 },
    })
  );

  const cardsById = useMemo(() => board.cards, [board.cards]);

  const handleDragStart = (event: DragStartEvent) => {
    setActiveCardId(event.active.id as string);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveCardId(null);

    if (!over || active.id === over.id) {
      return;
    }

    updateBoard({
      ...board,
      columns: moveCard(board.columns, active.id as string, over.id as string),
    });
  };

  const handleRenameColumn = (columnId: string, title: string) => {
    updateBoard({
      ...board,
      columns: board.columns.map((column) =>
        column.id === columnId ? { ...column, title } : column
      ),
    });
  };

  const handleAddCard = (
    columnId: string,
    title: string,
    details: string,
    dueDate: string | null,
    priority: CardPriority | null
  ) => {
    const id = createId("card");
    updateBoard({
      ...board,
      cards: {
        ...board.cards,
        [id]: { id, title, details: details || "No details yet.", dueDate, priority },
      },
      columns: board.columns.map((column) =>
        column.id === columnId
          ? { ...column, cardIds: [...column.cardIds, id] }
          : column
      ),
    });
  };

  const handleEditCard = (cardId: string, edits: CardEdits) => {
    updateBoard({
      ...board,
      cards: {
        ...board.cards,
        [cardId]: { ...board.cards[cardId], ...edits },
      },
    });
  };

  const handleDeleteCard = (columnId: string, cardId: string) => {
    updateBoard({
        ...board,
        cards: Object.fromEntries(
          Object.entries(board.cards).filter(([id]) => id !== cardId)
        ),
        columns: board.columns.map((column) =>
          column.id === columnId
            ? {
                ...column,
                cardIds: column.cardIds.filter((id) => id !== cardId),
              }
            : column
        ),
    });
  };

  const activeCard = activeCardId ? cardsById[activeCardId] : null;

  if (isLoading) {
    return <main className="flex min-h-screen items-center justify-center text-sm text-[var(--gray-text)]">Loading board...</main>;
  }

  return (
    <div className="relative overflow-hidden">
      <div className="pointer-events-none absolute left-0 top-0 h-[420px] w-[420px] -translate-x-1/3 -translate-y-1/3 rounded-full bg-[radial-gradient(circle,_rgba(32,157,215,0.25)_0%,_rgba(32,157,215,0.05)_55%,_transparent_70%)]" />
      <div className="pointer-events-none absolute bottom-0 right-0 h-[520px] w-[520px] translate-x-1/4 translate-y-1/4 rounded-full bg-[radial-gradient(circle,_rgba(117,57,145,0.18)_0%,_rgba(117,57,145,0.05)_55%,_transparent_75%)]" />

      <main className="relative mx-auto flex min-h-screen max-w-[1900px] flex-col gap-6 pb-12 pl-4 pr-[360px] pt-8 sm:pl-6">
        <header className="flex flex-col gap-3 rounded-[28px] border border-[var(--stroke)] bg-white/80 p-6 shadow-[var(--shadow)] backdrop-blur lg:p-7">
          {saveError ? <p className="text-sm font-semibold text-red-700">{saveError}</p> : null}
          <div className="flex flex-wrap items-center justify-between gap-6">
            <div className="max-w-xl">
              <p className="text-xs font-semibold uppercase tracking-[0.35em] text-[var(--gray-text)]">
                {boardName ? "Kanban board" : "Single Board Kanban"}
              </p>
              <h1 className="mt-2 font-display text-3xl font-semibold text-[var(--navy-dark)] lg:text-4xl">
                {boardName ?? "Kanban Studio"}
              </h1>
              <p className="mt-2 text-sm leading-6 text-[var(--gray-text)]">
                Rename columns, drag cards between stages, and capture quick notes.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <div className="rounded-2xl border border-[var(--stroke)] bg-[var(--surface)] px-4 py-2.5">
                <p className="text-[10px] font-semibold uppercase tracking-[0.25em] text-[var(--gray-text)]">
                  Focus
                </p>
                <p className="text-sm font-semibold text-[var(--primary-blue)]">
                  One board. Five columns. Zero clutter.
                </p>
              </div>
              {onBack ? (
                <button
                  type="button"
                  onClick={onBack}
                  className="rounded-full border border-[var(--stroke)] px-4 py-2 text-xs font-semibold uppercase tracking-wide text-[var(--gray-text)] transition hover:text-[var(--navy-dark)]"
                >
                  All boards
                </button>
              ) : null}
              {onLogout ? (
                <button
                  type="button"
                  onClick={onLogout}
                  className="rounded-full border border-[var(--stroke)] px-4 py-2 text-xs font-semibold uppercase tracking-wide text-[var(--gray-text)] transition hover:text-[var(--navy-dark)]"
                >
                  Log out
                </button>
              ) : null}
            </div>
          </div>
        </header>

        <DndContext
          sensors={sensors}
          collisionDetection={closestCorners}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
        >
          <section className="grid gap-4 lg:grid-cols-5">
            {board.columns.map((column) => (
              <KanbanColumn
                key={column.id}
                column={column}
                cards={column.cardIds.map((cardId) => board.cards[cardId])}
                onRename={handleRenameColumn}
                onAddCard={handleAddCard}
                onDeleteCard={handleDeleteCard}
                onEditCard={handleEditCard}
              />
            ))}
          </section>
          <DragOverlay>
            {activeCard ? (
              <div className="w-[260px]">
                <KanbanCardPreview card={activeCard} />
              </div>
            ) : null}
          </DragOverlay>
        </DndContext>
      </main>
      {onLogout ? <ChatSidebar boardId={boardId as string} onBoardUpdate={updateBoard} /> : null}
    </div>
  );
};
