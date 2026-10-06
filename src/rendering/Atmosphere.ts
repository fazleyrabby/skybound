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
const LIGHT_DISTANCE = 800;
const RAIN_FOG = new Color(0x6f7884);
const HEADLIGHT = new Color(0xffe2a8);
const fogColor = new Color();
const snapped = new Vector3();

/**
 * Sky, light and air (spec sections 41, 42): a gradient sky dome with a sun
 * glow, hemisphere and directional light driven by the time of day, one shadow
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
        varying vec3 vDirection;
        void main() {
          vec3 direction = normalize(vDirection);
          float height = clamp(direction.y, 0.0, 1.0);
          vec3 color = mix(uHorizon, uTop, pow(height, 0.55));
          // Below the horizon, fade to the horizon colour so the dome has no hard floor.
          color = mix(color, uHorizon, smoothstep(0.0, -0.25, direction.y));
          float toSun = max(dot(direction, uSunDirection), 0.0);
          color += uSunColor * (pow(toSun, 600.0) * 2.5 + pow(toSun, 12.0) * 0.22) * uSunGlow;
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
  update(sample: SkySample, focus: Vector3, rain: number): void {
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
    this.sky.position.copy(this.camera.position);

    // Fog takes the horizon colour, and closes in when it rains.
    fogColor.copy(sample.skyHorizon).lerp(RAIN_FOG, rain * 0.8);
    this.fog.color.copy(fogColor);
    this.fog.near = fogNear * (1 - rain * 0.75);
    this.fog.far = fogFar * (1 - rain * 0.72);

    const { land, vehicles } = this.targets;
    land.roughness = 1 - rain * 0.6;
    vehicles.emissive.copy(HEADLIGHT).multiplyScalar(sample.night * 0.35);
    this.targets.setWindowLight(sample.windowLight, sample.night);
  }
}
