import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { KanbanBoard } from "@/components/KanbanBoard";
import { initialData } from "@/lib/kanban";

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
