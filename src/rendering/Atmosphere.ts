import {
  BackSide,
  Color,
  DirectionalLight,
  Fog,
  HemisphereLight,
  Mesh,
  PCFSoftShadowMap,
  ShaderMaterial,
  SphereGeometry,
  Vector3,
  type MeshStandardMaterial,
  type PerspectiveCamera,
  type Scene,
  type WebGLRenderer,
} from 'three';
import { Config } from '../core/Config';
import type { SkySample } from '../world/DayNightSystem';

/** Materials the atmosphere tints: wet ground in rain, and headlights by time of day. */
export interface AtmosphereTargets {
  land: MeshStandardMaterial;
  /** Vehicle body material; glows faintly at night to suggest headlights. */
  vehicles: MeshStandardMaterial;
  setWindowLight(amount: number, night: number): void;
}

const SKY_RADIUS = 9000;
/** Share of the sky covered by cloud in clear weather. */
const CLEAR_CLOUD_COVER = 0.46;
const LIGHT_DISTANCE = 800;
const RAIN_FOG = new Color(0x6f7884);
const fogColor = new Color();
const snapped = new Vector3();

/**
 * Sky, light and air (spec sections 41, 42): a sky dome with gradient, sun and
 * moon, stars and drifting clouds, hemisphere and directional light driven by the time of day, one shadow
 * map that follows the player, and fog that thickens in rain.
 */
export class Atmosphere {
  private readonly sun: DirectionalLight;
  private readonly ambient: HemisphereLight;
  private readonly sky: Mesh;
  private readonly skyMaterial: ShaderMaterial;
  private readonly fog: Fog;

  constructor(
    scene: Scene,
    private readonly camera: PerspectiveCamera,
    private readonly renderer: WebGLRenderer,
    private readonly targets: AtmosphereTargets,
  ) {
    const { fogNear, fogFar } = Config.render;

    this.ambient = new HemisphereLight(0xffffff, 0x444444, 1);
    this.sun = new DirectionalLight(0xffffff, 2);
    scene.add(this.ambient, this.sun, this.sun.target);

    renderer.shadowMap.type = PCFSoftShadowMap;
    this.sun.shadow.bias = -0.0006;
    this.sun.shadow.normalBias = 0.6;
    this.configureShadows();

    this.skyMaterial = new ShaderMaterial({
      side: BackSide,
      depthWrite: false,
      depthTest: false,
      fog: false,
      uniforms: {
        uTop: { value: new Color() },
        uHorizon: { value: new Color() },
        uSunDirection: { value: new Vector3(0, 1, 0) },
        uSunColor: { value: new Color() },
        uSunGlow: { value: 1 },
        uTime: { value: 0 },
        uNight: { value: 0 },
        uCloudCover: { value: 0.45 },
      },
      vertexShader: `
        varying vec3 vDirection;
        void main() {
          vDirection = normalize(position);
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }`,
      fragmentShader: `
        uniform vec3 uTop;
        uniform vec3 uHorizon;
        uniform vec3 uSunDirection;
        uniform vec3 uSunColor;
        uniform float uSunGlow;
        uniform float uTime;
        uniform float uNight;
        uniform float uCloudCover;
        varying vec3 vDirection;

        float hash(vec2 p) {
          return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
        }
        float noise(vec2 p) {
          vec2 i = floor(p);
          vec2 f = fract(p);
          f = f * f * (3.0 - 2.0 * f);
          return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x),
                     mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y);
        }
        float fbm(vec2 p) {
          float sum = 0.0;
          float amplitude = 0.5;
          for (int i = 0; i < 5; i++) {
            sum += noise(p) * amplitude;
            p = p * 2.03 + vec2(17.3, 9.1);
            amplitude *= 0.5;
          }
          return sum;
        }

        void main() {
          vec3 direction = normalize(vDirection);
          float height = clamp(direction.y, 0.0, 1.0);
          vec3 color = mix(uHorizon, uTop, pow(height, 0.55));
          // Below the horizon, fade to the horizon colour so the dome has no hard floor.
          color = mix(color, uHorizon, smoothstep(0.0, -0.25, direction.y));
          float toSun = max(dot(direction, uSunDirection), 0.0);

          // Stars: fixed points on the dome, out at night, twinkling slightly.
          if (uNight > 0.01 && direction.y > 0.0) {
            vec3 cell = floor(direction * 260.0);
            float seed = hash(cell.xy + cell.z * 17.0);
            float star = step(0.9965, seed) * (0.6 + 0.4 * sin(uTime * 2.0 + seed * 90.0));
            color += vec3(0.9, 0.95, 1.0) * star * uNight * smoothstep(0.0, 0.25, direction.y);
          }

          // Sun by day, a crisp moon disc by night, each with a soft glow.
          float disc = mix(smoothstep(0.99975, 0.99990, toSun), smoothstep(0.99955, 0.99965, toSun), uNight);
          color += uSunColor * (disc * 3.0 + pow(toSun, 600.0) * 1.2 + pow(toSun, 12.0) * 0.22) * uSunGlow;

          // Clouds: a layer of drifting noise projected onto a plane overhead.
          if (direction.y > 0.012) {
            vec2 plane = direction.xz / (direction.y + 0.09);
            vec2 drift = vec2(uTime * 0.006, uTime * 0.0025);
            float density = fbm(plane * 0.55 + drift) * 0.75 + fbm(plane * 1.7 - drift * 1.6) * 0.25;
            float cover = smoothstep(1.0 - uCloudCover, 1.0 - uCloudCover + 0.28, density);
            // Lit from the sun's side: sample the same field a little toward the light.
            float towardLight = fbm((plane + uSunDirection.xz * 0.22) * 0.55 + drift);
            float shade = clamp(0.55 + (density - towardLight) * 2.4, 0.0, 1.0);
            vec3 sunlit = mix(vec3(1.0), uSunColor, 0.35) * (1.0 - uNight * 0.86);
            vec3 shadowed = mix(uTop, vec3(0.55, 0.58, 0.64), 0.6) * (1.0 - uNight * 0.8);
            // Heavier cover means flatter, greyer cloud.
            vec3 cloud = mix(mix(shadowed, sunlit, shade), shadowed * 0.9, smoothstep(0.6, 0.95, uCloudCover));
            cloud += uSunColor * pow(toSun, 6.0) * 0.25 * (1.0 - uNight);
            // Thin out toward the horizon, where the projection stretches.
            float fade = smoothstep(0.012, 0.16, direction.y);
            color = mix(color, cloud, cover * fade);
          }

          gl_FragColor = vec4(color, 1.0);
          #include <colorspace_fragment>
        }`,
    });
    this.sky = new Mesh(new SphereGeometry(SKY_RADIUS, 32, 16), this.skyMaterial);
    this.sky.renderOrder = -1000;
    this.sky.frustumCulled = false;
    scene.add(this.sky);

    scene.background = null;
    this.fog = new Fog(0xffffff, fogNear, fogFar);
    scene.fog = this.fog;
  }

  /** Applies the shadow settings in `Config.render`. Call after a quality preset changes them. */
  configureShadows(): void {
    const { shadows, shadowMapSize, shadowRange } = Config.render;
    const enabled = shadows > 0;
    this.renderer.shadowMap.enabled = enabled;
    this.sun.castShadow = enabled;
    if (!enabled) return;
    const shadow = this.sun.shadow;
    if (shadow.mapSize.x !== shadowMapSize) {
      shadow.mapSize.set(shadowMapSize, shadowMapSize);
      // The map is recreated at the new size on the next render.
      shadow.map?.dispose();
      shadow.map = null;
    }
    shadow.camera.left = shadow.camera.bottom = -shadowRange;
    shadow.camera.right = shadow.camera.top = shadowRange;
    shadow.camera.near = 1;
    shadow.camera.far = LIGHT_DISTANCE * 2;
    shadow.camera.updateProjectionMatrix();
  }

  /** `focus` is where shadows should be centred: the player. `rain` is 0..1. */
  update(sample: SkySample, focus: Vector3, rain: number, frameDelta: number): void {
    const { shadowRange, shadowMapSize, fogNear, fogFar } = Config.render;
    const dim = 1 - rain * 0.45;

    this.ambient.color.copy(sample.ambientSky);
    this.ambient.groundColor.copy(sample.ambientGround);
    this.ambient.intensity = sample.ambientIntensity * (1 - rain * 0.2);
    this.sun.color.copy(sample.lightColor);
    this.sun.intensity = sample.lightIntensity * dim;

    // Centre the shadow map on the player, snapped to whole texels so shadow
    // edges do not crawl as the player moves.
    const texel = (shadowRange * 2) / shadowMapSize;
    snapped.set(
      Math.round(focus.x / texel) * texel,
      Math.round(focus.y / texel) * texel,
      Math.round(focus.z / texel) * texel,
    );
    this.sun.target.position.copy(snapped);
    this.sun.position.copy(snapped).addScaledVector(sample.lightDirection, LIGHT_DISTANCE);

    const uniforms = this.skyMaterial.uniforms;
    (uniforms.uTop?.value as Color).copy(sample.skyTop).lerp(RAIN_FOG, rain * 0.75);
    (uniforms.uHorizon?.value as Color).copy(sample.skyHorizon).lerp(RAIN_FOG, rain * 0.8);
    (uniforms.uSunDirection?.value as Vector3).copy(sample.lightDirection);
    (uniforms.uSunColor?.value as Color).copy(sample.lightColor);
    if (uniforms.uSunGlow) uniforms.uSunGlow.value = (1 - rain) * (1 - sample.night * 0.6);
    if (uniforms.uTime) uniforms.uTime.value += frameDelta;
    if (uniforms.uNight) uniforms.uNight.value = sample.night;
    // Fair-weather cloud normally; rain closes the sky in.
    if (uniforms.uCloudCover)
      uniforms.uCloudCover.value = CLEAR_CLOUD_COVER + (1 - CLEAR_CLOUD_COVER) * rain;
    this.sky.position.copy(this.camera.position);

    // Fog takes the horizon colour, and closes in when it rains.
    fogColor.copy(sample.skyHorizon).lerp(RAIN_FOG, rain * 0.8);
    this.fog.color.copy(fogColor);
    this.fog.near = fogNear * (1 - rain * 0.75);
    this.fog.far = fogFar * (1 - rain * 0.72);

    const { land, vehicles } = this.targets;
    land.roughness = 1 - rain * 0.6;
    // Only the lights glow (see FollowerRenderer); the red channel carries how brightly.
    vehicles.emissive.setScalar(0.08 + sample.night * 0.92);
    this.targets.setWindowLight(sample.windowLight, sample.night);
  }
}
