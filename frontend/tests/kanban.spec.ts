import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";
import { initialData } from "@/lib/kanban";

const BOARD_ID = "board-1";
const BOARD_SUMMARY = { id: BOARD_ID, name: "My Board", updated_at: "2026-01-01T00:00:00Z" };

const mockApi = async (page: Page) => {
  await page.route("**/api/auth/me", (route) =>
    route.fulfill({ status: 401, json: { detail: "Not authenticated" } })
  );
  await page.route("**/api/auth/login", (route) =>
    route.fulfill({ status: 200, json: { username: "user" } })
  );
  await page.route("**/api/auth/logout", (route) =>
    route.fulfill({ status: 200, json: { status: "ok" } })
  );
  await page.route("**/api/boards", async (route) => {
    if (route.request().method() === "GET") {
      await route.fulfill({ status: 200, json: [BOARD_SUMMARY] });
      return;
    }
    await route.continue();
  });
  await page.route(`**/api/boards/${BOARD_ID}`, async (route) => {
    if (route.request().method() === "GET") {
      await route.fulfill({ status: 200, json: initialData });
      return;
    }
    await route.fulfill({ status: 200, json: JSON.parse(route.request().postData() ?? "{}") });
  });
};

const signIn = async (page: Page) => {
  await page.getByLabel("Username").fill("user");
  await page.getByLabel("Password").fill("password");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("heading", { name: "Choose a board", exact: true })).toBeVisible();
  await page.getByText("My Board", { exact: true }).click();
  await expect(page.getByRole("heading", { name: "My Board", exact: true })).toBeVisible();
};

test("loads the kanban board", async ({ page }) => {
  await mockApi(page);
  await page.goto("/");
  await signIn(page);
  await expect(page.locator('[data-testid^="column-"]')).toHaveCount(5);
});

test("adds a card to a column", async ({ page }) => {
  await mockApi(page);
  await page.goto("/");
  await signIn(page);
  const firstColumn = page.locator('[data-testid^="column-"]').first();
  await firstColumn.getByRole("button", { name: /add a card/i }).click();
  await firstColumn.getByPlaceholder("Card title").fill("Playwright card");
  await firstColumn.getByPlaceholder("Details").fill("Added via e2e.");
  await firstColumn.getByRole("button", { name: /add card/i }).click();
  await expect(firstColumn.getByText("Playwright card")).toBeVisible();
});

test("moves a card between columns", async ({ page }) => {
  await mockApi(page);
  await page.goto("/");
  await signIn(page);
  const card = page.getByTestId("card-card-1");
  const targetColumn = page.getByTestId("column-col-review");
  const cardBox = await card.boundingBox();
  const columnBox = await targetColumn.boundingBox();
  if (!cardBox || !columnBox) {
    throw new Error("Unable to resolve drag coordinates.");
  }

  await page.mouse.move(
    cardBox.x + cardBox.width / 2,
    cardBox.y + cardBox.height / 2
  );
  await page.mouse.down();
  await page.mouse.move(
    columnBox.x + columnBox.width / 2,
    columnBox.y + 120,
    { steps: 12 }
  );
  await page.mouse.up();
  await expect(targetColumn.getByTestId("card-card-1")).toBeVisible();
});

test("filters cards by search text", async ({ page }) => {
  await mockApi(page);
  await page.goto("/");
  await signIn(page);

  await page.getByLabel("Search cards").fill("roadmap");

  await expect(page.getByText("Align roadmap themes")).toBeVisible();
  await expect(page.getByText("Gather customer signals")).not.toBeVisible();

  await page.getByRole("button", { name: "Clear filters" }).click();
  await expect(page.getByText("Gather customer signals")).toBeVisible();
});

test("creates a new board from the board list", async ({ page }) => {
  await mockApi(page);
  await page.route("**/api/boards", async (route) => {
    if (route.request().method() === "POST") {
      const body = JSON.parse(route.request().postData() ?? "{}");
      await route.fulfill({
        status: 201,
        json: { id: "board-2", name: body.name, updated_at: "2026-01-02T00:00:00Z" },
      });
      return;
    }
    if (route.request().method() === "GET") {
      await route.fulfill({ status: 200, json: [BOARD_SUMMARY] });
      return;
    }
    await route.continue();
  });
  await page.goto("/");
  await page.getByLabel("Username").fill("user");
  await page.getByLabel("Password").fill("password");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("heading", { name: "Choose a board", exact: true })).toBeVisible();

  await page.getByLabel("New board name").fill("Marketing Launch");
  await page.getByRole("button", { name: /create board/i }).click();

  await expect(page.getByText("Marketing Launch", { exact: true })).toBeVisible();
});

test("edits a card's title and priority", async ({ page }) => {
  await mockApi(page);
  await page.goto("/");
  await signIn(page);
  const card = page.getByTestId("card-card-1");

  await card.getByRole("button", { name: /edit align roadmap themes/i }).click();
  const titleInput = card.getByLabel("Card title");
  await titleInput.fill("Renamed via e2e");
  await card.getByLabel("Priority").selectOption("high");
  await card.getByRole("button", { name: "Save" }).click();

  await expect(page.getByText("Renamed via e2e")).toBeVisible();
  await expect(card.getByText("High")).toBeVisible();
});

test("navigates back to the board list", async ({ page }) => {
  await mockApi(page);
  await page.goto("/");
  await signIn(page);

  await page.getByRole("button", { name: "All boards" }).click();

  await expect(page.getByRole("heading", { name: "Choose a board", exact: true })).toBeVisible();
});
