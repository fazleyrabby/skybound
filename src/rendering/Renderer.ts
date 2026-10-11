import {
  Color,
  HalfFloatType,
  LinearToneMapping,
  PerspectiveCamera,
  Scene,
  Vector2,
  WebGLRenderer,
  WebGLRenderTarget,
} from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { Config } from '../core/Config';

export interface RenderStats {
  drawCalls: number;
  triangles: number;
  geometries: number;
  textures: number;
  pixelRatio: number;
}

/**
 * The only module that talks to the WebGL renderer. Everything else goes
 * through this so the backend can be revisited later (spec section 4).
 *
 * The scene is drawn into a high-range, multisampled buffer; bloom is added
 * around whatever is brighter than white, and an output pass applies exposure
 * and converts the result for the display. Hand-written shaders therefore have
 * to write linear colour like every built-in material does (see `toLinear` in
 * `shaderColor.ts`).
 */
export class Renderer {
  readonly scene = new Scene();
  readonly camera: PerspectiveCamera;

  private readonly webgl: WebGLRenderer;
  private readonly resizeObserver: ResizeObserver;
  private readonly composer: EffectComposer;
  private readonly bloom: UnrealBloomPass;
  private pixelRatio = Math.min(window.devicePixelRatio, Config.render.maxPixelRatio);

  constructor(
    private readonly canvas: HTMLCanvasElement,
    onContextLost: () => void,
  ) {
    const { fov, near, far, clearColor } = Config.render;

    // A 0.1 m near plane with a 12 km far plane leaves a standard depth buffer too coarse
    // to separate ground layers at distance (they flicker). Logarithmic depth fixes that.
    this.webgl = new WebGLRenderer({
      canvas,
      antialias: true,
      powerPreference: 'high-performance',
      logarithmicDepthBuffer: true,
    });
    // Sky and fog are owned by Atmosphere; this colour only shows before it is created.
    this.scene.background = new Color(clearColor);
    this.camera = new PerspectiveCamera(fov, 1, near, far);
    // In the scene graph so camera-attached effects (speed lines) render.
    this.scene.add(this.camera);

    canvas.addEventListener('webglcontextlost', (event) => {
      event.preventDefault();
      onContextLost();
    });

    // Exposure only: the filmic curves darken shadows and shift every colour the game was tuned with.
    this.webgl.toneMapping = LinearToneMapping;
    // Several passes draw each frame; count them all rather than only the last.
    this.webgl.info.autoReset = false;
    const target = new WebGLRenderTarget(1, 1, { type: HalfFloatType, samples: 4 });
    this.composer = new EffectComposer(this.webgl, target);
    this.bloom = new UnrealBloomPass(new Vector2(1, 1), 0, 0, 1);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass());
    this.applyQuality();

    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(canvas);
    this.resize();
  }

  /**
   * Sets the render resolution as a pixel ratio. Dynamic resolution calls this;
   * it is never allowed above what the display can show.
   */
  setPixelRatio(ratio: number): void {
    const clamped = Math.min(ratio, window.devicePixelRatio);
    if (Math.abs(clamped - this.pixelRatio) < 0.001) return;
    this.pixelRatio = clamped;
    this.resize();
  }

  /** The underlying renderer, for other rendering modules (shadows, post effects). */
  get backend(): WebGLRenderer {
    return this.webgl;
  }

  static isSupported(): boolean {
    return document.createElement('canvas').getContext('webgl2') !== null;
  }

  /** Re-reads the post-processing settings in `Config.render`. Call after a quality preset changes them. */
  applyQuality(): void {
    const { bloom, bloomStrength, bloomRadius, bloomThreshold, exposure } = Config.render;
    this.bloom.enabled = bloom > 0;
    this.bloom.strength = bloomStrength;
    this.bloom.radius = bloomRadius;
    this.bloom.threshold = bloomThreshold;
    this.webgl.toneMappingExposure = exposure;
  }

  render(): void {
    this.webgl.info.reset();
    this.composer.render();
  }

  get stats(): RenderStats {
    const { render, memory } = this.webgl.info;
    return {
      drawCalls: render.calls,
      triangles: render.triangles,
      geometries: memory.geometries,
      textures: memory.textures,
      pixelRatio: this.webgl.getPixelRatio(),
    };
  }

  dispose(): void {
    this.resizeObserver.disconnect();
    this.composer.dispose();
    this.webgl.dispose();
  }

  private resize(): void {
    const width = Math.max(1, this.canvas.clientWidth);
    const height = Math.max(1, this.canvas.clientHeight);
    this.webgl.setPixelRatio(this.pixelRatio);
    this.webgl.setSize(width, height, false);
    this.composer.setPixelRatio(this.pixelRatio);
    this.composer.setSize(width, height);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
  }
}
