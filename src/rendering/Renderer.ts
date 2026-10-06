import { Color, Fog, PerspectiveCamera, Scene, WebGLRenderer } from 'three';
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

  constructor(
    private readonly canvas: HTMLCanvasElement,
    onContextLost: () => void,
  ) {
    const { fov, near, far, clearColor, fogNear, fogFar } = Config.render;

    // A 0.1 m near plane with a 12 km far plane leaves a standard depth buffer too coarse
    // to separate ground layers at distance (they flicker). Logarithmic depth fixes that.
    this.webgl = new WebGLRenderer({
      canvas,
      antialias: true,
      powerPreference: 'high-performance',
      logarithmicDepthBuffer: true,
    });
    this.scene.background = new Color(clearColor);
    this.scene.fog = new Fog(clearColor, fogNear, fogFar);
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
    this.webgl.setPixelRatio(Math.min(window.devicePixelRatio, Config.render.maxPixelRatio));
    this.webgl.setSize(width, height, false);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
  }
}
