import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ChatSidebar } from "@/components/ChatSidebar";
import { initialData } from "@/lib/kanban";

describe("ChatSidebar", () => {
  it("sends a question, keeps the reply, and applies a board update", async () => {
    const updatedBoard = {
      ...initialData,
      columns: initialData.columns.map((column, index) =>
        index === 0 ? { ...column, title: "Queued" } : column
      ),
    };
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ response: "I moved that work.", board: updatedBoard }),
    });
    vi.stubGlobal("fetch", fetchMock);
    const onBoardUpdate = vi.fn();

    render(<ChatSidebar boardId="board-1" onBoardUpdate={onBoardUpdate} />);
    await userEvent.type(screen.getByLabelText("Message the assistant"), "Move it");
    await userEvent.click(screen.getByRole("button", { name: "Send message" }));

    expect(await screen.findByText("I moved that work.")).toBeInTheDocument();
    expect(onBoardUpdate).toHaveBeenCalledWith(updatedBoard);
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({
      board_id: "board-1",
      question: "Move it",
      history: [],
    });
  });

  it("shows an error when the assistant request fails", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false }));

    render(<ChatSidebar boardId="board-1" onBoardUpdate={vi.fn()} />);
    await userEvent.type(screen.getByLabelText("Message the assistant"), "Help");
    await userEvent.click(screen.getByRole("button", { name: "Send message" }));

    expect(await screen.findByText("The assistant could not answer right now.")).toBeInTheDocument();
  });
});