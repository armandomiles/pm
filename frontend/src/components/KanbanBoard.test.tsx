import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { KanbanBoard } from "@/components/KanbanBoard";
import { formatDueDate, initialData } from "@/lib/kanban";

const getFirstColumn = () => screen.getAllByTestId(/column-/i)[0];

describe("KanbanBoard", () => {
  it("renders five columns", () => {
    render(<KanbanBoard />);
    expect(screen.getAllByTestId(/column-/i)).toHaveLength(5);
  });

  it("renames a column", async () => {
    render(<KanbanBoard />);
    const column = getFirstColumn();
    const input = within(column).getByLabelText("Column title");
    await userEvent.clear(input);
    await userEvent.type(input, "New Name");
    expect(input).toHaveValue("New Name");
  });

  it("adds and removes a card", async () => {
    render(<KanbanBoard />);
    const column = getFirstColumn();
    const addButton = within(column).getByRole("button", {
      name: /add a card/i,
    });
    await userEvent.click(addButton);

    const titleInput = within(column).getByPlaceholderText(/card title/i);
    await userEvent.type(titleInput, "New card");
    const detailsInput = within(column).getByPlaceholderText(/details/i);
    await userEvent.type(detailsInput, "Notes");

    await userEvent.click(within(column).getByRole("button", { name: /add card/i }));

    expect(within(column).getByText("New card")).toBeInTheDocument();

    const deleteButton = within(column).getByRole("button", {
      name: /delete new card/i,
    });
    await userEvent.click(deleteButton);

    expect(within(column).queryByText("New card")).not.toBeInTheDocument();
  });

  it("edits a card's title, details, due date, and priority", async () => {
    render(<KanbanBoard />);
    const column = getFirstColumn();

    await userEvent.click(within(column).getByRole("button", { name: /edit align roadmap themes/i }));
    const titleInput = within(column).getByLabelText("Card title");
    await userEvent.clear(titleInput);
    await userEvent.type(titleInput, "Updated title");
    await userEvent.type(within(column).getByLabelText("Due date"), "2026-12-31");
    await userEvent.selectOptions(within(column).getByLabelText("Priority"), "high");
    await userEvent.click(within(column).getByRole("button", { name: "Save" }));

    expect(within(column).getByText("Updated title")).toBeInTheDocument();
    expect(within(column).queryByText("Align roadmap themes")).not.toBeInTheDocument();
    expect(within(column).getByText("High")).toBeInTheDocument();
    expect(within(column).getByText(`Due ${formatDueDate("2026-12-31")}`)).toBeInTheDocument();
  });

  it("cancels a card edit without applying changes", async () => {
    render(<KanbanBoard />);
    const column = getFirstColumn();

    await userEvent.click(within(column).getByRole("button", { name: /edit align roadmap themes/i }));
    const titleInput = within(column).getByLabelText("Card title");
    await userEvent.clear(titleInput);
    await userEvent.type(titleInput, "Should not save");
    await userEvent.click(within(column).getByRole("button", { name: "Cancel" }));

    expect(within(column).getByText("Align roadmap themes")).toBeInTheDocument();
    expect(within(column).queryByText("Should not save")).not.toBeInTheDocument();
  });

  it("filters cards by search text", async () => {
    render(<KanbanBoard />);
    await userEvent.type(screen.getByLabelText("Search cards"), "roadmap");

    expect(screen.getByText("Align roadmap themes")).toBeInTheDocument();
    expect(screen.queryByText("Gather customer signals")).not.toBeInTheDocument();
  });

  it("clears an active filter", async () => {
    render(<KanbanBoard />);
    await userEvent.type(screen.getByLabelText("Search cards"), "roadmap");
    expect(screen.queryByText("Gather customer signals")).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Clear filters" }));

    expect(screen.getByText("Gather customer signals")).toBeInTheDocument();
  });

  it("filters cards by priority", async () => {
    render(<KanbanBoard />);
    const column = getFirstColumn();
    await userEvent.click(within(column).getByRole("button", { name: /edit align roadmap themes/i }));
    await userEvent.selectOptions(within(column).getByLabelText("Priority"), "high");
    await userEvent.click(within(column).getByRole("button", { name: "Save" }));

    await userEvent.selectOptions(screen.getByLabelText("Filter by priority"), "high");

    expect(screen.getByText("Align roadmap themes")).toBeInTheDocument();
    expect(screen.queryByText("Gather customer signals")).not.toBeInTheDocument();
  });

  it("assigns a card to a board member", async () => {
    const fetchMock = vi.fn().mockImplementation((url: string, options?: RequestInit) => {
      if (typeof url === "string" && url.endsWith("/members")) {
        return Promise.resolve({ ok: true, json: async () => ["user", "teammate"] });
      }
      if (options?.method === "PUT") {
        return Promise.resolve({ ok: true, json: async () => JSON.parse(options.body as string) });
      }
      return Promise.resolve({ ok: true, json: async () => initialData });
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<KanbanBoard boardId="board-1" onLogout={vi.fn()} />);
    await screen.findByDisplayValue("Backlog");
    const column = getFirstColumn();

    await userEvent.click(within(column).getByRole("button", { name: /edit align roadmap themes/i }));
    const assigneeSelect = await within(column).findByLabelText("Assignee");
    await userEvent.selectOptions(assigneeSelect, "teammate");
    await userEvent.click(within(column).getByRole("button", { name: "Save" }));

    expect(within(column).getByText("@teammate")).toBeInTheDocument();
  });

  it("filters cards by assignee", async () => {
    const fetchMock = vi.fn().mockImplementation((url: string, options?: RequestInit) => {
      if (typeof url === "string" && url.endsWith("/members")) {
        return Promise.resolve({ ok: true, json: async () => ["user", "teammate"] });
      }
      if (options?.method === "PUT") {
        return Promise.resolve({ ok: true, json: async () => JSON.parse(options.body as string) });
      }
      return Promise.resolve({ ok: true, json: async () => initialData });
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<KanbanBoard boardId="board-1" onLogout={vi.fn()} />);
    await screen.findByDisplayValue("Backlog");
    const column = getFirstColumn();

    await userEvent.click(within(column).getByRole("button", { name: /edit align roadmap themes/i }));
    const assigneeSelect = await within(column).findByLabelText("Assignee");
    await userEvent.selectOptions(assigneeSelect, "teammate");
    await userEvent.click(within(column).getByRole("button", { name: "Save" }));

    await userEvent.selectOptions(await screen.findByLabelText("Filter by assignee"), "teammate");

    expect(within(column).getByText("Align roadmap themes")).toBeInTheDocument();
    expect(within(column).queryByText("Gather customer signals")).not.toBeInTheDocument();
  });

  it("loads and saves the board through the API", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => initialData })
      .mockResolvedValue({ ok: true });
    vi.stubGlobal("fetch", fetchMock);

    render(<KanbanBoard boardId="board-1" onLogout={vi.fn()} />);
    const column = await screen.findByDisplayValue("Backlog");
    await userEvent.clear(column);
    await userEvent.type(column, "Queued");

    const saveCalls = fetchMock.mock.calls.filter(([, options]) => options?.method === "PUT");
    const saveCall = saveCalls.at(-1);
    expect(saveCall?.[0]).toBe("/api/boards/board-1");
    expect(JSON.parse(saveCall?.[1].body).columns[0].title).toBe("Queued");
  });

  it("reverts the optimistic update and shows an error when saving fails", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => initialData })
      .mockResolvedValue({ ok: false });
    vi.stubGlobal("fetch", fetchMock);

    render(<KanbanBoard boardId="board-1" onLogout={vi.fn()} />);
    await screen.findByDisplayValue("Backlog");
    const column = getFirstColumn();
    await userEvent.click(within(column).getByRole("button", { name: /add a card/i }));
    await userEvent.type(within(column).getByPlaceholderText(/card title/i), "New card");
    await userEvent.click(within(column).getByRole("button", { name: /add card/i }));

    expect(await screen.findByText("Unable to save the board.")).toBeInTheDocument();
    expect(within(column).queryByText("New card")).not.toBeInTheDocument();
  });
});
