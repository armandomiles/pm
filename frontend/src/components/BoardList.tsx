"use client";

import { useEffect, useState, type FormEvent } from "react";
import { AccountSettings } from "@/components/AccountSettings";
import { ShareBoardPanel } from "@/components/ShareBoardPanel";
import { PencilIcon, PlusIcon, TrashIcon, UsersIcon } from "@/components/icons";

export type BoardSummary = {
  id: string;
  name: string;
  updated_at: string;
  is_owner: boolean;
};

type BoardListProps = {
  currentUsername: string;
  onSelectBoard: (boardId: string, boardName: string) => void;
  onLogout: () => void;
};

export const BoardList = ({ currentUsername, onSelectBoard, onLogout }: BoardListProps) => {
  const [boards, setBoards] = useState<BoardSummary[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [newBoardName, setNewBoardName] = useState("");
  const [isCreating, setIsCreating] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");
  const [showAccountSettings, setShowAccountSettings] = useState(false);
  const [sharingId, setSharingId] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/boards", { credentials: "include" })
      .then(async (response) => {
        if (!response.ok) {
          throw new Error("Unable to load boards.");
        }
        setBoards(await response.json());
      })
      .catch(() => setError("Unable to load boards."))
      .finally(() => setIsLoading(false));
  }, []);

  const handleCreate = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const name = newBoardName.trim();
    if (!name || isCreating) {
      return;
    }
    setIsCreating(true);
    setError(null);
    try {
      const response = await fetch("/api/boards", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ name }),
      });
      if (!response.ok) {
        throw new Error("Unable to create the board.");
      }
      const created: BoardSummary = await response.json();
      setNewBoardName("");
      setBoards((prev) => [...prev, created]);
    } catch {
      setError("Unable to create the board.");
    } finally {
      setIsCreating(false);
    }
  };

  const handleDelete = async (boardId: string) => {
    setError(null);
    const previous = boards;
    setBoards((prev) => prev.filter((board) => board.id !== boardId));
    const response = await fetch(`/api/boards/${boardId}`, {
      method: "DELETE",
      credentials: "include",
    });
    if (!response.ok) {
      setError("Unable to delete the board.");
      setBoards(previous);
    }
  };

  const startRename = (board: BoardSummary) => {
    setEditingId(board.id);
    setEditingName(board.name);
  };

  const submitRename = async (event: FormEvent<HTMLFormElement>, boardId: string) => {
    event.preventDefault();
    const name = editingName.trim();
    if (!name) {
      return;
    }
    setError(null);
    const previous = boards;
    setBoards((prev) => prev.map((board) => (board.id === boardId ? { ...board, name } : board)));
    setEditingId(null);
    const response = await fetch(`/api/boards/${boardId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ name }),
    });
    if (!response.ok) {
      setError("Unable to rename the board.");
      setBoards(previous);
    }
  };

  if (isLoading) {
    return (
      <main className="flex min-h-screen items-center justify-center text-sm text-[var(--gray-text)]">
        Loading boards...
      </main>
    );
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col gap-6 px-6 py-12">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.35em] text-[var(--gray-text)]">
            Your workspace
          </p>
          <h1 className="mt-2 font-display text-3xl font-semibold text-[var(--navy-dark)]">
            Choose a board
          </h1>
        </div>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => setShowAccountSettings((prev) => !prev)}
            className="rounded-full border border-[var(--stroke)] px-4 py-2 text-xs font-semibold uppercase tracking-wide text-[var(--gray-text)] transition hover:text-[var(--navy-dark)]"
          >
            {showAccountSettings ? "Hide account settings" : "Account settings"}
          </button>
          <button
            type="button"
            onClick={onLogout}
            className="rounded-full border border-[var(--stroke)] px-4 py-2 text-xs font-semibold uppercase tracking-wide text-[var(--gray-text)] transition hover:text-[var(--navy-dark)]"
          >
            Log out
          </button>
        </div>
      </div>

      {showAccountSettings ? <AccountSettings onAccountDeleted={onLogout} /> : null}

      {error ? <p className="text-sm font-semibold text-red-700">{error}</p> : null}

      <ul className="flex flex-col gap-3">
        {boards.map((board) => (
          <li
            key={board.id}
            data-testid={`board-${board.id}`}
            className="flex items-center justify-between gap-3 rounded-2xl border border-[var(--stroke)] bg-white px-5 py-4 shadow-[0_12px_24px_rgba(3,33,71,0.08)]"
          >
            {editingId === board.id ? (
              <form onSubmit={(event) => submitRename(event, board.id)} className="flex flex-1 items-center gap-2">
                <input
                  value={editingName}
                  onChange={(event) => setEditingName(event.target.value)}
                  aria-label={`Rename ${board.name}`}
                  autoFocus
                  className="flex-1 rounded-xl border border-[var(--stroke)] bg-white px-3 py-2 text-sm outline-none focus:border-[var(--primary-blue)]"
                />
                <button
                  type="submit"
                  className="rounded-full bg-[var(--secondary-purple)] px-3 py-2 text-xs font-semibold uppercase tracking-wide text-white transition hover:brightness-110"
                >
                  Save
                </button>
                <button
                  type="button"
                  onClick={() => setEditingId(null)}
                  className="rounded-full border border-[var(--stroke)] px-3 py-2 text-xs font-semibold uppercase tracking-wide text-[var(--gray-text)] transition hover:text-[var(--navy-dark)]"
                >
                  Cancel
                </button>
              </form>
            ) : (
              <div className="flex w-full flex-col gap-1">
                <div className="flex items-center justify-between gap-3">
                  <button
                    type="button"
                    onClick={() => onSelectBoard(board.id, board.name)}
                    className="text-left font-display text-lg font-semibold text-[var(--navy-dark)] hover:text-[var(--primary-blue)]"
                  >
                    {board.name}
                    {!board.is_owner ? (
                      <span className="ml-2 align-middle text-[10px] font-semibold uppercase tracking-wide text-[var(--gray-text)]">
                        Shared
                      </span>
                    ) : null}
                  </button>
                  {board.is_owner ? (
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => setSharingId((prev) => (prev === board.id ? null : board.id))}
                        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[var(--gray-text)] transition hover:bg-[var(--surface)] hover:text-[var(--navy-dark)]"
                        aria-label={`Share ${board.name}`}
                      >
                        <UsersIcon className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => startRename(board)}
                        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[var(--gray-text)] transition hover:bg-[var(--surface)] hover:text-[var(--navy-dark)]"
                        aria-label={`Rename ${board.name}`}
                      >
                        <PencilIcon className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDelete(board.id)}
                        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[var(--gray-text)] transition hover:bg-red-50 hover:text-red-600"
                        aria-label={`Delete ${board.name}`}
                      >
                        <TrashIcon className="h-4 w-4" />
                      </button>
                    </div>
                  ) : null}
                </div>
                {sharingId === board.id ? (
                  <ShareBoardPanel boardId={board.id} ownerUsername={currentUsername} />
                ) : null}
              </div>
            )}
          </li>
        ))}
        {boards.length === 0 ? (
          <li className="rounded-2xl border border-dashed border-[var(--stroke)] px-5 py-6 text-center text-sm text-[var(--gray-text)]">
            No boards yet. Create your first one below.
          </li>
        ) : null}
      </ul>

      <form onSubmit={handleCreate} className="flex items-center gap-2">
        <input
          value={newBoardName}
          onChange={(event) => setNewBoardName(event.target.value)}
          placeholder="New board name"
          aria-label="New board name"
          className="flex-1 rounded-xl border border-[var(--stroke)] bg-white px-3 py-3 text-sm outline-none focus:border-[var(--primary-blue)]"
        />
        <button
          type="submit"
          disabled={isCreating || !newBoardName.trim()}
          className="flex items-center gap-1.5 rounded-full bg-[var(--secondary-purple)] px-4 py-3 text-sm font-semibold text-white transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <PlusIcon className="h-4 w-4" />
          Create board
        </button>
      </form>
    </main>
  );
};
