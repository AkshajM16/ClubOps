import { test, expect, type Page } from "@playwright/test";

async function signIn(page: Page, username: string) {
  await page.goto("/login");
  await page.getByLabel("Username", { exact: true }).fill(username);
  await page
    .getByLabel("Password", { exact: true })
    .fill(process.env.DEMO_PASSWORD || "ClubOps-demo-2026!");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: /Good to see you/ }),
  ).toBeVisible();
}

function cents(text: string) {
  return BigInt(text.replace(/[^0-9]/g, ""));
}

test("login errors, organization dashboard, mobile navigation, and logout", async ({
  page,
}) => {
  await page.goto("/login");
  await page.getByLabel("Username", { exact: true }).fill("member");
  await page.getByLabel("Password", { exact: true }).fill("wrong-password");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText(
    "username or password is incorrect",
  );
  await page
    .getByLabel("Password", { exact: true })
    .fill(process.env.DEMO_PASSWORD || "ClubOps-demo-2026!");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Good to see you, Alex." }),
  ).toBeVisible();
  await expect(page.getByTestId("remaining-budget")).toContainText("$");
  await expect(
    page.getByRole("link", { name: "Approval inbox", exact: true }),
  ).toHaveCount(0);
  await expect(page.getByLabel("WORKSPACE").locator("option")).toHaveCount(1);
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(
    page.getByRole("heading", { name: "Good to see you, Alex." }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page
    .getByRole("link", { name: "Organization settings", exact: true })
    .click();
  await expect(
    page.getByLabel("Admin approval threshold (USD)"),
  ).toBeDisabled();
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Welcome back." }),
  ).toBeVisible();
});

test("member submits a real request, treasurer approves, budget and history persist", async ({
  page,
  browser,
}) => {
  const title = `Workshop sensors ${Date.now()}`;
  await signIn(page, "member");
  const before = cents(await page.getByTestId("approved-budget").innerText());
  await page.getByRole("link", { name: "New request", exact: true }).click();
  await page.getByLabel("Request title", { exact: true }).fill(title);
  await page
    .getByLabel("Description", { exact: true })
    .fill("Sensor kits for our student-led electronics workshop.");
  await page.getByLabel("Amount (USD)", { exact: true }).fill("25.75");
  await page.getByLabel("Category", { exact: true }).selectOption("SUPPLIES");
  await page
    .getByRole("button", { name: "Submit request", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: title, exact: true }),
  ).toBeVisible();
  await expect(page.locator(".badge")).toHaveText("Pending");
  await expect(
    page.getByRole("button", { name: "Approve request", exact: true }),
  ).toHaveCount(0);
  const detailURL = page.url();

  const reviewerContext = await browser.newContext({
    baseURL: new URL(page.url()).origin,
  });
  const reviewer = await reviewerContext.newPage();
  await signIn(reviewer, "treasurer");
  await reviewer
    .getByRole("link", { name: "Approval inbox", exact: true })
    .click();
  await reviewer.getByRole("link", { name: title, exact: true }).click();
  await reviewer
    .getByRole("button", { name: "Approve request", exact: true })
    .click();
  await expect(reviewer.locator(".badge")).toHaveText("Approved");
  await expect(reviewer.locator(".timeline li")).toHaveCount(2);
  await expect(reviewer.locator(".timeline")).toContainText("Jordan Lee");
  await reviewer.getByRole("link", { name: "Overview", exact: true }).click();
  await expect
    .poll(async () =>
      cents(await reviewer.getByTestId("approved-budget").innerText()),
    )
    .toBe(before + 2575n);
  await page.goto(detailURL);
  await expect(page.locator(".badge")).toHaveText("Approved");
  await expect(page.locator(".timeline li")).toHaveCount(2);
  await expect(
    page.getByRole("button", { name: "Cancel request", exact: true }),
  ).toHaveCount(0);
  await reviewerContext.close();
});
