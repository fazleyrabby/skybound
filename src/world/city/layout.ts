/**
 * Nova City graybox layout (spec sections 19, 20). Metres; origin is the
 * centre of downtown; -Z is north, +X is east. The ocean lies south and east.
 *
 *            north (-Z)
 *   +-----------------------------+
 *   | residential (north band)    |
 *   |   +---------------------+   |
 *   | r | highway ring        | i |
 *   | e |   +-------------+   | n |
 *   | s |   |  DOWNTOWN   |   | d |
 *   |   |   +-------------+   |   |
 *   |   +---------------------+ h |
 *   | park        | harbor        |
 *   +-----------------------------+  ~~~ ocean ~~~
 */
export const Layout = {
  /** Half size of the dense core (1 km x 1 km). */
  coreHalf: 500,
  /** Downtown occupies [-downtownHalf, downtownHalf] on both axes. */
  downtownHalf: 200,
  /** Centreline of the elevated highway ring, and where the outer districts begin. */
  highwayRadius: 250,
  outerStart: 300,
  /** Land ends here on the south and east sides; beyond is ocean. */
  shore: 520,
  /** Width of the central north-south avenue canyon. */
  avenueWidth: 48,
};

export const Palette = {
  downtown: 0x8f9bb0,
  downtownGlass: 0x6f8fb5,
  landmark: 0xc9d4e6,
  residential: 0xb9a48c,
  industrial: 0x8a7f73,
  chimney: 0x9c5a48,
  crane: 0xd9a520,
  harborConcrete: 0x9a9a94,
  ship: 0x3f4a5c,
  containers: [0xb5483a, 0x2f6f9f, 0x3d8f5a, 0xc98a2b, 0x7a7f86],
  highway: 0x4b4f57,
  lawn: 0x4f7a45,
  tree: 0x2f5f33,
  stone: 0xcfc8b8,
  suburb: 0xa59c8f,
} as const;
