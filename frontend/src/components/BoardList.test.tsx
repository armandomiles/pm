import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { BoardList } from "@/components/BoardList";

const boards = [
  { id: "board-1", name: "My Board", updated_at: "2026-01-01T00:00:00Z", is_owner: true },
  { id: "board-2", name: "Marketing", updated_at: "2026-01-02T00:00:00Z", is_owner: true },
];

const sharedBoards = [
  { id: "board-1", name: "My Board", updated_at: "2026-01-01T00:00:00Z", is_owner: true },
  { id: "board-9", name: "Team Roadmap", updated_at: "2026-01-01T00:00:00Z", is_owner: false },
];

describe("BoardList", () => {
  it("loads and displays the user's boards", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: true, json: async () => boards })
    );

    render(<BoardList currentUsername="user" onSelectBoard={vi.fn()} onLogout={vi.fn()} />);

    expect(await screen.findByText("My Board")).toBeInTheDocument();
    expect(screen.getByText("Marketing")).toBeInTheDocument();
  });

  it("selects a board when clicked", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: true, json: async () => boards })
    );
    const onSelectBoard = vi.fn();

    render(<BoardList currentUsername="user" onSelectBoard={onSelectBoard} onLogout={vi.fn()} />);
    await userEvent.click(await screen.findByText("My Board"));

    expect(onSelectBoard).toHaveBeenCalledWith("board-1", "My Board");
  });

  it("creates a new board", async () => {
    const fetchMock = vi.fn().mockImplementation((url: string, options?: RequestInit) => {
      if (options?.method === "POST") {
        return Promise.resolve({
          ok: true,
          json: async () => ({ id: "board-3", name: "New Project", updated_at: "2026-01-03T00:00:00Z", is_owner: true }),
        });
      }
      return Promise.resolve({ ok: true, json: async () => boards });
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<BoardList currentUsername="user" onSelectBoard={vi.fn()} onLogout={vi.fn()} />);
    await screen.findByText("My Board");
    await userEvent.type(screen.getByLabelText("New board name"), "New Project");
    await userEvent.click(screen.getByRole("button", { name: /create board/i }));

    expect(await screen.findByText("New Project")).toBeInTheDocument();
  });

  it("deletes a board", async () => {
    const fetchMock = vi.fn().mockImplementation((url: string, options?: RequestInit) => {
      if (options?.method === "DELETE") {
        return Promise.resolve({ ok: true });
      }
      return Promise.resolve({ ok: true, json: async () => boards });
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<BoardList currentUsername="user" onSelectBoard={vi.fn()} onLogout={vi.fn()} />);
    await screen.findByText("Marketing");
    await userEvent.click(screen.getByRole("button", { name: "Delete Marketing" }));

    await waitFor(() => expect(screen.queryByText("Marketing")).not.toBeInTheDocument());
  });

  it("renames a board", async () => {
    const fetchMock = vi.fn().mockImplementation((url: string, options?: RequestInit) => {
      if (options?.method === "PATCH") {
        return Promise.resolve({ ok: true });
      }
      return Promise.resolve({ ok: true, json: async () => boards });
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<BoardList currentUsername="user" onSelectBoard={vi.fn()} onLogout={vi.fn()} />);
    await screen.findByText("My Board");
    await userEvent.click(screen.getByRole("button", { name: "Rename My Board" }));
    const input = screen.getByLabelText("Rename My Board");
    await userEvent.clear(input);
    await userEvent.type(input, "Renamed Board");
    await userEvent.click(screen.getByRole("button", { name: "Save" }));

    expect(await screen.findByText("Renamed Board")).toBeInTheDocument();
  });

  it("toggles the account settings panel", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: true, json: async () => boards })
    );

    render(<BoardList currentUsername="user" onSelectBoard={vi.fn()} onLogout={vi.fn()} />);
    await screen.findByText("My Board");

    expect(screen.queryByRole("heading", { name: "Account settings" })).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Account settings" }));
    expect(screen.getByRole("heading", { name: "Account settings" })).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Hide account settings" }));
    expect(screen.queryByRole("heading", { name: "Account settings" })).not.toBeInTheDocument();
  });

  it("marks shared boards and hides owner-only controls for them", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: true, json: async () => sharedBoards })
    );

    render(<BoardList currentUsername="user" onSelectBoard={vi.fn()} onLogout={vi.fn()} />);
    await screen.findByText("Team Roadmap");

    expect(screen.getByText("Shared")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Delete Team Roadmap" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Rename Team Roadmap" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Share Team Roadmap" })).not.toBeInTheDocument();

    expect(screen.getByRole("button", { name: "Share My Board" })).toBeInTheDocument();
  });

  it("opens the share panel and invites a member for an owned board", async () => {
    const fetchMock = vi.fn().mockImplementation((url: string, options?: RequestInit) => {
      if (typeof url === "string" && url.includes("/members") && options?.method === "POST") {
        return Promise.resolve({ ok: true, json: async () => ["user", "teammate"] });
      }
      if (typeof url === "string" && url.includes("/members")) {
        return Promise.resolve({ ok: true, json: async () => ["user"] });
      }
      return Promise.resolve({ ok: true, json: async () => boards });
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<BoardList currentUsername="user" onSelectBoard={vi.fn()} onLogout={vi.fn()} />);
    await screen.findByText("My Board");

    await userEvent.click(screen.getByRole("button", { name: "Share My Board" }));
    expect(await screen.findByText("Shared with")).toBeInTheDocument();
    await screen.findByText("user (owner)");

    await userEvent.type(screen.getByLabelText("Username to invite"), "teammate");
    await userEvent.click(screen.getByRole("button", { name: "Invite" }));

    expect(await screen.findByText("teammate")).toBeInTheDocument();
  });
});
