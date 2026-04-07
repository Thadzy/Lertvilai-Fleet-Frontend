/**
 * AnimatedEdge — Bezier edge with an optional CSS-animated flowing dash overlay.
 *
 * Two `<path>` elements are rendered:
 *   1. A solid base stroke with the configured colour + arrow marker.
 *   2. A dashed overlay that flows via `.animated-edge-flow` (index.css)
 *      **only when the `animated` prop is true**.
 *
 * This keeps idle base-graph edges visually quiet (static Bezier curve) while
 * making active paths / sim routes clearly animated.
 *
 * Register in React Flow:
 * ```tsx
 * import AnimatedEdge from './edges/AnimatedEdge';
 * const edgeTypes = { animatedEdge: AnimatedEdge };
 * ```
 *
 * @module AnimatedEdge
 */
import React, { memo } from 'react';
import { getStraightPath, type EdgeProps } from 'reactflow';

const AnimatedEdge = memo(({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  style = {},
  markerEnd,
  animated,
}: EdgeProps) => {
  const [edgePath] = getStraightPath({ sourceX, sourceY, targetX, targetY });

  const stroke = (style as React.CSSProperties & { stroke?: string }).stroke ?? '#3b82f6';
  const strokeWidth = (style as React.CSSProperties & { strokeWidth?: number }).strokeWidth ?? 2;

  return (
    <>
      <path
        id={id}
        className="react-flow__edge-path"
        d={edgePath}
        style={{ ...style, fill: 'none', stroke, strokeWidth }}
        markerEnd={markerEnd}
      />

      {/* Dashed overlay with flow animation */}
      <path
        d={edgePath}
        className={animated ? 'animated-edge-flow' : ''}
        style={{
          fill: 'none',
          stroke: animated ? '#22d3ee' : 'transparent', // Cyan-400 for animation
          strokeWidth: strokeWidth * 0.8,
          strokeDasharray: '8 6',
          opacity: animated ? 0.9 : 0,
          pointerEvents: 'none',
          transition: 'opacity 0.3s ease',
        }}
      />
    </>
  );
});

AnimatedEdge.displayName = 'AnimatedEdge';

export default AnimatedEdge;
