"use client";

import { useState, type FormEvent } from "react";

type LoginFormProps = {
  onLogin: () => void;
};

export const LoginForm = ({ onLogin }: LoginFormProps) => {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setIsSubmitting(true);

    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ username, password }),
      });

      if (!response.ok) {
        setError("Invalid username or password.");
        return;
      }

      onLogin();
    } catch {
      setError("Unable to sign in right now.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <main className="flex min-h-screen items-center justify-center px-6 py-12">
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-md rounded-[32px] border border-[var(--stroke)] bg-white/90 p-8 shadow-[var(--shadow)]"
      >
        <p className="text-xs font-semibold uppercase tracking-[0.35em] text-[var(--gray-text)]">
          Project workspace
        </p>
        <h1 className="mt-3 font-display text-4xl font-semibold text-[var(--navy-dark)]">
          Sign in to Kanban Studio
        </h1>
        <div className="mt-8 space-y-4">
          <label className="block text-sm font-semibold text-[var(--navy-dark)]">
            Username
            <input
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              className="mt-2 w-full rounded-xl border border-[var(--stroke)] bg-white px-3 py-3 text-sm outline-none focus:border-[var(--primary-blue)]"
              autoComplete="username"
              required
            />
          </label>
          <label className="block text-sm font-semibold text-[var(--navy-dark)]">
            Password
            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className="mt-2 w-full rounded-xl border border-[var(--stroke)] bg-white px-3 py-3 text-sm outline-none focus:border-[var(--primary-blue)]"
              autoComplete="current-password"
              required
            />
          </label>
        </div>
        {error ? <p className="mt-4 text-sm text-red-700">{error}</p> : null}
        <button
          type="submit"
          disabled={isSubmitting}
          className="mt-6 w-full rounded-full bg-[var(--secondary-purple)] px-4 py-3 text-sm font-semibold text-white transition hover:brightness-110 disabled:cursor-wait disabled:opacity-60"
        >
          {isSubmitting ? "Signing in..." : "Sign in"}
        </button>
      </form>
    </main>
  );
};