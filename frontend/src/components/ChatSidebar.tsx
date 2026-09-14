"use client";

import { useState, type FormEvent } from "react";
import type { BoardData } from "@/lib/kanban";

type Message = {
  role: "user" | "assistant";
  content: string;
};

type ChatSidebarProps = {
  onBoardUpdate: (board: BoardData) => void;
};

export const ChatSidebar = ({ onBoardUpdate }: ChatSidebarProps) => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [question, setQuestion] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const trimmedQuestion = question.trim();
    if (!trimmedQuestion || isSending) {
      return;
    }

    const nextMessages = [...messages, { role: "user" as const, content: trimmedQuestion }];
    setMessages(nextMessages);
    setQuestion("");
    setError(null);
    setIsSending(true);

    try {
      const response = await fetch("/api/ai/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ question: trimmedQuestion, history: messages }),
      });
      if (!response.ok) {
        throw new Error("The assistant could not answer right now.");
      }
      const result: { response: string; board?: BoardData | null } = await response.json();
      setMessages([...nextMessages, { role: "assistant", content: result.response }]);
      if (result.board) {
        onBoardUpdate(result.board);
      }
    } catch {
      setError("The assistant could not answer right now.");
    } finally {
      setIsSending(false);
    }
  };

  return (
    <aside className="fixed bottom-0 right-0 top-0 z-10 flex w-full max-w-[360px] flex-col border-l border-[var(--stroke)] bg-[var(--navy-dark)] p-6 text-white shadow-[-16px_0_40px_rgba(3,33,71,0.14)]">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.3em] text-[var(--accent-yellow)]">
          Board assistant
        </p>
        <h2 className="mt-3 font-display text-2xl font-semibold">Ask about your work</h2>
      </div>
      <div className="mt-8 flex-1 space-y-4 overflow-y-auto pr-2" aria-live="polite">
        {messages.length === 0 ? (
          <p className="text-sm leading-6 text-white/65">Ask for a card, a status change, or a next step.</p>
        ) : null}
        {messages.map((message, index) => (
          <div
            key={`${message.role}-${index}`}
            className={message.role === "user" ? "ml-6 rounded-2xl bg-[var(--primary-blue)] p-3 text-sm" : "mr-6 rounded-2xl bg-white/10 p-3 text-sm leading-6 text-white/85"}
          >
            {message.content}
          </div>
        ))}
        {isSending ? <p className="text-sm text-white/65">Thinking...</p> : null}
      </div>
      {error ? <p className="mb-3 text-sm text-red-200">{error}</p> : null}
      <form onSubmit={handleSubmit} className="mt-4 space-y-3">
        <label htmlFor="assistant-question" className="sr-only">Message the assistant</label>
        <textarea
          id="assistant-question"
          value={question}
          onChange={(event) => setQuestion(event.target.value)}
          placeholder="What should change?"
          rows={3}
          className="w-full resize-none rounded-2xl border border-white/15 bg-white/10 px-4 py-3 text-sm text-white outline-none placeholder:text-white/45 focus:border-[var(--accent-yellow)]"
        />
        <button
          type="submit"
          disabled={isSending || !question.trim()}
          className="w-full rounded-full bg-[var(--accent-yellow)] px-4 py-3 text-sm font-semibold text-[var(--navy-dark)] transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"
        >
          Send message
        </button>
      </form>
    </aside>
  );
};