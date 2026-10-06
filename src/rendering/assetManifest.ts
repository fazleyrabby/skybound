/** The only place asset paths appear (spec section 59). Paths are relative to the site root. */
export const assetManifest = {
  models: {
    hero: 'assets/characters/aether.glb',
  },
} as const;

export type ModelKey = keyof typeof assetManifest.models;
