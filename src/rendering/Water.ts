import {
  Color,
  Mesh,
  PlaneGeometry,
  ShaderMaterial,
  UniformsLib,
  UniformsUtils,
  Vector3,
  type Scene,
} from 'three';
import type { SkySample } from '../world/DayNightSystem';

/** Drawn slightly below the land so the shoreline does not z-fight. */
const WATER_Y = -0.4;

/**
 * The ocean: a flat plane with a shader that does the rest. Wave normals are
 * the analytic slope of a handful of travelling sine waves; the surface mixes
 * a depth colour with the reflected sky by Fresnel, adds a sun glint, foam
 * where swells break along the shore, and rain ripples. No textures.
 */
export class Water {
  private readonly material: ShaderMaterial;

  constructor(scene: Scene, worldHalfSize: number, shore: number) {
    this.material = new ShaderMaterial({
      fog: true,
      uniforms: UniformsUtils.merge([
        UniformsLib.fog,
        {
          uTime: { value: 0 },
          uShore: { value: shore },
          uRain: { value: 0 },
          uNight: { value: 0 },
          uSunDirection: { value: new Vector3(0, 1, 0) },
          uSunColor: { value: new Color() },
          uSkyTop: { value: new Color() },
          uSkyHorizon: { value: new Color() },
        },
      ]),
      vertexShader: `
        #include <common>
        #include <fog_pars_vertex>
        #include <logdepthbuf_pars_vertex>
        varying vec3 vWorld;
        void main() {
          vec4 world = modelMatrix * vec4(position, 1.0);
          vWorld = world.xyz;
          vec4 mvPosition = viewMatrix * world;
          gl_Position = projectionMatrix * mvPosition;
          #include <logdepthbuf_vertex>
          #include <fog_vertex>
        }`,
      fragmentShader: `
        #include <common>
        #include <fog_pars_fragment>
        #include <logdepthbuf_pars_fragment>
        uniform float uTime;
        uniform float uShore;
        uniform float uRain;
        uniform float uNight;
        uniform vec3 uSunDirection;
        uniform vec3 uSunColor;
        uniform vec3 uSkyTop;
        uniform vec3 uSkyHorizon;
        varying vec3 vWorld;

        // Adds one travelling wave's slope to the running total.
        void wave(vec2 direction, float wavelength, float amplitude, float speed, vec2 p, inout vec2 slope) {
          float k = 6.2831853 / wavelength;
          float phase = dot(direction, p) * k;
          // Once a wave is finer than a pixel it only produces moire rings; fade it out first.
          float visible = clamp(1.0 - fwidth(phase) * 0.9, 0.0, 1.0);
          slope += direction * (amplitude * k * cos(phase + uTime * speed) * visible);
        }

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

        void main() {
          #include <logdepthbuf_fragment>
          vec2 p = vWorld.xz;
          vec3 toCamera = cameraPosition - vWorld;
          float distance = length(toCamera);
          vec3 view = toCamera / distance;

          // Swell stays visible far out; small chop fades with distance so it does not shimmer.
          float nearDetail = 1.0 / (1.0 + distance * 0.004);
          float midDetail = 1.0 / (1.0 + distance * 0.0012);
          vec2 slope = vec2(0.0);
          wave(normalize(vec2(1.0, 0.35)), 95.0, 0.9, 0.55, p, slope);
          wave(normalize(vec2(0.55, 1.0)), 61.0, 0.55, 0.7, p, slope);
          wave(normalize(vec2(-0.7, 0.6)), 27.0, 0.26 * midDetail, 1.1, p, slope);
          wave(normalize(vec2(0.3, -1.0)), 13.0, 0.13 * midDetail, 1.6, p, slope);
          wave(normalize(vec2(-1.0, -0.2)), 5.5, 0.06 * nearDetail, 2.3, p, slope);
          wave(normalize(vec2(0.8, 0.9)), 2.6, 0.03 * nearDetail, 3.1, p, slope);
          // Rain roughens the surface.
          slope += (vec2(noise(p * 1.7 + uTime * 2.0), noise(p * 1.7 - uTime * 2.3)) - 0.5) * uRain * 0.5 * nearDetail;
          vec3 normal = normalize(vec3(-slope.x, 1.0, -slope.y));

          float facing = max(dot(normal, view), 0.0);
          float fresnel = 0.03 + 0.97 * pow(1.0 - facing, 5.0);

          // Reflected sky.
          vec3 reflected = reflect(-view, normal);
          vec3 sky = mix(uSkyHorizon, uSkyTop, pow(max(reflected.y, 0.0), 0.5));

          // Water body: deep blue-green offshore, lighter over the shallows by the land.
          float offshore = max(vWorld.x - uShore, vWorld.z - uShore);
          float shallow = 1.0 - smoothstep(0.0, 140.0, offshore);
          vec3 body = mix(vec3(0.012, 0.085, 0.14), vec3(0.04, 0.26, 0.29), shallow);
          float daylight = 1.0 - uNight * 0.86;
          body *= daylight * (0.55 + 0.45 * max(uSunDirection.y, 0.0));
          // Light scattering through wave crests facing the sun.
          body += vec3(0.02, 0.10, 0.09) * max(dot(normal.xz, uSunDirection.xz), 0.0) * daylight;

          vec3 color = mix(body, sky, fresnel);

          // Sun (or moon) glint.
          float glint = pow(max(dot(reflected, uSunDirection), 0.0), 240.0);
          float sheen = pow(max(dot(reflected, uSunDirection), 0.0), 18.0);
          color += uSunColor * (glint * 2.2 + sheen * 0.12) * (1.0 - uRain * 0.8);

          // Foam: where swell runs up the shore, broken by noise.
          float swell = sin(dot(normalize(vec2(1.0, 0.35)), p) * 0.066 + uTime * 0.55);
          float surf = smoothstep(16.0 + swell * 7.0, 0.0, offshore);
          float foam = surf * smoothstep(0.45, 0.85, noise(p * 0.9 + vec2(uTime * 0.25, 0.0)) + surf * 0.3) * 0.85;
          // Whitecaps on the steepest chop, close to the camera only.
          foam += smoothstep(0.34, 0.5, length(slope)) * 0.35 * nearDetail;
          color = mix(color, vec3(0.92, 0.96, 0.98) * (0.35 + 0.65 * daylight), clamp(foam, 0.0, 1.0));

          gl_FragColor = vec4(color, 1.0);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
          #include <fog_fragment>
        }`,
    });

    const mesh = new Mesh(new PlaneGeometry(worldHalfSize * 2, worldHalfSize * 2), this.material);
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.y = WATER_Y;
    mesh.frustumCulled = false;
    scene.add(mesh);
  }

  update(frameDelta: number, sample: SkySample, rain: number): void {
    const uniforms = this.material.uniforms;
    if (uniforms.uTime) uniforms.uTime.value += frameDelta;
    if (uniforms.uRain) uniforms.uRain.value = rain;
    if (uniforms.uNight) uniforms.uNight.value = sample.night;
    (uniforms.uSunDirection?.value as Vector3).copy(sample.lightDirection);
    (uniforms.uSunColor?.value as Color).copy(sample.lightColor);
    (uniforms.uSkyTop?.value as Color).copy(sample.skyTop);
    (uniforms.uSkyHorizon?.value as Color).copy(sample.skyHorizon);
  }
}
