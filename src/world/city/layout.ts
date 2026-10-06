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
  /** Facade colours for towers: steel, blue glass, warm stone, graphite, teal, sand. */
  towers: [0x8f9bb0, 0x6f8fb5, 0xa39a8c, 0x566174, 0x7fa3a0, 0xc2b59b],
  podium: 0x6d7078,
  plaza: 0x8a8f96,
  sideStreet: 0x4a4d54,
  /** Open land outside the city: grass, crops, scrub, bare earth. */
  fields: [0x5f7f4a, 0x7c8a4f, 0x6b7a55, 0x8a7d5a, 0x55704a],
  tank: 0xb8bcc2,
  roofUnit: 0x55595f,
  /** Billboard and rooftop sign colours. */
  signs: [0xff3d6e, 0x29d3ff, 0xffc22e, 0x7dff6a, 0xb86bff],
  antenna: 0xd8dde6,
  downtown: 0x8f9bb0,
  landmark: 0xc9d4e6,
  residential: 0xb9a48c,
  /** Tan, brick, cream, grey, terracotta. */
  houses: [0xb9a48c, 0xa5604c, 0xd6cab2, 0x9a9da3, 0xc08a62],
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
