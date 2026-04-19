/**
 * @file mapCoordinates.ts
 * @description Pure utility for converting React Flow canvas coordinates to
 *   ROS (Robot Operating System) real-world coordinates in meters.
 *
 * This module contains no hard-coded map configuration.  All spatial metadata
 * (resolution, origin, image dimensions) must be supplied by the caller via a
 * `RosMapConfig` object — typically sourced from the `useMapConfig` hook, which
 * reads and writes these values to the `wh_graphs` database table.
 *
 * Axis conventions:
 *   React Flow  — origin at top-left,    Y increases downward  (screen space)
 *   ROS         — origin at bottom-left, Y increases upward    (world space)
 *   .pgm image  — origin at top-left,    row 0 is the HIGHEST Y in world space
 *
 * Because React Flow and ROS Y-axes point in opposite directions, a raw
 * canvas Y value cannot be used in the ROS formula directly.  It must first
 * be mirrored against the image height so that "top of canvas" maps to
 * "top of map image" (the highest Y value in ROS world coordinates).
 */

import type { RosMapConfig } from '../hooks/useMapConfig';

// Re-export the type so consumers can import from a single location.
export type { RosMapConfig };

/**
 * The single source-of-truth scale factor for the entire application.
 *
 * 1 real-world metre is rendered as CANVAS_SCALE canvas pixels on the React
 * Flow canvas.  Every coordinate conversion — loading from DB, saving to DB,
 * placing the origin overlay, and displaying metre values in the sidebar —
 * MUST use this constant.  Never use `1 / resolution` as a scale factor:
 * that gives the image-pixel count per metre, NOT the canvas-pixel count.
 *
 * Relationship:
 *   canvas_px_per_metre  = CANVAS_SCALE            (= 100)
 *   image_px_per_metre   = 1 / resolution          (= 20 when res = 0.05)
 *   image_px_per_canvas_px = resolution * CANVAS_SCALE  (= 5 when res = 0.05)
 */
export const CANVAS_SCALE = 100; // canvas pixels per real-world metre

// ============================================================
// RESULT TYPE
// ============================================================

/**
 * Real-world coordinate pair in the ROS map frame (meters).
 */
export interface RosCoordinates {
  /** Distance east of the map origin in meters (positive = right on the map). */
  x: number;
  /** Distance north of the map origin in meters (positive = up on the map). */
  y: number;
}

// ============================================================
// CONVERSION FUNCTION
// ============================================================

/**
 * Converts a React Flow canvas position to ROS real-world coordinates in meters.
 *
 * Conversion steps:
 *   1. X-axis: multiply canvas X by the map resolution to convert to metres,
 *              then add the real-world X origin offset.
 *
 *   2. Y-axis (inverted):
 *      a. Subtract the canvas Y from the image height (in canvas pixels) to
 *         flip the direction — React Flow Y=0 (top) becomes the highest world Y.
 *      b. Multiply the flipped value by the resolution to convert to metres.
 *      c. Add the real-world Y origin offset.
 *
 * Formulas:
 *   realX     = originX + (rfX / CANVAS_SCALE)
 *   invertedY = imgHeight - rfY          (imgHeight is in CANVAS pixels)
 *   realY     = originY + (invertedY / CANVAS_SCALE)
 *
 * Note on `imgHeight` units:
 *   `config.imgHeight` MUST be in canvas pixels, NOT raw image pixels.
 *   The correct value is:
 *     config.imgHeight = pgm_pixel_height * resolution * CANVAS_SCALE
 *   Example: a 1 000-pixel tall .pgm at 0.05 m/px → imgHeight = 5 000 canvas px.
 *
 *   Do NOT use the raw pixel count of the source image — that gives a result
 *   5× smaller than the canvas coordinate when resolution = 0.05.
 *
 * @param rfX    - Node X position in React Flow canvas pixels
 *                 (`selectedNode.position.x`).
 * @param rfY    - Node Y position in React Flow canvas pixels
 *                 (`selectedNode.position.y`).
 * @param config - ROS map metadata from `useMapConfig`.
 * @returns `RosCoordinates` with `x` and `y` in metres, each at 3 decimal places.
 *
 * @example
 * const ros = toRosCoordinates(350, 200, config);
 * // => { x: 10.730, y: -9.200 }
 */
export function toRosCoordinates(
  rfX: number,
  rfY: number,
  config: RosMapConfig
): RosCoordinates {
  const { originX, originY, imgHeight } = config;

  // X-axis: RF X and ROS X both increase in the same (rightward) direction.
  // canvas_px = (metres - originX) * CANVAS_SCALE
  // → metres  = originX + canvas_px / CANVAS_SCALE
  const realX = originX + rfX / CANVAS_SCALE;

  // Y-axis inversion:
  //   React Flow Y=0 is at the TOP; ROS Y=0 is at the BOTTOM.
  //   imgHeight is in canvas pixels (= image_px_height * resolution * CANVAS_SCALE).
  //   canvas_py = imgHeight - (metres - originY) * CANVAS_SCALE
  //   → metres  = originY + (imgHeight - canvas_py) / CANVAS_SCALE
  const invertedY = imgHeight - rfY;
  const realY     = originY + invertedY / CANVAS_SCALE;

  return {
    x: parseFloat(realX.toFixed(3)),
    y: parseFloat(realY.toFixed(3)),
  };
}

/**
 * Converts ROS real-world coordinates in meters to React Flow canvas pixels.
 *
 * Formulas (Inverse of toRosCoordinates):
 *   rfX = (realX - originX) * CANVAS_SCALE
 *   rfY = imgHeight - ((realY - originY) * CANVAS_SCALE)
 *
 * @param rosX   - X coordinate in ROS meters.
 * @param rosY   - Y coordinate in ROS meters.
 * @param config - ROS map metadata from `useMapConfig`.
 * @returns Object with `x` and `y` in canvas pixels.
 */
export function fromRosCoordinates(
  rosX: number,
  rosY: number,
  config: RosMapConfig
): { x: number; y: number } {
  const { originX, originY, imgHeight } = config;

  const rfX = (rosX - originX) * CANVAS_SCALE;
  const rfY = imgHeight - ((rosY - originY) * CANVAS_SCALE);

  return { x: rfX, y: rfY };
}
