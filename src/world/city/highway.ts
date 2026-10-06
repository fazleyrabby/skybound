import { BoxBuilder, type BuildingDescriptor } from '../Building';
import { Layout, Palette } from './layout';

const DECK_WIDTH = 16;
const DECK_THICKNESS = 2;
const DECK_UNDERSIDE = 16;
const PILLAR_SPACING = 50;
const PILLAR_SIZE = 3;

/**
 * Elevated ring road around downtown. No randomness: it is infrastructure.
 *
 * Flight line: under the deck anywhere between pillars, or along the top.
 */
export function buildHighway(out: BuildingDescriptor[]): void {
  const boxes = new BoxBuilder(out, 'highway');
  const radius = Layout.highwayRadius;
  const span = radius * 2 + DECK_WIDTH;
  const deck = { baseY: DECK_UNDERSIDE } as const;

  for (const side of [-1, 1]) {
    boxes.add(0, side * radius, span, DECK_WIDTH, DECK_THICKNESS, Palette.highway, deck);
    boxes.add(
      side * radius,
      0,
      DECK_WIDTH,
      span - DECK_WIDTH * 2,
      DECK_THICKNESS,
      Palette.highway,
      deck,
    );

    for (let along = -radius; along <= radius; along += PILLAR_SPACING) {
      boxes.add(along, side * radius, PILLAR_SIZE, PILLAR_SIZE, DECK_UNDERSIDE, Palette.highway);
      if (Math.abs(along) < radius) {
        boxes.add(side * radius, along, PILLAR_SIZE, PILLAR_SIZE, DECK_UNDERSIDE, Palette.highway);
      }
    }
  }
}
