import { test, expect, type Page } from "@playwright/test";

async function login(page: Page, name: string) {
  await page.goto("/login");
  await page.getByLabel("Email", { exact: true }).fill(`${name.toLowerCase()}@example.com`);
  await page.getByLabel("Password", { exact: true }).fill("drawing-test-password");
  await page.getByRole("button", { name: "Login", exact: true }).click();
  await expect(page.getByText(`Hello, ${name}`, { exact: true })).toBeVisible();
}

async function draw(page: Page, large = false) {
  const bounds = await page.getByLabel("Draw your message here").boundingBox();
  if (!bounds) throw new Error("Drawing canvas is missing");
  await page.mouse.move(bounds.x + 30, bounds.y + 30);
  await page.mouse.down();
  await page.mouse.move(bounds.x + 100, bounds.y + 80, { steps: 20 });
  await page.mouse.move(bounds.x + 160, bounds.y + 30, { steps: 20 });
  if (large) {
    await page.getByLabel("Draw your message here").evaluate(canvas => {
      const box = canvas.getBoundingClientRect();
      for (let index = 0; index < 4000; index++) {
        canvas.dispatchEvent(new PointerEvent("pointermove", {
          bubbles: true, pointerId: 1, isPrimary: true,
          clientX: box.x + 10 + (index % 100), clientY: box.y + 10 + (index % 60),
        }));
      }
    });
  }
  await page.mouse.up();
}

test("two accounts exchange drawings, acknowledge delivery, disconnect and reconnect", async ({ browser }) => {
  const aliceContext = await browser.newContext();
  const bobContext = await browser.newContext();
  const alice = await aliceContext.newPage();
  const bob = await bobContext.newPage();
  const errors: string[] = [];
  alice.on("pageerror", error => errors.push(error.message));
  bob.on("pageerror", error => errors.push(error.message));
  try {
    await login(alice, "Alice");
    await login(bob, "Bob");
    await expect(alice.getByRole("button", { name: "Send drawing", exact: true })).toBeDisabled();
    await alice.getByRole("button", { name: /Bob .*Invite to draw/ }).click();
    await bob.getByRole("button", { name: "Accept invitation" }).click();
    await expect(alice.getByText("Connected · Ready to share drawings", { exact: true })).toBeVisible();
    await expect(bob.getByText("Connected · Ready to share drawings", { exact: true })).toBeVisible();
    await draw(alice, true);
    await alice.getByLabel("Add a caption (optional)").fill("Hello from Alice 🎨");
    await alice.getByRole("button", { name: "Send drawing", exact: true }).click();
    await expect(bob.getByRole("img", { name: "Drawing message" })).toHaveCount(1);
    await expect(bob.getByText("Hello from Alice 🎨", { exact: true })).toBeVisible();
    await expect(alice.getByText("Delivered", { exact: true })).toBeVisible();
    await expect(alice.getByRole("button", { name: "Undo", exact: true })).toBeDisabled();
    await draw(bob);
    await bob.getByLabel("Add a caption (optional)").fill("A sketch back from Bob");
    await bob.getByRole("button", { name: "Send drawing", exact: true }).click();
    await expect(alice.getByRole("img", { name: "Drawing message" })).toHaveCount(2);
    await expect(bob.getByText("Delivered", { exact: true })).toBeVisible();
    await bob.getByRole("button", { name: "Disconnect", exact: true }).click();
    await expect(alice.getByRole("button", { name: /Bob .*Invite to draw/ })).toBeEnabled();
    await expect(alice.getByRole("img", { name: "Drawing message" })).toHaveCount(2);
    await alice.getByRole("button", { name: /Bob .*Invite to draw/ }).click();
    await bob.getByRole("button", { name: "Accept invitation" }).click();
    await expect(alice.getByText("Connected · Ready to share drawings", { exact: true })).toBeVisible();
    await draw(alice);
    await alice.getByRole("button", { name: "Send drawing", exact: true }).click();
    await expect(bob.getByRole("img", { name: "Drawing message" })).toHaveCount(3);
    await expect(alice.getByText("Delivered", { exact: true })).toHaveCount(2);
    await expect(alice.getByRole("button", { name: "Blue", exact: true })).toBeInViewport();
    await alice.screenshot({ path: "test-results/conversation-desktop.png", fullPage: true });
    await alice.setViewportSize({ width: 390, height: 844 });
    await alice.screenshot({ path: "test-results/conversation-mobile.png", fullPage: true });
    expect(await alice.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    expect(errors).toEqual([]);
  } finally { await aliceContext.close(); await bobContext.close(); }
});

test("decline, duplicate tab protection, and unauthenticated workspace redirect", async ({ browser }) => {
  const aliceContext = await browser.newContext();
  const bobContext = await browser.newContext();
  const alice = await aliceContext.newPage(), bob = await bobContext.newPage();
  try {
    await alice.goto("/workspace");
    await expect(alice).toHaveURL(/\/login$/);
    await login(alice, "Alice");
    await login(bob, "Bob");
    await alice.getByRole("button", { name: /Bob .*Invite to draw/ }).click();
    await bob.getByRole("button", { name: "Decline", exact: true }).click();
    await expect(alice.getByText("Invitation declined.", { exact: true })).toBeVisible();
    const duplicate = await aliceContext.newPage();
    await duplicate.goto("/workspace");
    await expect(duplicate.getByText("Messaging is already open in another tab. Close it, then reconnect here.", { exact: true })).toBeVisible();
    await duplicate.close();
    await expect(alice.getByRole("button", { name: /Bob .*Invite to draw/ })).toBeEnabled();
  } finally { await aliceContext.close(); await bobContext.close(); }
});
