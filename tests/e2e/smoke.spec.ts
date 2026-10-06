import { expect, test, type Page } from '@playwright/test';

async function boot(page: Page): Promise<void> {
  await page.goto('/');
  await page.waitForFunction(() => window.__SKYBOUND__?.phase === 'ready');
  // Software rendering is slow; pin the preset so adaptive quality does not thin the world mid-test.
  await page.evaluate(() => window.__SKYBOUND__!.setQuality('HIGH'));
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

test('hero animation: reverse strafing stays upright and damage returns to movement', async ({
  page,
}) => {
  await bootAndStart(page);
  await page.evaluate(() => {
    const hook = window.__SKYBOUND__!;
    hook.teleport(0, 600, 0);
    hook.setAim(0, 0);
    hook.setAction('moveRight', true);
    hook.setAction('moveBack', true);
  });
  // The combined nudge exceeds the flight-state threshold without any cruise.
  await page.waitForFunction(() => {
    const hook = window.__SKYBOUND__!;
    return hook.player.state === 'FLYING' && hook.player.speed > 16;
  });
  expect(await page.evaluate(() => window.__SKYBOUND__!.hero.pose)).toBe('hover');
  await page.evaluate(() => {
    const hook = window.__SKYBOUND__!;
    hook.setAction('moveRight', false);
    hook.setAction('moveBack', false);
    hook.damagePlayer(10);
  });
  // Software frames can outlast the short hit pose; unit tests check that pose itself.
  await expect.poll(() => page.evaluate(() => window.__SKYBOUND__!.hero.pose)).toBe('hover');
  expect(await page.evaluate(() => window.__SKYBOUND__!.errorCount)).toBe(0);
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
  // Standing on the roof, not sinking into it: the height holds over time.
  await page.waitForFunction(
    (steps) => window.__SKYBOUND__!.stepCount > steps + 90,
    await page.evaluate(() => window.__SKYBOUND__!.stepCount),
  );
  expect((await player()).y).toBeCloseTo(spawn.y, 2);
  expect(spawn.y).toBeCloseTo(240 + 0.95 + 0.05, 2);

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

test('debug menu opens with Backquote; 9 opens the tuning panel and sliders edit live values', async ({
  page,
}) => {
  await boot(page);
  const panel = page.locator('#tuning-panel');
  await expect(panel).toBeHidden();
  await expect(page.locator('#debug-menu')).toBeHidden();
  await page.keyboard.press('Digit9'); // does nothing while the menu is closed
  await expect(panel).toBeHidden();
  await page.keyboard.press('Backquote');
  await expect(page.locator('#debug-menu')).toContainText('Spawn boss');
  await page.keyboard.press('Digit9');
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
  await page.keyboard.press('Digit9');
  await expect(panel).toBeHidden();

  // Other debug actions: weather, god mode.
  await page.keyboard.press('Digit4');
  await expect(page.locator('#debug-status')).toContainText('Toggle weather');
  await page.keyboard.press('Digit6');
  await page.evaluate(() => window.__SKYBOUND__!.damagePlayer(50));
  expect(await page.evaluate(() => window.__SKYBOUND__!.player.health)).toBe(100);
  await page.keyboard.press('Backquote');
  await expect(page.locator('#debug-menu')).toBeHidden();
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
  const emissionsBefore = await page.evaluate(() => window.__SKYBOUND__!.emittedParticles);
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
  // Count emissions rather than survivors: particles expire during slow software-rendered frames.
  expect(await page.evaluate(() => window.__SKYBOUND__!.emittedParticles)).toBeGreaterThan(
    emissionsBefore + 20,
  );
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

test('missions: beacon prompt, First Flight objectives, reward, and progress saved across reloads', async ({
  page,
}) => {
  test.setTimeout(90_000);
  await bootAndStart(page);
  const mission = () => page.evaluate(() => window.__SKYBOUND__!.mission);
  const hold = (action: string, held: boolean) =>
    page.evaluate(
      ([name, down]) => window.__SKYBOUND__!.setAction(name as never, down as boolean),
      [action, held] as const,
    );

  expect((await mission()).available).toEqual(['first-flight']);
  await expect(page.locator('#hud-speed')).toContainText('km/h');

  // Walk up to the beacon on the spawn roof: the mission is offered; E starts it.
  const spawn = await page.evaluate(() => window.__SKYBOUND__!.player);
  await page.evaluate(([x, y, z]) => window.__SKYBOUND__!.teleport(x + 9, y + 1.5, z + 6), [
    spawn.x,
    spawn.y,
    spawn.z,
  ] as const);
  await expect(page.locator('#mission-prompt')).toContainText('FIRST FLIGHT');
  await hold('interact', true);
  await expect.poll(async () => (await mission()).active).toBe('first-flight');
  await hold('interact', false);

  // Teleporting leaves the hero hovering, so take-off is already done: straight to the rings.
  await expect(page.locator('#mission-panel')).toContainText('Fly through the rings');
  await expect(page.locator('#mission-marker')).toContainText(' m');

  // Fly the course by visiting each ring, approaching from a short way off.
  for (let ring = 0; ring < 8; ring++) {
    const target = (await mission()).target!;
    expect(target.kind).toBe('ring');
    await page.evaluate(([x, y, z]) => window.__SKYBOUND__!.teleport(x, y, z), [
      target.x,
      target.y,
      target.z,
    ] as const);
    // After the last ring the objective itself changes, so its progress text does too.
    if (ring < 7) {
      await expect
        .poll(async () => (await mission()).progress, { timeout: 10_000 })
        .toBe(`${ring + 1} / 8`);
    } else {
      await expect
        .poll(async () => (await mission()).objective, { timeout: 10_000 })
        .toContain('Boost');
    }
  }

  // Boost step.
  await expect(page.locator('#mission-panel')).toContainText('Boost');
  await page.evaluate(() => {
    const hook = window.__SKYBOUND__!;
    hook.teleport(0, 600, 0);
    hook.setAim(0, 0);
    hook.setAction('moveForward', true);
    hook.setAction('boost', true);
  });
  await expect(page.locator('#mission-panel')).toContainText('Land', { timeout: 30_000 });
  await hold('moveForward', false);
  await hold('boost', false);

  // Land on the spawn roof.
  await page.evaluate(([x, y, z]) => window.__SKYBOUND__!.teleport(x, y + 3, z), [
    spawn.x,
    spawn.y,
    spawn.z,
  ] as const);
  await hold('descend', true);
  await expect.poll(async () => (await mission()).result, { timeout: 20_000 }).toBe('complete');
  await hold('descend', false);
  await expect(page.locator('#mission-panel')).toContainText('MISSION COMPLETE');
  const score = await page.evaluate(() => window.__SKYBOUND__!.score);
  expect(score).toBeGreaterThanOrEqual(300);
  expect((await mission()).available).toEqual(['first-flight', 'drone-swarm']);

  // Progress survives a reload.
  await page.reload();
  await page.waitForFunction(() => window.__SKYBOUND__?.phase === 'ready');
  expect(await page.evaluate(() => window.__SKYBOUND__!.score)).toBe(score);
  expect((await mission()).completed).toEqual(['first-flight']);
  expect((await mission()).available).toEqual(['first-flight', 'drone-swarm']);
  expect(await page.evaluate(() => window.__SKYBOUND__!.errorCount)).toBe(0);
});

test('Titan: unlocked by progress, three phases, defeat completes the mission', async ({
  page,
}) => {
  test.setTimeout(120_000);
  // A save with the first two missions done unlocks Titan.
  await page.addInitScript(() => {
    if (!window.localStorage.getItem('skybound.save')) {
      window.localStorage.setItem(
        'skybound.save',
        JSON.stringify({
          version: 1,
          score: 1100,
          eventsCompleted: 0,
          eventsFailed: 0,
          missionsCompleted: ['first-flight', 'drone-swarm'],
        }),
      );
    }
  });
  await bootAndStart(page);
  const boss = () => page.evaluate(() => window.__SKYBOUND__!.boss);
  const mission = () => page.evaluate(() => window.__SKYBOUND__!.mission);

  expect((await mission()).available).toEqual(['first-flight', 'drone-swarm', 'titan']);
  expect((await boss()).alive).toBe(false);
  await expect(page.locator('#boss-bar')).toBeHidden();

  expect(await page.evaluate(() => window.__SKYBOUND__!.startMission('titan'))).toBe(true);
  await expect.poll(async () => (await boss()).state).toBe('INTRO');
  await expect(page.locator('#boss-title')).toBeVisible();
  await expect(page.locator('#boss-bar')).toContainText('PHASE 1');
  await expect(page.locator('#mission-panel')).toContainText('Defeat Titan');

  await expect.poll(async () => (await boss()).state, { timeout: 30_000 }).toBe('FIGHT');
  await expect(page.locator('#boss-title')).toBeHidden();
  expect((await boss()).targets).toBe(3); // hull and two engines

  // Break each phase; health stops at the threshold each time.
  await page.evaluate(() => window.__SKYBOUND__!.damageBoss(1e9));
  expect(await boss()).toMatchObject({ phase: 2, state: 'STAGGER' });
  expect((await boss()).health).toBeCloseTo(0.7, 5);
  await expect.poll(async () => (await boss()).state, { timeout: 30_000 }).toBe('FIGHT');
  await expect(page.locator('#boss-bar')).toContainText('PHASE 2');
  expect((await boss()).targets).toBe(5);

  await page.evaluate(() => window.__SKYBOUND__!.damageBoss(1e9));
  await expect.poll(async () => (await boss()).state, { timeout: 30_000 }).toBe('FIGHT');
  expect(await boss()).toMatchObject({ phase: 3, targets: 6 });

  await page.evaluate(() => window.__SKYBOUND__!.damageBoss(1e9));
  expect((await boss()).state).toBe('DYING');
  await expect.poll(async () => (await boss()).defeated, { timeout: 40_000 }).toBe(true);
  await expect.poll(async () => (await mission()).result).toBe('complete');
  await expect(page.locator('#mission-panel')).toContainText('MISSION COMPLETE');
  await expect(page.locator('#boss-bar')).toBeHidden();
  expect(await page.evaluate(() => window.__SKYBOUND__!.score)).toBe(1100 + 2000);
  expect((await mission()).completed).toContain('titan');
  expect(await page.evaluate(() => window.__SKYBOUND__!.errorCount)).toBe(0);
});

test('audio: unlocked by the start click, music follows the action, whoosh near buildings', async ({
  page,
}) => {
  await boot(page);
  const audio = () => page.evaluate(() => window.__SKYBOUND__!.audio);
  expect((await audio()).running).toBe(false); // nothing before a user gesture

  // The click is the gesture. Pointer lock is refused in headless, so start via the hook after.
  await page.locator('#start-prompt').click();
  await page.evaluate(() => window.__SKYBOUND__!.start());
  await expect.poll(async () => (await audio()).running).toBe(true);
  expect((await audio()).intensity).toBeLessThan(0.1);

  // A boss fight drives the music to full intensity.
  await page.evaluate(() => window.__SKYBOUND__!.spawnBoss());
  await expect
    .poll(async () => (await audio()).intensity, { timeout: 20_000 })
    .toBeGreaterThan(0.7);

  // Fast down the avenue canyon, close to the towers: the whoosh comes in.
  await page.evaluate(() => {
    const hook = window.__SKYBOUND__!;
    hook.teleport(18, 60, 200);
    hook.setAim(0, 0);
    hook.setAction('moveForward', true);
    hook.setAction('boost', true);
  });
  await expect.poll(async () => (await audio()).whoosh, { timeout: 15_000 }).toBeGreaterThan(0.2);
  expect(await page.evaluate(() => window.__SKYBOUND__!.errorCount)).toBe(0);
});

test('atmosphere: time of day and rain change the world without errors or blowing the budget', async ({
  page,
}) => {
  const consoleErrors: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });
  await bootAndStart(page);
  const world = () => page.evaluate(() => window.__SKYBOUND__!.world);

  expect((await world()).night).toBe(0); // starts mid-morning
  expect((await world()).rain).toBe(0);

  await page.evaluate(() => window.__SKYBOUND__!.setTime(0));
  await expect.poll(async () => (await world()).night).toBe(1);

  await page.evaluate(() => window.__SKYBOUND__!.setWeather('rain'));
  await expect.poll(async () => (await world()).rain, { timeout: 30_000 }).toBeGreaterThan(0.5);

  await page.evaluate(() => window.__SKYBOUND__!.setTime(18.5));
  await expect.poll(async () => (await world()).hour).toBe(18.5);

  const render = await page.evaluate(() => window.__SKYBOUND__!.render);
  expect(render.drawCalls).toBeLessThanOrEqual(300); // shadow pass included
  expect(consoleErrors).toEqual([]);
  expect(await page.evaluate(() => window.__SKYBOUND__!.errorCount)).toBe(0);
});

test('quality: presets change resolution, shadows and density; the simulation stays within budget', async ({
  page,
}) => {
  await bootAndStart(page);
  const quality = () => page.evaluate(() => window.__SKYBOUND__!.quality);
  const world = () => page.evaluate(() => window.__SKYBOUND__!.world);
  const drawCalls = async () => {
    await page.waitForFunction(
      (frames) => window.__SKYBOUND__!.frameCount > frames + 3,
      await page.evaluate(() => window.__SKYBOUND__!.frameCount),
    );
    return page.evaluate(() => window.__SKYBOUND__!.render.drawCalls);
  };

  expect(await quality()).toMatchObject({ preset: 'HIGH', auto: false });
  await expect.poll(async () => (await world()).vehicles).toBeGreaterThan(100);
  const highCalls = await drawCalls();

  // LOW: no shadow pass, lower resolution ceiling, thinner traffic.
  await page.evaluate(() => window.__SKYBOUND__!.setQuality('LOW'));
  expect(await quality()).toMatchObject({ preset: 'LOW', auto: false });
  expect((await quality()).pixelRatio).toBeLessThanOrEqual(1);
  expect(await page.evaluate(() => window.__SKYBOUND__!.render.pixelRatio)).toBeLessThanOrEqual(1);
  await expect.poll(async () => (await world()).vehicles).toBeLessThan(90);
  expect(await drawCalls()).toBeLessThan(highCalls);

  // Auto hands control back; on slow software rendering it must never go above its ceiling.
  await page.evaluate(() => window.__SKYBOUND__!.setQuality('auto'));
  expect((await quality()).auto).toBe(true);
  expect(['MOBILE', 'LOW', 'MEDIUM', 'HIGH']).toContain((await quality()).preset);

  // CPU budget for the simulation is 4 ms per frame (spec section 38).
  await page.evaluate(() => window.__SKYBOUND__!.triggerEvent(0));
  const samples: number[] = [];
  for (let i = 0; i < 20; i++) {
    samples.push(await page.evaluate(() => window.__SKYBOUND__!.simMs));
    await page.waitForTimeout(50);
  }
  samples.sort((a, b) => a - b);
  expect(samples[Math.floor(samples.length / 2)]).toBeLessThan(4);
  expect(await page.evaluate(() => window.__SKYBOUND__!.errorCount)).toBe(0);
});

test('menus: settings apply and persist, mission select starts a mission, hints guide a new player', async ({
  page,
}) => {
  await page.goto('/');
  await page.waitForFunction(() => window.__SKYBOUND__?.phase === 'ready');
  const menu = page.locator('#start-screen');
  const panel = page.locator('#menu-panel');
  await expect(menu).toContainText('Click to fly');
  await expect(panel).toContainText('accelerate / brake'); // controls shown by default

  // Opening a tab does not start the game.
  await menu.locator('button[data-tab="settings"]').click();
  expect(await page.evaluate(() => window.__SKYBOUND__!.phase)).toBe('ready');
  await expect(panel).toContainText('Look sensitivity');

  // Change a slider, a toggle and the quality preset.
  await panel.locator('input[data-setting="fov"]').evaluate((element: HTMLInputElement) => {
    element.value = '85';
    element.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await panel.locator('input[data-setting="invertY"]').check();
  await panel.locator('select[data-setting="quality"]').selectOption('LOW');
  expect(await page.evaluate(() => window.__SKYBOUND__!.quality)).toMatchObject({
    preset: 'LOW',
    auto: false,
  });

  // They survive a reload.
  await page.reload();
  await page.waitForFunction(() => window.__SKYBOUND__?.phase === 'ready');
  await menu.locator('button[data-tab="settings"]').click();
  await expect(panel.locator('input[data-setting="fov"]')).toHaveValue('85');
  await expect(panel.locator('input[data-setting="invertY"]')).toBeChecked();
  await expect(panel.locator('select[data-setting="quality"]')).toHaveValue('LOW');
  expect((await page.evaluate(() => window.__SKYBOUND__!.quality)).preset).toBe('LOW');

  // Reset puts them back.
  await panel.locator('button[data-action="reset-settings"]').click();
  await expect(panel.locator('input[data-setting="fov"]')).toHaveValue('70');
  await expect(panel.locator('input[data-setting="invertY"]')).not.toBeChecked();

  // Mission select: only First Flight can be started at first.
  await menu.locator('button[data-tab="missions"]').click();
  await expect(panel).toContainText('First Flight');
  await expect(panel).toContainText('Locked: complete First Flight first');
  await expect(panel.locator('button[data-mission="drone-swarm"]')).toBeDisabled();
  await panel.locator('button[data-mission="first-flight"]').click();
  expect((await page.evaluate(() => window.__SKYBOUND__!.mission)).active).toBe('first-flight');

  await menu.locator('button[data-tab="credits"]').click();
  await expect(panel).toContainText('working title');

  // Playing: a new player on the ground gets the walking and take-off hint.
  await page.evaluate(() => {
    window.__SKYBOUND__!.abandonMission();
    window.__SKYBOUND__!.start();
  });
  await expect(menu).toBeHidden();
  await expect(page.locator('#hint')).toContainText('Space');
  expect(await page.evaluate(() => window.__SKYBOUND__!.errorCount)).toBe(0);
});
