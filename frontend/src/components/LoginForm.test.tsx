import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { LoginForm } from "@/components/LoginForm";

describe("LoginForm", () => {
  it("submits valid credentials", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: true, json: async () => ({ username: "user" }) })
    );
    const onLogin = vi.fn();

    render(<LoginForm onLogin={onLogin} />);
    await userEvent.type(screen.getByLabelText("Username"), "user");
    await userEvent.type(screen.getByLabelText("Password"), "password");
    await userEvent.click(screen.getByRole("button", { name: "Sign in" }));

    expect(onLogin).toHaveBeenCalledWith("user");
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

  it("switches to signup mode and submits a new account", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ username: "newperson" }) });
    vi.stubGlobal("fetch", fetchMock);
    const onLogin = vi.fn();

    render(<LoginForm onLogin={onLogin} />);
    await userEvent.click(screen.getByRole("button", { name: "Need an account? Sign up" }));
    await userEvent.type(screen.getByLabelText("Username"), "newperson");
    await userEvent.type(screen.getByLabelText("Password"), "correct-horse");
    await userEvent.click(screen.getByRole("button", { name: "Create account" }));

    expect(onLogin).toHaveBeenCalledWith("newperson");
    expect(fetchMock.mock.calls[0][0]).toBe("/api/auth/signup");
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({
      username: "newperson",
      password: "correct-horse",
    });
  });

  it("shows an error when signup fails", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false }));

    render(<LoginForm onLogin={vi.fn()} />);
    await userEvent.click(screen.getByRole("button", { name: "Need an account? Sign up" }));
    await userEvent.type(screen.getByLabelText("Username"), "taken");
    await userEvent.type(screen.getByLabelText("Password"), "correct-horse");
    await userEvent.click(screen.getByRole("button", { name: "Create account" }));

    expect(
      await screen.findByText("Unable to create an account with those details.")
    ).toBeInTheDocument();
  });
});