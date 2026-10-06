import type { Object3D } from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { assetManifest, type ModelKey } from './assetManifest';

/**
 * Loads and caches assets (spec section 35). A model that fails to load
 * resolves to null rather than throwing, so callers can fall back to a
 * placeholder and the game still boots.
 */
export class AssetManager {
  private readonly loader = new GLTFLoader();
  private readonly models = new Map<ModelKey, Promise<Object3D | null>>();

  loadModel(key: ModelKey): Promise<Object3D | null> {
    let pending = this.models.get(key);
    if (!pending) {
      const url = import.meta.env.BASE_URL + assetManifest.models[key];
      pending = this.loader
        .loadAsync(url)
        .then((gltf) => gltf.scene as Object3D)
        .catch((error: unknown) => {
          console.warn(`Model "${key}" failed to load; using the placeholder.`, error);
          return null;
        });
      this.models.set(key, pending);
    }
    return pending;
  }
}
