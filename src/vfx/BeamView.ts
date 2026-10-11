import {
  AdditiveBlending,
  Color,
  DoubleSide,
  IcosahedronGeometry,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  PlaneGeometry,
  PointLight,
  ShaderMaterial,
  Vector3,
  type Camera,
  type Scene,
} from 'three';
import type { HeatBeam } from '../combat/HeatBeam';
import { Config } from '../core/Config';
import { damp } from '../utils/math';

/** Width of the whole beam, flame included, metres. The white-hot core is about a fifth of it. */
const BEAM_WIDTH = 0.85;
const FADE_RESPONSE = 22;

// The renderer uses a logarithmic depth buffer, so a hand-written shader has to
// write depth the same way or it is rejected against everything else on screen.
const VERTEX = /* glsl */ `
  #include <common>
  #include <logdepthbuf_pars_vertex>
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    #include <logdepthbuf_vertex>
  }
`;

const FRAGMENT = /* glsl */ `
  #include <common>
  #include <logdepthbuf_pars_fragment>
  uniform float uTime;
  uniform float uLength;
  uniform float uPower;
  uniform float uHeat;
  varying vec2 vUv;

  float beamHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float noise(vec2 p) {
    vec2 cell = floor(p);
    vec2 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(
      mix(beamHash(cell), beamHash(cell + vec2(1.0, 0.0)), f.x),
      mix(beamHash(cell + vec2(0.0, 1.0)), beamHash(cell + vec2(1.0, 1.0)), f.x),
      f.y
    );
  }

  void main() {
    #include <logdepthbuf_fragment>
    // 0 on the centre line, 1 at the edge of the ribbon; metres along it from the eyes.
    float across = abs(vUv.x - 0.5) * 2.0;
    float along = vUv.y * uLength;
    // Fire streams away from the eyes, torn into tongues at the edges.
    vec2 flow = vec2(vUv.x * 5.0, along * 0.5 - uTime * 24.0);
    float turbulence = noise(flow) * 0.55 + noise(flow * vec2(2.1, 2.6) + 9.0) * 0.45;
    float flicker = 0.9 + 0.1 * sin(uTime * 61.0) * sin(uTime * 37.0 + along * 0.4);

    // A white-hot core, yellow around it, then flame out to a ragged edge.
    float reach = 0.55 + 0.45 * turbulence;
    float flame = 1.0 - smoothstep(reach * 0.35, reach, across);
    float core = 1.0 - smoothstep(0.1, 0.24, across);
    vec3 color = mix(vec3(0.8, 0.06, 0.01), vec3(1.0, 0.5, 0.06), smoothstep(0.1, 0.75, flame));
    color = mix(color, vec3(1.0, 0.85, 0.35), smoothstep(0.65, 1.0, flame));
    color = mix(color, vec3(1.0, 0.98, 0.9), core);
    // The hotter it runs, the redder and fiercer the flame around the core.
    color = mix(color, color * vec3(1.2, 0.7, 0.45), uHeat * 0.6 * (1.0 - core));
    float alpha = max(core, flame * (0.6 + 0.3 * uHeat)) * flicker;
    // Ease in at the eyes and out at the far end.
    alpha *= smoothstep(0.0, 0.5, along) * smoothstep(0.0, 1.0, uLength - along) * uPower;
    gl_FragColor = vec4(color * alpha, alpha);
  }
`;

/**
 * Draws the heat beam: a white-hot core inside a turbulent flame, from the
 * hero's eyes to wherever it lands, with a burning point of light where it
 * touches something. The beam is a ribbon turned to face the camera, because
 * the camera sits behind the hero and looks almost straight down it. Reads the beam's state; knows nothing about damage.
 */
export class BeamView {
  private readonly ribbon: Mesh;
  private readonly burn: Mesh;
  private readonly ember: Mesh;
  private readonly glare: Mesh;
  private readonly light = new PointLight(0xff7a2a, 0, 46, 1.6);
  private readonly uniforms = {
    uTime: { value: 0 },
    uLength: { value: 1 },
    uPower: { value: 0 },
    uHeat: { value: 0 },
  };
  private readonly sideways = new Vector3();
  private readonly toward = new Vector3();
  private readonly basis = new Matrix4();
  private readonly from = new Vector3();
  private readonly to = new Vector3();
  private readonly direction = new Vector3();
  private readonly cross = new Vector3();
  private power = 0;
  private burning = 0;
  private time = 0;

  constructor(
    scene: Scene,
    private readonly camera: Camera,
    private readonly beam: HeatBeam,
    /** Writes where the hero's eyes are drawn this frame. */
    private readonly eyes: (out: Vector3) => void,
  ) {
    // Unit square: x across the beam, y along it from the eyes.
    this.ribbon = new Mesh(
      new PlaneGeometry(1, 1).translate(0, 0.5, 0),
      new ShaderMaterial({
        uniforms: this.uniforms,
        vertexShader: VERTEX,
        fragmentShader: FRAGMENT,
        transparent: true,
        blending: AdditiveBlending,
        premultipliedAlpha: true,
        depthWrite: false,
        side: DoubleSide,
      }),
    );
    this.ribbon.matrixAutoUpdate = false;
    const glow = (color: Color, opacity: number): MeshBasicMaterial =>
      new MeshBasicMaterial({
        color,
        opacity,
        transparent: true,
        blending: AdditiveBlending,
        depthWrite: false,
        fog: false,
      });
    // Where it lands: a fierce orange bloom with a white-hot centre.
    this.burn = new Mesh(new IcosahedronGeometry(1, 2), glow(new Color(1, 0.38, 0.06), 0.5));
    this.ember = new Mesh(new IcosahedronGeometry(1, 2), glow(new Color(1, 0.9, 0.6), 0.9));
    this.glare = new Mesh(new IcosahedronGeometry(1, 1), glow(new Color(1, 0.6, 0.2), 0.9));
    for (const mesh of [this.ribbon, this.burn, this.ember, this.glare]) {
      mesh.visible = false;
      mesh.frustumCulled = false;
      mesh.renderOrder = 4;
      scene.add(mesh);
    }
    scene.add(this.light);
  }

  /** Call after the hero has been posed for this frame: the beam starts at the eyes as drawn. */
  update(frameDelta: number): void {
    const beam = this.beam;
    this.time += frameDelta;
    this.power = damp(this.power, beam.active ? 1 : 0, FADE_RESPONSE, frameDelta);
    this.burning = damp(
      this.burning,
      beam.active && beam.contact !== 'none' ? 1 : 0,
      FADE_RESPONSE,
      frameDelta,
    );
    const visible = this.power > 0.01;
    this.ribbon.visible = this.glare.visible = visible;
    this.burn.visible = this.ember.visible = visible && this.burning > 0.01;
    this.light.intensity = 0;
    if (!visible) return;

    // While the beam is on, follow it; while it fades out, keep the last line.
    this.eyes(this.from);
    if (beam.active) this.to.copy(beam.end);
    this.direction.copy(this.to).sub(this.from);
    const length = Math.max(this.direction.length(), 0.01);
    this.direction.divideScalar(length);
    const pulse = 1 + 0.08 * Math.sin(this.time * 47) + 0.05 * Math.sin(this.time * 83);

    // Turn the ribbon about the beam so it faces the camera. Seen dead along the
    // beam there is no "across": fall back to the camera's own sideways.
    this.toward.copy(this.camera.position).sub(this.from);
    this.sideways.crossVectors(this.direction, this.toward);
    if (this.sideways.lengthSq() < 1e-6)
      this.sideways.set(1, 0, 0).applyQuaternion(this.camera.quaternion);
    this.sideways.normalize();
    this.toward.crossVectors(this.sideways, this.direction);
    // It swells a little as it heats up.
    const width = BEAM_WIDTH * pulse * (1 + 0.35 * beam.heat) * this.power;
    this.basis.makeBasis(
      this.sideways.multiplyScalar(width),
      this.toward.copy(this.direction).multiplyScalar(length),
      this.cross.crossVectors(this.sideways, this.direction).normalize(),
    );
    this.ribbon.matrix.copy(this.basis).setPosition(this.from);
    this.ribbon.matrixWorldNeedsUpdate = true;
    this.uniforms.uTime.value = this.time;
    this.uniforms.uLength.value = length;
    this.uniforms.uPower.value = this.power;
    this.uniforms.uHeat.value = beam.heat;

    // A glare at the eyes, and the burning point where the beam lands.
    this.glare.position.copy(this.from);
    this.glare.scale.setScalar(0.075 * pulse * this.power);
    if (this.burn.visible) {
      const size = (beam.contact === 'target' ? 1.15 : 0.8) * pulse * this.burning;
      const throb = 0.75 + 0.25 * Math.sin(this.time * 29) ** 2;
      this.burn.position.copy(this.to).addScaledVector(this.direction, -0.2);
      this.burn.scale.setScalar(size * throb);
      this.ember.position.copy(this.burn.position);
      this.ember.scale.setScalar(size * 0.36 * (1.5 - throb * 0.5));
      this.light.position.copy(this.burn.position).addScaledVector(this.direction, -1.2);
      this.light.intensity = Config.vfx.beamLight * this.burning * pulse * Config.vfx.flashScale;
    }
  }
}
