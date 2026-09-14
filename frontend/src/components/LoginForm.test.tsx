import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { LoginForm } from "@/components/LoginForm";

describe("LoginForm", () => {
  it("submits valid credentials", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: true })
    );
    const onLogin = vi.fn();

    render(<LoginForm onLogin={onLogin} />);
    await userEvent.type(screen.getByLabelText("Username"), "user");
    await userEvent.type(screen.getByLabelText("Password"), "password");
    await userEvent.click(screen.getByRole("button", { name: "Sign in" }));

    expect(onLogin).toHaveBeenCalledOnce();
  });

  it("shows an error for rejected credentials", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: false })
    );

    render(<LoginForm onLogin={vi.fn()} />);
    await userEvent.type(screen.getByLabelText("Username"), "user");
    await userEvent.type(screen.getByLabelText("Password"), "wrong");
    await userEvent.click(screen.getByRole("button", { name: "Sign in" }));

    expect(await screen.findByText("Invalid username or password.")).toBeInTheDocument();
  });
});