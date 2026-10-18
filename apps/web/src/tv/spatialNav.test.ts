import { describe, expect, it } from 'vitest';
import { nextIndex, type Box } from './spatialNav';

const box = (x: number, y: number): Box => ({ x, y, width: 100, height: 50 });
// A 2x2 grid of cards and a Start button below it.
const grid = [box(0, 0), box(200, 0), box(0, 100), box(200, 100), box(100, 200)];

describe('nextIndex', () => {
  it('moves along rows and columns', () => {
    expect(nextIndex(grid[0]!, grid, 'right')).toBe(1);
    expect(nextIndex(grid[0]!, grid, 'down')).toBe(2);
    expect(nextIndex(grid[3]!, grid, 'left')).toBe(2);
    expect(nextIndex(grid[3]!, grid, 'up')).toBe(1);
  });

  it('reaches the button below a row and stops at the edges', () => {
    expect(nextIndex(grid[2]!, grid, 'down')).toBe(4);
    expect(nextIndex(grid[0]!, grid, 'up')).toBe(-1);
    expect(nextIndex(grid[1]!, grid, 'right')).toBe(-1);
  });
});
