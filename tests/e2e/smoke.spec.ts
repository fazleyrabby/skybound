import { expect, test, type Page } from '@playwright/test';

async function boot(page: Page): Promise<void> {
  await page.goto('/');
  await page.waitForFunction(() => window.__SKYBOUND__?.phase === 'ready');
}

/** Starts the simulation through the test hook, without needing pointer lock. */
async function bootAndStart(page: Page): Promise<void> {
  await boot(page);
  await page.evaluate(() => window.__SKYBOUND__!.start());
}

test('boots, renders and advances the simulation without errors', async ({ page }) => {
  const consoleErrors: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });
  page.on('pageerror', (error) => consoleErrors.push(error.message));

  await boot(page);
  await expect(page.locator('#start-screen')).toContainText('Click to fly');

  // Nothing simulates until the player starts.
  const idle = await page.evaluate(() => window.__SKYBOUND__!.stepCount);
  await page.waitForFunction(
    (frames) => window.__SKYBOUND__!.frameCount > frames + 5,
    await page.evaluate(() => window.__SKYBOUND__!.frameCount),
  );
  expect(await page.evaluate(() => window.__SKYBOUND__!.stepCount)).toBe(idle);

  await page.evaluate(() => window.__SKYBOUND__!.start());
  await expect(page.locator('#start-screen')).toBeHidden();
  await page.waitForFunction((steps) => window.__SKYBOUND__!.stepCount > steps + 10, idle);

  const state = await page.evaluate(() => ({
    errors: window.__SKYBOUND__!.errorCount,
    bodies: window.__SKYBOUND__!.bodyCount,
    drawCalls: window.__SKYBOUND__!.render.drawCalls,
  }));
  // The hero model loaded and every joint was found.
  expect(await page.evaluate(() => window.__SKYBOUND__!.hero)).toMatchObject({
    model: true,
    joints: 14,
  });
  expect(state.errors).toBe(0);
  expect(state.bodies).toBeGreaterThan(500); // ground + city + player
  expect(state.drawCalls).toBeGreaterThan(0);
  expect(consoleErrors).toEqual([]);
});

test('canvas follows the window size with a capped pixel ratio', async ({ page }) => {
  await page.setViewportSize({ width: 800, height: 600 });
  await boot(page);

  const size = () =>
    page.evaluate(() => {
      const canvas = document.querySelector<HTMLCanvasElement>('#game')!;
      const ratio = window.__SKYBOUND__!.render.pixelRatio;
      return { width: canvas.width / ratio, height: canvas.height / ratio, ratio };
    });

  expect(await size()).toMatchObject({ width: 800, height: 600 });
  await page.setViewportSize({ width: 1024, height: 500 });
  await expect.poll(size).toMatchObject({ width: 1024, height: 500 });
  expect((await size()).ratio).toBeLessThanOrEqual(1.5);
});

test('F3 toggles the performance overlay', async ({ page }) => {
  await boot(page);

  const overlay = page.locator('#perf-overlay');
  await expect(overlay).toBeVisible();
  await expect(overlay).toContainText('FPS:');
  await page.keyboard.press('F3');
  await expect(overlay).toBeHidden();
  await page.keyboard.press('F3');
  await expect(overlay).toBeVisible();
});

// Pointer lock itself is not covered here: headless Chromium never grants it.
test('looking around orbits the camera without turning the hero', async ({ page }) => {
  await bootAndStart(page);
  const heading = () => page.evaluate(() => window.__SKYBOUND__!.player.heading);
  const before = await heading();
  await page.evaluate(() => window.__SKYBOUND__!.setAim(1.2, 0.3));
  await page.waitForFunction(
    (steps) => window.__SKYBOUND__!.stepCount > steps + 5,
    await page.evaluate(() => window.__SKYBOUND__!.stepCount),
  );
  expect(await heading()).toBe(before);
});

test('scripted flight: jump, take off, fly, boost, brake, land', async ({ page }) => {
  test.setTimeout(90_000);
  await bootAndStart(page);

  const hold = (action: string, held: boolean) =>
    page.evaluate(
      ([name, down]) => window.__SKYBOUND__!.setAction(name as never, down as boolean),
      [action, held] as const,
    );
  const tap = async (action: string) => {
    await hold(action, true);
    await page.waitForFunction(
      (steps) => window.__SKYBOUND__!.stepCount > steps + 1,
      await page.evaluate(() => window.__SKYBOUND__!.stepCount),
    );
    await hold(action, false);
  };
  const waitForState = (state: string) =>
    page.waitForFunction((expected) => window.__SKYBOUND__!.player.state === expected, state);
  const player = () => page.evaluate(() => window.__SKYBOUND__!.player);

  // Spawned standing on the central rooftop.
  await waitForState('GROUND');
  const spawn = await player();
  expect(spawn.y).toBeGreaterThan(200);

  await tap('ascend');
  await waitForState('JUMPING');
  await tap('ascend');
  await waitForState('HOVERING');

  // Climb out above the test block, then fly.
  await page.evaluate(() => window.__SKYBOUND__!.setAim(0, 0.5));
  await hold('moveForward', true);
  await waitForState('FLYING');
  await page.waitForFunction(() => window.__SKYBOUND__!.player.speed > 40);

  await hold('boost', true);
  await waitForState('BOOSTING');
  await page.waitForFunction(() => window.__SKYBOUND__!.player.speed > 110);
  // Speed feedback: the view widens and the camera pulls back.
  await page.waitForFunction(() => window.__SKYBOUND__!.camera.fov > 80);
  expect((await page.evaluate(() => window.__SKYBOUND__!.camera)).distance).toBeGreaterThan(8);
  const flying = await player();
  expect(flying.y).toBeGreaterThan(spawn.y);
  expect(flying.z).toBeLessThan(spawn.z - 50);

  await hold('boost', false);
  await hold('moveForward', false);
  await hold('moveBack', true);
  await page.waitForFunction(() => window.__SKYBOUND__!.player.speed < 12);
  await hold('moveBack', false);
  await waitForState('HOVERING');

  const hovering = await player();
  await hold('descend', true);
  await page.waitForFunction(() => window.__SKYBOUND__!.player.state === 'GROUND', undefined, {
    timeout: 60_000,
  });
  await hold('descend', false);

  const landed = await player();
  expect(landed.y).toBeLessThan(hovering.y - 5);
  expect(await page.evaluate(() => window.__SKYBOUND__!.errorCount)).toBe(0);
});

test('Backquote toggles the tuning panel and sliders edit live values', async ({ page }) => {
  await boot(page);
  const panel = page.locator('#tuning-panel');
  await expect(panel).toBeHidden();
  await page.keyboard.press('Backquote');
  await expect(panel).toBeVisible();

  const slider = panel.locator('input[data-key="flight.fastSpeed"]');
  await expect(slider).toHaveValue('90');
  await slider.evaluate((element: HTMLInputElement) => {
    element.value = '120';
    element.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await expect(slider.locator('xpath=following-sibling::span')).toHaveText('120');

  await panel.getByRole('button', { name: 'Reset' }).click();
  await expect(slider).toHaveValue('90');
  await page.keyboard.press('Backquote');
  await expect(panel).toBeHidden();
});

test('combat: blast and punch a training dummy', async ({ page }) => {
  await bootAndStart(page);
  const hold = (action: string, held: boolean) =>
    page.evaluate(
      ([name, down]) => window.__SKYBOUND__!.setAction(name as never, down as boolean),
      [action, held] as const,
    );
  const dummy = () => page.evaluate(() => window.__SKYBOUND__!.enemies[0]!);

  // The first dummy hovers just north of the spawn roof, straight ahead.
  const start = await dummy();
  expect(start.health).toBe(100);
  await page.evaluate(() => window.__SKYBOUND__!.setAim(0, 0.08));
  await expect(page.locator('#target-reticle')).toBeVisible();
  await expect.poll(() => page.evaluate(() => window.__SKYBOUND__!.combat.targetId)).toBe(start.id);

  await hold('blast', true);
  await expect.poll(async () => (await dummy()).health).toBeLessThan(100);
  await hold('blast', false);
  expect(await page.evaluate(() => window.__SKYBOUND__!.player.energy)).toBeLessThan(100);
  await expect(page.locator('#hud-energy')).toHaveCSS('opacity', '1');

  // Move in close and punch it until it breaks; it then respawns.
  const target = await dummy();
  await page.evaluate(([x, y, z]) => window.__SKYBOUND__!.teleport(x, y, z + 8), [
    target.x,
    target.y,
    target.z,
  ] as const);
  await expect(async () => {
    await hold('punch', true);
    await page.waitForTimeout(50);
    await hold('punch', false);
    expect((await dummy()).alive).toBe(false);
  }).toPass({ timeout: 20_000 });
  // Destroying it throws an explosion.
  expect(await page.evaluate(() => window.__SKYBOUND__!.particles)).toBeGreaterThan(20);
  await expect.poll(async () => (await dummy()).alive, { timeout: 10_000 }).toBe(true);

  // Lock-on pins the target.
  const respawned = await dummy();
  await page.evaluate(
    ([x, y, z]) => {
      window.__SKYBOUND__!.teleport(x, y, z + 25);
      window.__SKYBOUND__!.setAim(0, 0);
    },
    [respawned.x, respawned.y, respawned.z] as const,
  );
  await hold('lockOn', true);
  await expect.poll(() => page.evaluate(() => window.__SKYBOUND__!.combat.locked)).toBe(true);
  await hold('lockOn', false);

  await page.evaluate(() => window.__SKYBOUND__!.damagePlayer(30));
  await expect(page.locator('#damage-flash')).not.toHaveCSS('opacity', '0');
  expect(await page.evaluate(() => window.__SKYBOUND__!.player.health)).toBe(70);
  expect(await page.evaluate(() => window.__SKYBOUND__!.errorCount)).toBe(0);
});

test('hostile drones patrol, then engage a player who comes close', async ({ page }) => {
  test.setTimeout(150_000);
  await bootAndStart(page);
  const hostile = () =>
    page.evaluate(() => window.__SKYBOUND__!.enemies.find((enemy) => !enemy.passive)!);

  const enemies = await page.evaluate(() => window.__SKYBOUND__!.enemies);
  expect(enemies.filter((enemy) => enemy.passive)).toHaveLength(1);
  // Two standing patrols; the rest wait in reserve for events.
  expect(enemies.filter((enemy) => !enemy.passive && !enemy.dormant)).toHaveLength(2);
  expect(enemies.filter((enemy) => enemy.dormant).length).toBeGreaterThanOrEqual(5);
  expect((await hostile()).state).toBe('PATROL');
  expect(await page.evaluate(() => window.__SKYBOUND__!.player.health)).toBe(100);

  // Hover in the open near the first drone and wait to be shot at.
  const drone = await hostile();
  await page.evaluate(([x, y, z]) => window.__SKYBOUND__!.teleport(x + 90, y + 10, z), [
    drone.x,
    drone.y,
    drone.z,
  ] as const);
  await expect.poll(async () => (await hostile()).state, { timeout: 20_000 }).toBe('ATTACK');
  await expect
    .poll(() => page.evaluate(() => window.__SKYBOUND__!.enemyShots), { timeout: 20_000 })
    .toBeGreaterThan(0);
  // Judge by simulated time, not wall time: software rendering can run far slower than real time.
  const startStep = await page.evaluate(() => window.__SKYBOUND__!.stepCount);
  const result = await page.waitForFunction(
    (from) => {
      const hook = window.__SKYBOUND__!;
      const simSeconds = (hook.stepCount - from) / 60;
      if (hook.player.health < 100 || simSeconds > 45) {
        return { health: hook.player.health, simSeconds };
      }
      return false;
    },
    startStep,
    { timeout: 140_000 },
  );
  const outcome = (await result.jsonValue()) as { health: number; simSeconds: number };
  expect(outcome.health).toBeLessThan(100);
  expect(await page.evaluate(() => window.__SKYBOUND__!.errorCount)).toBe(0);
});

test('street life: chunks, traffic and pedestrians within the draw-call budget', async ({
  page,
}) => {
  await bootAndStart(page);
  const world = () => page.evaluate(() => window.__SKYBOUND__!.world);

  // On the spawn roof: traffic is visible below, pedestrians are not drawn from this height.
  await expect.poll(async () => (await world()).liveChunks).toBeGreaterThan(8);
  expect((await world()).vehicles).toBeGreaterThan(100);
  expect((await world()).pedestrians).toBe(0);

  // Down at street level on the avenue the crowd appears.
  await page.evaluate(() => window.__SKYBOUND__!.teleport(0, 6, 60));
  await expect.poll(async () => (await world()).pedestrians).toBeGreaterThan(15);

  // Far out over the ocean nothing in the core is live.
  await page.evaluate(() => window.__SKYBOUND__!.teleport(2500, 200, 2500));
  await expect.poll(async () => (await world()).liveChunks).toBe(0);
  expect((await world()).vehicles).toBe(0);

  const render = await page.evaluate(() => window.__SKYBOUND__!.render);
  expect(render.drawCalls).toBeLessThanOrEqual(300);
  expect(render.triangles).toBeLessThanOrEqual(1_500_000);
  expect(await page.evaluate(() => window.__SKYBOUND__!.errorCount)).toBe(0);
});

test('world event: a drone attack is announced, marked, and pays out when cleared', async ({
  page,
}) => {
  await bootAndStart(page);
  const event = () => page.evaluate(() => window.__SKYBOUND__!.event);
  expect((await event()).phase).toBe('IDLE');
  await expect(page.locator('#event-banner')).toBeHidden();

  expect(await page.evaluate(() => window.__SKYBOUND__!.triggerEvent(1))).toBe(true);
  expect(await event()).toMatchObject({ phase: 'ACTIVE', site: 'Harbor' });
  await expect(page.locator('#event-banner')).toContainText('DRONE ATTACK');
  await expect(page.locator('#event-banner')).toContainText('Harbor');
  await expect(page.locator('#event-marker')).toContainText(' m');

  const squad = await page.evaluate(() =>
    window.__SKYBOUND__!.enemies.filter((e) => !e.passive && !e.dormant && e.alive).slice(2),
  );
  expect(squad.length).toBeGreaterThanOrEqual(3);

  // Arriving at the site stops the clock.
  await page.evaluate(() => window.__SKYBOUND__!.teleport(250, 140, 480));
  await expect.poll(async () => (await event()).phase).toBe('ENGAGED');

  for (const drone of squad) {
    await page.evaluate((id) => window.__SKYBOUND__!.destroyEnemy(id), drone.id);
  }
  await expect.poll(async () => (await event()).phase).toBe('SUCCESS');
  await expect(page.locator('#event-banner')).toContainText('CLEARED');
  await expect(page.locator('#score')).toContainText('SCORE');
  expect(await page.evaluate(() => window.__SKYBOUND__!.score)).toBeGreaterThanOrEqual(300);
  await expect(page.locator('#event-marker')).toBeHidden();
  expect(await page.evaluate(() => window.__SKYBOUND__!.errorCount)).toBe(0);
});
