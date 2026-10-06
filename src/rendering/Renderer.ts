import { Color, PerspectiveCamera, Scene, WebGLRenderer } from 'three';
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
 */
export class Renderer {
  readonly scene = new Scene();
  readonly camera: PerspectiveCamera;

  private readonly webgl: WebGLRenderer;
  private readonly resizeObserver: ResizeObserver;
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

  render(): void {
    this.webgl.render(this.scene, this.camera);
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
    this.webgl.dispose();
  }

  private resize(): void {
    const width = Math.max(1, this.canvas.clientWidth);
    const height = Math.max(1, this.canvas.clientHeight);
    this.webgl.setPixelRatio(this.pixelRatio);
    this.webgl.setSize(width, height, false);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
  }
}
