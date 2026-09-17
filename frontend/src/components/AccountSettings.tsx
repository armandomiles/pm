"use client";

import { useState, type FormEvent } from "react";

type AccountSettingsProps = {
  onAccountDeleted: () => void;
};

export const AccountSettings = ({ onAccountDeleted }: AccountSettingsProps) => {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [passwordSuccess, setPasswordSuccess] = useState(false);
  const [isSavingPassword, setIsSavingPassword] = useState(false);

  const [isConfirmingDelete, setIsConfirmingDelete] = useState(false);
  const [deletePassword, setDeletePassword] = useState("");
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const handleChangePassword = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setPasswordError(null);
    setPasswordSuccess(false);
    setIsSavingPassword(true);
    try {
      const response = await fetch("/api/auth/password", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ current_password: currentPassword, new_password: newPassword }),
      });
      if (!response.ok) {
        const body = await response.json().catch(() => null);
        throw new Error(body?.detail ?? "Unable to update your password.");
      }
      setCurrentPassword("");
      setNewPassword("");
      setPasswordSuccess(true);
    } catch (error) {
      setPasswordError(error instanceof Error ? error.message : "Unable to update your password.");
    } finally {
      setIsSavingPassword(false);
    }
  };

  const handleDeleteAccount = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setDeleteError(null);
    setIsDeleting(true);
    try {
      const response = await fetch("/api/auth/account", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ password: deletePassword }),
      });
      if (!response.ok) {
        const body = await response.json().catch(() => null);
        throw new Error(body?.detail ?? "Unable to delete your account.");
      }
      onAccountDeleted();
    } catch (error) {
      setDeleteError(error instanceof Error ? error.message : "Unable to delete your account.");
      setIsDeleting(false);
    }
  };

  return (
    <div className="flex flex-col gap-5 rounded-2xl border border-[var(--stroke)] bg-white px-5 py-5 shadow-[0_12px_24px_rgba(3,33,71,0.08)]">
      <h2 className="font-display text-lg font-semibold text-[var(--navy-dark)]">Account settings</h2>

      <form onSubmit={handleChangePassword} className="space-y-3">
        <p className="text-xs font-semibold uppercase tracking-wide text-[var(--gray-text)]">
          Change password
        </p>
        <input
          type="password"
          value={currentPassword}
          onChange={(event) => setCurrentPassword(event.target.value)}
          placeholder="Current password"
          aria-label="Current password"
          autoComplete="current-password"
          className="w-full rounded-xl border border-[var(--stroke)] bg-white px-3 py-2 text-sm outline-none focus:border-[var(--primary-blue)]"
          required
        />
        <input
          type="password"
          value={newPassword}
          onChange={(event) => setNewPassword(event.target.value)}
          placeholder="New password (at least 8 characters)"
          aria-label="New password"
          autoComplete="new-password"
          minLength={8}
          className="w-full rounded-xl border border-[var(--stroke)] bg-white px-3 py-2 text-sm outline-none focus:border-[var(--primary-blue)]"
          required
        />
        {passwordError ? <p className="text-sm text-red-700">{passwordError}</p> : null}
        {passwordSuccess ? (
          <p className="text-sm font-semibold text-[var(--primary-blue)]">Password updated.</p>
        ) : null}
        <button
          type="submit"
          disabled={isSavingPassword}
          className="rounded-full bg-[var(--secondary-purple)] px-4 py-2 text-xs font-semibold uppercase tracking-wide text-white transition hover:brightness-110 disabled:cursor-wait disabled:opacity-60"
        >
          {isSavingPassword ? "Saving..." : "Update password"}
        </button>
      </form>

      <div className="border-t border-[var(--stroke)] pt-4">
        <p className="text-xs font-semibold uppercase tracking-wide text-red-700">Danger zone</p>
        {!isConfirmingDelete ? (
          <button
            type="button"
            onClick={() => setIsConfirmingDelete(true)}
            className="mt-2 rounded-full border border-red-200 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-red-700 transition hover:bg-red-50"
          >
            Delete account
          </button>
        ) : (
          <form onSubmit={handleDeleteAccount} className="mt-2 space-y-3">
            <p className="text-sm text-[var(--gray-text)]">
              This permanently deletes your account and all of your boards. Enter your password to
              confirm.
            </p>
            <input
              type="password"
              value={deletePassword}
              onChange={(event) => setDeletePassword(event.target.value)}
              placeholder="Password"
              aria-label="Confirm password to delete account"
              autoComplete="current-password"
              className="w-full rounded-xl border border-[var(--stroke)] bg-white px-3 py-2 text-sm outline-none focus:border-red-400"
              required
            />
            {deleteError ? <p className="text-sm text-red-700">{deleteError}</p> : null}
            <div className="flex items-center gap-2">
              <button
                type="submit"
                disabled={isDeleting}
                className="rounded-full bg-red-600 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-white transition hover:brightness-110 disabled:cursor-wait disabled:opacity-60"
              >
                {isDeleting ? "Deleting..." : "Permanently delete my account"}
              </button>
              <button
                type="button"
                onClick={() => {
                  setIsConfirmingDelete(false);
                  setDeletePassword("");
                  setDeleteError(null);
                }}
                className="rounded-full border border-[var(--stroke)] px-4 py-2 text-xs font-semibold uppercase tracking-wide text-[var(--gray-text)] transition hover:text-[var(--navy-dark)]"
              >
                Cancel
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};
