import { Box3, Matrix4, Vector3 } from "three";
import { describe, expect, it } from "vitest";
import {
  HABITAT_MIN_SIZE_PX,
  habitatDisplayScale,
  habitatGlobeMatrix,
  habitatProjection,
} from "./habitat-display";
import { MARS_TO_MAP } from "./terrain";

const bounds = new Box3(new Vector3(-8.43, 0, -4.5), new Vector3(8.43, 6.25, 7.54));

describe("habitat minimum display size", () => {
  it("places the globe model on the elevated sphere with local metre axes", () => {
    const matrix = habitatGlobeMatrix(-176.05, 45.97, 11000);
    const origin = new Vector3().applyMatrix4(matrix);
    expect(origin.length()).toBeCloseTo(1 + 11000 / 6371008.8, 12);
    const east = new Vector3(1, 0, 0).applyMatrix4(matrix).sub(origin);
    const up = new Vector3(0, 1, 0).applyMatrix4(matrix).sub(origin);
    const south = new Vector3(0, 0, 1).applyMatrix4(matrix).sub(origin);
    for (const axis of [east, up, south])
      expect(axis.length()).toBeCloseTo(MARS_TO_MAP / 6371008.8, 12);
    expect(east.dot(up)).toBeCloseTo(0, 12);
    expect(south.dot(up)).toBeCloseTo(0, 12);
    expect(up.clone().normalize().dot(origin.clone().normalize())).toBeCloseTo(1, 10);
  });

  it("uses the active projection and blends through the globe transition", () => {
    const flat = new Matrix4().makeTranslation(2, 4, 6);
    const globe = new Matrix4().makeTranslation(4, 6, 8);
    expect(habitatProjection(flat, globe, 0)).toEqual(flat);
    expect(habitatProjection(flat, globe, 1)).toEqual(globe);
    expect(new Vector3().applyMatrix4(habitatProjection(flat, globe, 0.5))).toEqual(
      new Vector3(3, 5, 7),
    );
  });

  it("enlarges a distant model to 90 CSS pixels", () => {
    const projection = new Matrix4().makeScale(0.0001, 0.0001, 0.0001);
    const scale = habitatDisplayScale(projection, bounds, 1200, 800);
    expect(16.86 * 0.0001 * 600 * scale).toBeCloseTo(HABITAT_MIN_SIZE_PX);
  });

  it("preserves the authored size in close views", () => {
    expect(habitatDisplayScale(new Matrix4().makeScale(0.1, 0.1, 0.1), bounds, 1200, 800)).toBe(1);
  });

  it("adapts to the viewport without moving the ground anchor", () => {
    const projection = new Matrix4().makeTranslation(0.2, -0.4, 0.5);
    projection.scale(new Vector3(0.0001, 0.0001, 0.0001));
    const scale = habitatDisplayScale(projection, bounds, 600, 400);
    const largerViewportScale = habitatDisplayScale(projection, bounds, 1200, 800);
    expect(scale).toBeCloseTo(largerViewportScale * 2);
    const displayed = projection.clone().scale(new Vector3(scale, scale, scale));
    expect(new Vector3().applyMatrix4(displayed)).toEqual(new Vector3().applyMatrix4(projection));
  });
});
