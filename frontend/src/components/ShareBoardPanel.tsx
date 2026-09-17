"use client";

import { useEffect, useState, type FormEvent } from "react";
import { TrashIcon } from "@/components/icons";

type ShareBoardPanelProps = {
  boardId: string;
  ownerUsername: string;
};

export const ShareBoardPanel = ({ boardId, ownerUsername }: ShareBoardPanelProps) => {
  const [members, setMembers] = useState<string[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [newUsername, setNewUsername] = useState("");
  const [isAdding, setIsAdding] = useState(false);

  useEffect(() => {
    fetch(`/api/boards/${boardId}/members`, { credentials: "include" })
      .then(async (response) => {
        if (!response.ok) {
          throw new Error();
        }
        setMembers(await response.json());
      })
      .catch(() => setError("Unable to load who has access."));
  }, [boardId]);

  const handleAdd = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const username = newUsername.trim();
    if (!username || isAdding) {
      return;
    }
    setIsAdding(true);
    setError(null);
    try {
      const response = await fetch(`/api/boards/${boardId}/members`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ username }),
      });
      if (!response.ok) {
        const body = await response.json().catch(() => null);
        throw new Error(body?.detail ?? "Unable to add that person.");
      }
      setMembers(await response.json());
      setNewUsername("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to add that person.");
    } finally {
      setIsAdding(false);
    }
  };

  const handleRemove = async (username: string) => {
    setError(null);
    const previous = members;
    setMembers((prev) => (prev ?? []).filter((name) => name !== username));
    const response = await fetch(`/api/boards/${boardId}/members/${username}`, {
      method: "DELETE",
      credentials: "include",
    });
    if (!response.ok) {
      setError("Unable to remove that person.");
      setMembers(previous ?? null);
    }
  };

  return (
    <div className="mt-2 space-y-3 rounded-xl border border-[var(--stroke)] bg-[var(--surface)] px-4 py-3">
      <p className="text-xs font-semibold uppercase tracking-wide text-[var(--gray-text)]">Shared with</p>
      {error ? <p className="text-sm text-red-700">{error}</p> : null}
      <ul className="space-y-1.5">
        {(members ?? []).map((username) => (
          <li key={username} className="flex items-center justify-between gap-2 text-sm text-[var(--navy-dark)]">
            <span>
              {username}
              {username === ownerUsername ? " (owner)" : ""}
            </span>
            {username !== ownerUsername ? (
              <button
                type="button"
                onClick={() => handleRemove(username)}
                className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[var(--gray-text)] transition hover:bg-red-50 hover:text-red-600"
                aria-label={`Remove ${username}`}
              >
                <TrashIcon className="h-3.5 w-3.5" />
              </button>
            ) : null}
          </li>
        ))}
      </ul>
      <form onSubmit={handleAdd} className="flex items-center gap-2">
        <input
          value={newUsername}
          onChange={(event) => setNewUsername(event.target.value)}
          placeholder="Username to invite"
          aria-label="Username to invite"
          className="flex-1 rounded-lg border border-[var(--stroke)] bg-white px-2.5 py-1.5 text-sm outline-none focus:border-[var(--primary-blue)]"
        />
        <button
          type="submit"
          disabled={isAdding || !newUsername.trim()}
          className="rounded-full bg-[var(--secondary-purple)] px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-white transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"
        >
          Invite
        </button>
      </form>
    </div>
  );
};
