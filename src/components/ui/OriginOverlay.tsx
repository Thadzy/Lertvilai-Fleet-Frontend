/**
 * @file OriginOverlay.tsx
 * @description Shared absolute overlay that tracks React Flow camera transforms.
 * Renders the World Origin (0,0) with ROS +X (Right) and +Y (Up) axes.
 *
 * IMPORTANT: Must be rendered as a child of <ReactFlow> (inside a ReactFlowProvider
 * context) so that useStore() can access the camera transform.
 */

import { useStore } from 'reactflow';
import { CANVAS_SCALE } from '../../utils/mapCoordinates';
import type { RosMapConfig } from '../../hooks/useMapConfig';

interface OriginOverlayProps {
  config: RosMapConfig;
}

export const OriginOverlay = ({ config }: OriginOverlayProps) => {
  const transform = useStore((state) => state.transform);
  if (!config) return null;

  /**
   * Calculate World Origin (0,0) in canvas pixels.
   *
   * canvas_px = (metres - origin) × CANVAS_SCALE
   * For the world origin (metres = 0):
   *   worldX = (0 - originX) × CANVAS_SCALE = -originX × CANVAS_SCALE
   *   worldY = imgHeight - (0 - originY) × CANVAS_SCALE   (Y-axis flipped)
   *
   * imgHeight is in canvas pixels (raw_px × resolution × CANVAS_SCALE).
   */
  const worldX = (0 - config.originX) * CANVAS_SCALE;
  const worldY = config.imgHeight - ((0 - config.originY) * CANVAS_SCALE);

  // Project world coordinates to screen coordinates using camera state
  const screenX = worldX * transform[2] + transform[0];
  const screenY = worldY * transform[2] + transform[1];

  return (
    <div
      className="absolute pointer-events-none z-0"
      style={{
        left: screenX,
        top: screenY,
        transform: 'translate(-50%, -50%)',
      }}
    >
      <svg
        width="120"
        height="120"
        viewBox="0 0 120 120"
        className="overflow-visible drop-shadow-md"
      >
        <defs>
          <marker id="origin-arrow-x" markerWidth="8" markerHeight="6" refX="8" refY="3" orient="auto">
            <polygon points="0 0, 8 3, 0 6" fill="#3b82f6" />
          </marker>
          <marker id="origin-arrow-y" markerWidth="8" markerHeight="6" refX="8" refY="3" orient="auto">
            <polygon points="0 0, 8 3, 0 6" fill="#10b981" />
          </marker>
        </defs>

        {/* X Axis (+X points RIGHT) */}
        <line x1="60" y1="60" x2="110" y2="60" stroke="#3b82f6" strokeWidth="3" markerEnd="url(#origin-arrow-x)" />
        <text x="115" y="64" fill="#3b82f6" fontSize="12" fontWeight="900" fontFamily="monospace">+X</text>

        {/* Y Axis (+Y points UP) */}
        <line x1="60" y1="60" x2="60" y2="10" stroke="#10b981" strokeWidth="3" markerEnd="url(#origin-arrow-y)" />
        <text x="50" y="5" fill="#10b981" fontSize="12" fontWeight="900" fontFamily="monospace">+Y</text>

        {/* Center Dot */}
        <circle cx="60" cy="60" r="5" fill="white" stroke="#3b82f6" strokeWidth="2" />
      </svg>
      <div className="absolute top-[75px] left-1/2 -translate-x-1/2 whitespace-nowrap">
        <span className="text-[10px] font-black text-slate-600 dark:text-slate-300 bg-white/90 dark:bg-[#121214]/90 px-1.5 py-0.5 rounded shadow-sm border border-slate-200 dark:border-white/10 backdrop-blur-sm">
          ORIGIN (0,0)
        </span>
      </div>
    </div>
  );
};
