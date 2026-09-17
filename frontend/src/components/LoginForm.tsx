"use client";

import { useState, type FormEvent } from "react";

type LoginFormProps = {
  onLogin: (username: string) => void;
};

export const LoginForm = ({ onLogin }: LoginFormProps) => {
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const isSignup = mode === "signup";

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setIsSubmitting(true);

    try {
      const response = await fetch(isSignup ? "/api/auth/signup" : "/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ username, password }),
      });

      if (!response.ok) {
        setError(
          isSignup
            ? "Unable to create an account with those details."
            : "Invalid username or password."
        );
        return;
      }

      const data: { username: string } = await response.json();
      onLogin(data.username);
    } catch {
      setError("Unable to reach the server right now.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const switchMode = () => {
    setMode(isSignup ? "login" : "signup");
    setError(null);
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
          {isSignup ? "Create your account" : "Sign in to Kanban Studio"}
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
          <div>
            <label className="block text-sm font-semibold text-[var(--navy-dark)]">
              Password
              <input
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                className="mt-2 w-full rounded-xl border border-[var(--stroke)] bg-white px-3 py-3 text-sm outline-none focus:border-[var(--primary-blue)]"
                autoComplete={isSignup ? "new-password" : "current-password"}
                minLength={isSignup ? 8 : undefined}
                required
              />
            </label>
            {isSignup ? (
              <p className="mt-1 text-xs font-normal text-[var(--gray-text)]">At least 8 characters.</p>
            ) : null}
          </div>
        </div>
        {error ? <p className="mt-4 text-sm text-red-700">{error}</p> : null}
        <button
          type="submit"
          disabled={isSubmitting}
          className="mt-6 w-full rounded-full bg-[var(--secondary-purple)] px-4 py-3 text-sm font-semibold text-white transition hover:brightness-110 disabled:cursor-wait disabled:opacity-60"
        >
          {isSubmitting ? "Please wait..." : isSignup ? "Create account" : "Sign in"}
        </button>
        <button
          type="button"
          onClick={switchMode}
          className="mt-4 w-full text-center text-xs font-semibold uppercase tracking-wide text-[var(--primary-blue)] transition hover:brightness-110"
        >
          {isSignup ? "Already have an account? Sign in" : "Need an account? Sign up"}
        </button>
      </form>
    </main>
  );
};
