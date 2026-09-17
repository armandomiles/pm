import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AccountSettings } from "@/components/AccountSettings";

describe("AccountSettings", () => {
  it("updates the password on success", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ status: "ok" }) });
    vi.stubGlobal("fetch", fetchMock);

    render(<AccountSettings onAccountDeleted={vi.fn()} />);
    await userEvent.type(screen.getByLabelText("Current password"), "password");
    await userEvent.type(screen.getByLabelText("New password"), "new-password-123");
    await userEvent.click(screen.getByRole("button", { name: "Update password" }));

    expect(await screen.findByText("Password updated.")).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/auth/password",
      expect.objectContaining({ method: "PUT" })
    );
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body).toEqual({ current_password: "password", new_password: "new-password-123" });
  });

  it("shows the server error when the current password is wrong", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: false, json: async () => ({ detail: "Current password is incorrect" }) })
    );

    render(<AccountSettings onAccountDeleted={vi.fn()} />);
    await userEvent.type(screen.getByLabelText("Current password"), "wrong");
    await userEvent.type(screen.getByLabelText("New password"), "new-password-123");
    await userEvent.click(screen.getByRole("button", { name: "Update password" }));

    expect(await screen.findByText("Current password is incorrect")).toBeInTheDocument();
  });

  it("requires a password confirmation before deleting the account", async () => {
    render(<AccountSettings onAccountDeleted={vi.fn()} />);

    await userEvent.click(screen.getByRole("button", { name: "Delete account" }));

    expect(screen.getByLabelText("Confirm password to delete account")).toBeInTheDocument();
  });

  it("calls onAccountDeleted after a successful deletion", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => ({ status: "ok" }) }));
    const onAccountDeleted = vi.fn();

    render(<AccountSettings onAccountDeleted={onAccountDeleted} />);
    await userEvent.click(screen.getByRole("button", { name: "Delete account" }));
    await userEvent.type(screen.getByLabelText("Confirm password to delete account"), "password");
    await userEvent.click(screen.getByRole("button", { name: "Permanently delete my account" }));

    expect(onAccountDeleted).toHaveBeenCalledOnce();
  });

  it("shows an error and does not call onAccountDeleted when deletion fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: false, json: async () => ({ detail: "Password is incorrect" }) })
    );
    const onAccountDeleted = vi.fn();

    render(<AccountSettings onAccountDeleted={onAccountDeleted} />);
    await userEvent.click(screen.getByRole("button", { name: "Delete account" }));
    await userEvent.type(screen.getByLabelText("Confirm password to delete account"), "wrong");
    await userEvent.click(screen.getByRole("button", { name: "Permanently delete my account" }));

    expect(await screen.findByText("Password is incorrect")).toBeInTheDocument();
    expect(onAccountDeleted).not.toHaveBeenCalled();
  });

  it("cancels the delete confirmation", async () => {
    render(<AccountSettings onAccountDeleted={vi.fn()} />);

    await userEvent.click(screen.getByRole("button", { name: "Delete account" }));
    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));

    expect(screen.queryByLabelText("Confirm password to delete account")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Delete account" })).toBeInTheDocument();
  });
});
