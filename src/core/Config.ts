const DEG = Math.PI / 180;

/**
 * Every tunable lives here (spec section 48, rule 11).
 * Values are starting points and are expected to change during tuning.
 * Units: metres, seconds, radians. "Response" values are damping rates (1/s).
 *
 * Deliberately mutable: the flight tuning panel (Backquote) edits these live.
 */
export const Config = {
  sim: {
    /** Fixed simulation step in seconds (spec section 63). */
    step: 1 / 60,
    /** Frame delta clamp, so a stall cannot cause a spiral of death. */
    maxFrameDelta: 0.1,
    /** Gravity for Rapier dynamic bodies (debris etc). Player gravity is in `ground`. */
    gravity: -9.81,
  },
  render: {
    /** Cap on devicePixelRatio; native ratio on 4K/Retina sinks the frame rate. */
    maxPixelRatio: 1.5,
    fov: 70,
    near: 0.1,
    far: 12000,
    clearColor: 0x8fb8e8,
    fogNear: 600,
    fogFar: 6500,
  },
  input: {
    /** Radians of aim per pixel of mouse movement. */
    mouseSensitivity: 0.0022,
    maxPitch: 85 * DEG,
    /** 1 or -1. */
    invertY: 1,
  },
  gamepad: {
    deadZone: 0.15,
    /** Exponent applied to the look stick; above 1 gives finer control near the centre. */
    lookCurve: 1.6,
    /** Aim speed at full stick deflection, rad/s. */
    lookYawRate: 2.8,
    lookPitchRate: 2,
  },
  player: {
    height: 1.9,
    radius: 0.4,
    /** Gap the character controller keeps from surfaces. */
    skin: 0.05,
    maxSlope: 40 * DEG,
    snapToGround: 0.3,
    /** Falling below this height respawns the player. */
    killPlaneY: -50,
  },
  ground: {
    walkSpeed: 6,
    sprintSpeed: 12,
    response: 12,
    /** Constant downward speed while grounded, so ground contact is detected every step. */
    stickSpeed: 2,
    jumpSpeed: 9,
    gravity: -25,
    terminalSpeed: 80,
    airSpeed: 8,
    airResponse: 2,
    /** Time off the ground before walking off an edge counts as falling. */
    coyoteTime: 0.12,
    landingTime: 0.15,
  },
  flight: {
    /** Upper bounds of the speed tiers (spec section 11), in m/s. */
    hoverMaxSpeed: 15,
    fastSpeed: 90,
    boostSpeed: 160,
    extremeSpeed: 250,
    accelResponse: 0.7,
    boostResponse: 1.5,
    brakeResponse: 3,
    coastResponse: 0.5,
    /** Seconds of sustained boost before the target ramps from boost to extreme speed. */
    extremeDelay: 2,
    extremeRamp: 4,
    /** Extra target speed when pointing straight down. */
    diveBonus: 40,
    /** Turn rate at zero speed and at extreme speed, rad/s. */
    turnRateSlow: 4,
    turnRateFast: 1.2,
    strafeSpeed: 15,
    /** Fraction of strafe speed left at fast speed and above. */
    strafeAtSpeed: 0.3,
    /** A/D turn the aim while flying so keyboard-only steering works, rad/s. */
    yawAssistRate: 1.2,
    verticalSpeed: 25,
    verticalBoostSpeed: 40,
    nudgeResponse: 6,
    reverseSpeed: 8,
    reverseThreshold: 2,
    takeoffKick: 6,
    /** Touching walkable ground below this speed lands. */
    landMaxSpeed: 12,
    /** Extra cruise speed lost on a wall hit, scaled by how head-on it is. */
    scrapeLoss: 0.15,
    /** Head-on hits faster than this bounce instead of sliding. */
    bounceMinSpeed: 30,
    bounceHeadOn: 0.85,
    restitution: 0.2,
    staggerTime: 0.35,
    /** Descent rate and steepness that tag the flight as a dive. */
    diveMinDescent: 20,
    diveMinSteepness: 0.5,
  },
  camera: {
    /** Follow distance at rest and at extreme speed. */
    distance: 7,
    distanceMax: 13,
    distanceResponse: 3,
    /** Distance multiplier while diving (pulls in slightly). */
    diveDistanceScale: 0.88,
    /** Above the hero's head, so the hero sits below the crosshair instead of covering it. */
    pivotHeight: 2.2,
    minHeight: 0.3,
    /** Degrees of FOV added at extreme speed, before `fovKickScale`. */
    fovKick: 28,
    /** Player setting, 0..1. */
    fovKickScale: 1,
    /** Shape of the FOV curve; below 1 gives cruise speed a noticeable share of the kick. */
    fovCurve: 0.6,
    boostFovPunch: 10,
    boostPunchDecay: 2,
    fovResponse: 4,
    maxFov: 105,
    /** Radius of the sphere swept from hero to camera to keep the view out of buildings. */
    collisionRadius: 0.35,
    collisionEaseOut: 4,
    /** Player setting, 0..1. */
    shakeScale: 1,
    shakeMaxAngle: 1.5 * DEG,
    /** Trauma lost per second. */
    shakeDecay: 1.6,
    shakeFrequency: 28,
    boostTrauma: 0.45,
    impactTraumaPerSpeed: 0.008,
    landTrauma: 0.2,
    punchTrauma: 0.35,
    heavyTrauma: 0.6,
    blastHitTrauma: 0.1,
    damageTraumaPerPoint: 0.02,
    landingDip: 0.35,
    dipResponse: 8,
    /** Horizon roll into turns: radians per rad/s of yaw rate, capped at `maxRoll`. */
    rollPerYawRate: 0.03,
    maxRoll: 3 * DEG,
    rollResponse: 5,
  },
  vfx: {
    speedLineCount: 140,
    /** Speed lines fade in between these speeds, m/s. */
    speedLineMinSpeed: 35,
    speedLineFullSpeed: 170,
    speedLineOpacity: 0.55,
    /** Streak length in seconds of travel. */
    speedLineLength: 0.05,
    boomDuration: 0.55,
    boomMaxRadius: 45,
  },
  audio: {
    masterVolume: 0.6,
    windVolume: 0.5,
    windMinCutoff: 180,
    windMaxCutoff: 2600,
    rumbleVolume: 0.35,
    boomVolume: 0.9,
    impactVolume: 0.7,
    /** How quickly the continuous layers follow speed changes. */
    response: 6,
  },
  hud: {
    /** HUD km/h = world m/s * 3.6 * this (spec section 11). */
    displaySpeedScale: 2,
  },
  combat: {
    /** Soft lock-on (spec section 14). */
    targetRange: 250,
    targetCone: 35 * DEG,
    /** Seconds a locked target may stay outside the cone before the lock drops. */
    lockDropTime: 1.5,
    weightAngle: 0.45,
    weightDistance: 0.25,
    weightThreat: 0.15,
    weightSticky: 0.15,

    punchDamage: 25,
    heavyDamage: 60,
    dashDamage: 45,
    blastDamage: 30,
    punchCooldown: 0.3,
    /** A press made too early (cooldown, hit-stop, mid-lunge) still counts for this long. */
    inputBuffer: 0.3,
    /** Hold punch this long, then release, for a heavy punch. */
    heavyChargeTime: 0.45,
    dashCooldown: 3,
    blastCooldown: 0.22,
    blastCost: 18,

    /** Melee assist (spec section 13): a punch lunges at a target inside this range and cone. */
    assistBaseRange: 10,
    assistRangePerSpeed: 0.35,
    assistCone: 55 * DEG,
    lungeMinSpeed: 70,
    lungeSpeedScale: 1.15,
    lungeMaxTime: 0.35,
    /** Gap between hero and target surface that counts as contact. */
    contactRange: 1.2,
    /** Without a lunge target a punch still hits anything in a sphere just ahead. */
    whiffReach: 2.5,
    whiffRadius: 2.5,

    /** Damage and knockback grow with the speed carried into the hit. */
    speedScaleRef: 80,
    maxSpeedBonus: 2,
    punchKnockback: 18,
    heavyKnockback: 45,
    dashKnockback: 35,
    knockbackPerSpeed: 0.5,
    punchHitStop: 0.05,
    heavyHitStop: 0.09,
    dashHitStop: 0.08,
    /** Share of pre-attack speed kept after a hit, so combat does not stop flight. */
    momentumKeep: 0.9,

    dashRange: 140,
    dashSpeed: 220,
    dashMaxTime: 0.8,
    dashExitSpeed: 60,

    blastSpeed: 320,
    blastLife: 1.6,
    blastAssistCone: 9 * DEG,
    blastRadius: 0.6,
    blastKnockback: 6,
    maxProjectiles: 32,
  },
  vitals: {
    maxHealth: 100,
    /** Seconds without damage before health regenerates. */
    healthRegenDelay: 5,
    healthRegen: 20,
    maxEnergy: 100,
    energyRegen: 15,
    energyRegenBoosting: 6,
    /** Energy per second at full extreme speed (spec section 67). */
    extremeDrain: 10,
    /** Height above the spawn roof to reappear at after a knock-out. */
    respawnHeight: 12,
  },
  enemies: {
    /** Hostile drones kept alive around the city until events take over spawning (Phase 8). */
    count: 6,
    /** Seconds between AI decisions per drone; movement still integrates every step. */
    thinkInterval: 0.08,
    detectRange: 220,
    /** Telegraph before a drone that has spotted the player gives chase. */
    detectTime: 0.6,
    loseRange: 450,
    loseTime: 4,
    attackRange: 150,
    preferredRange: 70,
    accel: 2.5,
    patrolRadius: 45,
    patrolSpeedScale: 0.4,
    evadeTime: 0.8,
    evadeCooldown: 3,
    evadeSpeedScale: 1.3,
    /** A player closing faster than this, nearer than this, triggers a jink. */
    evadeTriggerDistance: 55,
    evadeClosingSpeed: 45,
    /** Below this health fraction a drone breaks off once. */
    retreatHealth: 0.25,
    retreatTime: 2.5,
    staggerTime: 0.25,
    knockDamping: 2.2,
    /** Knocked into something faster than this, a drone takes crash damage. */
    crashSpeed: 20,
    crashDamagePerSpeed: 1.2,
    respawnTime: 20,
    /** The training dummy comes back quickly so practice is not interrupted. */
    dummyRespawnTime: 3,
    minAltitude: 10,
    /** Seconds of travel checked ahead for obstacles. */
    avoidLookahead: 1.2,

    telegraphTime: 0.45,
    burstCount: 6,
    burstInterval: 0.1,
    burstCooldown: 2.2,
    /** Slower than boost speed on purpose: the player can out-fly gunfire. */
    bulletSpeed: 140,
    bulletDamage: 4,
    bulletLife: 2.2,
    bulletSpread: 0.02,
    missileCooldown: 6,
    missileSpeed: 75,
    missileTurnRate: 1.4,
    missileDamage: 18,
    missileLife: 7,
    missileRadius: 0.8,
    /** Radius around the hero that enemy fire must enter to hit. */
    playerHitRadius: 0.9,
    maxBullets: 96,
    maxMissiles: 12,
  },
  world: {
    seed: 1337,
    /** Distance from the city centre where the boundary headwind starts (spec section 64). */
    softRadius: 3000,
    /** Over this distance the headwind grows until outward flight stops. */
    boundaryWidth: 1000,
    /** Inward push deep in the boundary, m/s². */
    boundaryPush: 60,
    /** Upward speed fades out between these heights. */
    ceilingStart: 1500,
    ceilingEnd: 2000,
    /** Half size of the ground and water: everything reachable plus margin. */
    halfSize: 6000,
  },
  debug: {
    /** Overlay refresh rate; low so it does not perturb what it measures. */
    overlayHz: 4,
  },
};
