"use client";

import { useEffect, useState } from "react";
import { KanbanBoard } from "@/components/KanbanBoard";
import { LoginForm } from "@/components/LoginForm";

export default function Home() {
  const [isAuthenticated, setIsAuthenticated] = useState<boolean | null>(null);

  useEffect(() => {
    fetch("/api/auth/me", { credentials: "include" })
      .then((response) => setIsAuthenticated(response.ok))
      .catch(() => setIsAuthenticated(false));
  }, []);

  if (isAuthenticated === null) {
    return <main className="flex min-h-screen items-center justify-center text-sm text-[var(--gray-text)]">Loading...</main>;
  }

  if (!isAuthenticated) {
    return <LoginForm onLogin={() => setIsAuthenticated(true)} />;
  }

  const handleLogout = async () => {
    await fetch("/api/auth/logout", { method: "POST", credentials: "include" });
    setIsAuthenticated(false);
  };

  return <KanbanBoard onLogout={handleLogout} />;
}
