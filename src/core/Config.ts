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
    /** Dynamic resolution never drops below this pixel ratio. Set by the quality preset. */
    minPixelRatio: 1,
    /** Frame time the adaptive quality system tries to hold, ms. */
    targetFrameMs: 16.7,
    /** One shadow-casting light whose frustum follows the player (spec section 32). */
    shadows: 1,
    shadowMapSize: 2048,
    /** Half width of the area around the player that receives shadows, metres. */
    shadowRange: 170,
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
    jumpSpeed: 9,
    gravity: -25,
    terminalSpeed: 80,
    airSpeed: 8,
    airResponse: 2,
    /** Time off the ground before walking off an edge counts as falling. */
    coyoteTime: 0.12,
    landingTime: 0.15,
  },
  /** Presentation only: hero silhouette and animation. */
  hero: {
    tiltFullSpeed: 45,
    maxTilt: 0.94,
    orientationResponse: 10,
    /** Release the visual crouch offset smoothly when leaving a surface. */
    groundReleaseResponse: 14,
    minLeanSpeed: 1,
    stridePerMetre: 2.6,
    walkMinSpeed: 0.6,
    verticalPoseSpeed: 4,
    verticalPoseMaxCruise: 12,
    punchHold: 0.24,
    blastHold: 0.2,
    landingHold: 0.55,
    damageHold: 0.22,
    chargeShownAbove: 0.35,
    /** Body roll into an actual travel turn; looking around alone never banks it. */
    bankPerTurnRate: 0.16,
    bankMax: 25 * DEG,
    bankResponse: 6,
    poseResponse: {
      idle: 10,
      walkA: 14,
      walkB: 14,
      jump: 12,
      fall: 8,
      land: 22,
      hover: 6,
      ascend: 8,
      descend: 8,
      fly: 7,
      boost: 9,
      dive: 8,
      charge: 16,
      punch: 34,
      blast: 30,
      damage: 24,
    },
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
    /** Size of the shared particle pool; the oldest particle is recycled when it is full. */
    maxParticles: 700,
    /** Multiplies every burst's particle count; quality presets lower it. */
    particleScale: 1,
    /** Downward acceleration applied to debris, m/s². */
    particleGravity: 18,
    maxShockRings: 4,
    /** Seconds between smoke puffs behind a missile or a badly damaged drone. */
    smokeInterval: 0.035,
    damageFlashTime: 0.35,
    /** 1 normally; 0 with the reduce-flashes setting. Scales bright full-screen and burst flashes. */
    flashScale: 1,
  },
  audio: {
    masterVolume: 0.6,
    /** Bus levels under the master; the settings screen will expose these. */
    musicVolume: 0.5,
    sfxVolume: 1,
    windVolume: 0.5,
    windMinCutoff: 180,
    windMaxCutoff: 2600,
    rumbleVolume: 0.35,
    boomVolume: 0.9,
    impactVolume: 0.7,
    /** Rush of air when passing close to buildings at speed (spec section 40). */
    whooshVolume: 0.45,
    /** Surfaces nearer than this, to either side or below, count as close. */
    whooshRange: 30,
    /** Below this speed there is no whoosh. */
    whooshMinSpeed: 30,
    /** Street hum heard near the ground inside the city. */
    cityVolume: 0.12,
    cityMaxAltitude: 160,
    rainVolume: 0.3,
    /** How quickly the continuous layers follow speed changes. */
    response: 6,
    /** Beats per minute while exploring or fighting, and in the boss fight. */
    musicTempo: 96,
    musicBossTempo: 132,
    /** How fast the music follows a change in intensity, 1/s. */
    musicResponse: 0.6,
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
    /** Standing patrols that respawn, so the city is never empty between events. */
    count: 2,
    /** Dormant drones held ready for events to deploy. */
    reserve: 8,
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
  titan: {
    /** Sized for a 4-6 minute fight (spec section 17). Tune by playing. */
    maxHealth: 9000,
    radius: 14,
    /** Health fractions at which phases 2 and 3 begin. Each is a checkpoint. */
    phase2At: 0.7,
    phase3At: 0.3,
    /** Seconds Titan reels, invulnerable, when a phase breaks. */
    phaseStagger: 2.2,
    /** Share of damage the hull takes in each phase; weak points take more. */
    hullArmor1: 0.35,
    hullArmor2: 0.5,
    hullArmor3: 0.6,
    weakMultiplier: 1.5,
    reactorMultiplier: 2.5,
    weakRadius: 3.5,
    speed1: 18,
    speed2: 30,
    speed3: 46,
    accel: 0.8,
    turnRate: 0.9,
    waypointReach: 30,

    gunRange: 450,
    gunInterval: 2.6,
    gunBurst: 10,
    gunBurstInterval: 0.07,
    missileInterval: 7,
    missileSalvo: 3,
    laserInterval: 11,
    /** Warning time before the beam fires. */
    laserCharge: 1.3,
    laserDuration: 2.6,
    /** The beam tracks the player this slowly, so it can be out-flown, rad/s. */
    laserTurnRate: 0.45,
    laserDps: 28,
    laserRadius: 3.5,
    laserLength: 600,
    meleeRange: 38,
    meleeWindup: 0.7,
    meleeDamage: 28,
    meleeKnockback: 90,
    meleeCooldown: 4,
    pulseInterval: 10,
    pulseWindup: 1.1,
    pulseSpeed: 110,
    pulseMaxRadius: 150,
    /** The shockwave hurts within this distance of its expanding shell. */
    pulseThickness: 7,
    pulseDamage: 22,

    /** Seconds the camera is drawn to Titan when it appears. */
    introTime: 3,
    introAimResponse: 2.5,
    dyingTime: 3.5,
    reward: 2000,
  },
  events: {
    /** Seconds of free flight before the first event. */
    firstDelay: 25,
    /** Quiet time between events, seconds. */
    minGap: 25,
    maxGap: 50,
    /** An event the player never goes to ends in failure after this long. */
    timeLimit: 100,
    /** Within this distance of the site the player counts as engaged and the clock stops. */
    engageRange: 320,
    squadMin: 3,
    squadMax: 5,
    /** Drones appear scattered this far around the site. */
    squadSpread: 55,
    rewardPerDrone: 100,
    /** Bonus for each second left on the clock. */
    rewardPerSecond: 2,
    /** How long the result stays on screen before the next quiet period starts. */
    resultHold: 4,
  },
  missions: {
    /** Fly within this distance of a checkpoint to pass it, unless the checkpoint sets its own. */
    checkpointRadius: 16,
    /** Stand this close to a mission beacon to be offered it. */
    beaconRange: 7,
    firstFlightReward: 300,
    /** Speed, in m/s, the First Flight boost step asks for. */
    firstFlightBoostSpeed: 120,
    droneSwarmReward: 800,
    droneSwarmTotal: 10,
    /** Drones in the air at once during Drone Swarm. */
    droneSwarmWave: 4,
    /** How long the result stays on screen. */
    resultHold: 5,
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

    /** Chunks (spec section 34): the core is a grid of square chunks that switch street life on and off. */
    chunkSize: 200,
    /** A chunk is live when its centre is this close to the player, or to where they will be. */
    chunkActiveRadius: 420,
    /** Seconds of travel used to predict where the player will be. */
    chunkLookAhead: 1.5,
    /** Chunk switches allowed per update, so fast flight never causes a hitch. */
    chunkChangesPerUpdate: 2,

    vehicleCount: 150,
    vehicleMinSpeed: 9,
    vehicleMaxSpeed: 18,
    pedestrianCount: 320,
    pedestrianMinSpeed: 1.1,
    pedestrianMaxSpeed: 1.9,
    /** Pedestrians are a few pixels from high up; do not draw them above this height or beyond this range. */
    pedestrianMaxAltitude: 140,
    pedestrianRange: 260,
    streetLightSpacing: 40,

    /** Real seconds for a full day. */
    dayLength: 900,
    startHour: 10,
    /** Seconds of clear weather between showers, and how long a shower lasts. */
    clearMin: 200,
    clearMax: 420,
    rainMin: 60,
    rainMax: 130,
    /** How quickly rain builds and fades, 1/s. */
    rainResponse: 0.25,
    rainStreaks: 600,
  },
  /** Density multipliers set by the quality preset (spec section 37). 1 is full. */
  quality: {
    vehicles: 1,
    pedestrians: 1,
    rain: 1,
  },
  debug: {
    /** Overlay refresh rate; low so it does not perturb what it measures. */
    overlayHz: 4,
  },
};
