"use client";

import { useEffect, useState } from "react";
import { BoardList } from "@/components/BoardList";
import { KanbanBoard } from "@/components/KanbanBoard";
import { LoginForm } from "@/components/LoginForm";

type SelectedBoard = {
  id: string;
  name: string;
};

export default function Home() {
  const [isAuthenticated, setIsAuthenticated] = useState<boolean | null>(null);
  const [selectedBoard, setSelectedBoard] = useState<SelectedBoard | null>(null);

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
    setSelectedBoard(null);
  };

  if (!selectedBoard) {
    return (
      <BoardList
        onSelectBoard={(id, name) => setSelectedBoard({ id, name })}
        onLogout={handleLogout}
      />
    );
  }

  return (
    <KanbanBoard
      boardId={selectedBoard.id}
      boardName={selectedBoard.name}
      onLogout={handleLogout}
      onBack={() => setSelectedBoard(null)}
    />
  );
}
