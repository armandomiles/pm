import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { BoardList } from "@/components/BoardList";

const boards = [
  { id: "board-1", name: "My Board", updated_at: "2026-01-01T00:00:00Z" },
  { id: "board-2", name: "Marketing", updated_at: "2026-01-02T00:00:00Z" },
];

describe("BoardList", () => {
  it("loads and displays the user's boards", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: true, json: async () => boards })
    );

    render(<BoardList onSelectBoard={vi.fn()} onLogout={vi.fn()} />);

    expect(await screen.findByText("My Board")).toBeInTheDocument();
    expect(screen.getByText("Marketing")).toBeInTheDocument();
  });

  it("selects a board when clicked", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: true, json: async () => boards })
    );
    const onSelectBoard = vi.fn();

    render(<BoardList onSelectBoard={onSelectBoard} onLogout={vi.fn()} />);
    await userEvent.click(await screen.findByText("My Board"));

    expect(onSelectBoard).toHaveBeenCalledWith("board-1", "My Board");
  });

  it("creates a new board", async () => {
    const fetchMock = vi.fn().mockImplementation((url: string, options?: RequestInit) => {
      if (options?.method === "POST") {
        return Promise.resolve({
          ok: true,
          json: async () => ({ id: "board-3", name: "New Project", updated_at: "2026-01-03T00:00:00Z" }),
        });
      }
      return Promise.resolve({ ok: true, json: async () => boards });
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<BoardList onSelectBoard={vi.fn()} onLogout={vi.fn()} />);
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

    render(<BoardList onSelectBoard={vi.fn()} onLogout={vi.fn()} />);
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

    render(<BoardList onSelectBoard={vi.fn()} onLogout={vi.fn()} />);
    await screen.findByText("My Board");
    await userEvent.click(screen.getByRole("button", { name: "Rename My Board" }));
    const input = screen.getByLabelText("Rename My Board");
    await userEvent.clear(input);
    await userEvent.type(input, "Renamed Board");
    await userEvent.click(screen.getByRole("button", { name: "Save" }));

    expect(await screen.findByText("Renamed Board")).toBeInTheDocument();
  });
});
