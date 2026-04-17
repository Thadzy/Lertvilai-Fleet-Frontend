/**
 * @file useMapConfig.ts
 * @description Safe version bypassing missing schema columns.
 */

import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabaseClient';

export interface RosMapConfig {
  resolution: number;
  originX: number;
  originY: number;
  imgHeight: number;
}

/**
 * Default map configuration matching a typical ROS .pgm map.
 *
 * imgHeight MUST be in canvas pixels, computed as:
 *   imgHeight = raw_image_pixel_height * resolution * CANVAS_SCALE
 *             = 1000px * 0.05 m/px * 100 canvas-px/m
 *             = 5000 canvas px
 *
 * Never set imgHeight to the raw pixel count of the image (1000).
 * That would make the Y-flip formula place nodes 5× too high when
 * resolution = 0.05 and CANVAS_SCALE = 100.
 */
export const DEFAULT_ROS_MAP_CONFIG: RosMapConfig = {
  resolution: 0.05,
  originX: -6.77,
  originY: -19.2,
  imgHeight: 5000, // canvas px = 1000 raw px × 0.05 m/px × 100 canvas-px/m
};

export function useMapConfig(graphId: number) {
  const [config, setConfig] = useState<RosMapConfig>(DEFAULT_ROS_MAP_CONFIG);
  const [configLoading, setConfigLoading] = useState(true);

  useEffect(() => {
    if (!graphId) return;

    let cancelled = false;
    setConfigLoading(true);

    const load = async () => {
      // Safe fetch: Only request ID to verify graph existence
      const { error } = await supabase
        .from('wh_graphs')
        .select('id') 
        .eq('id', graphId)
        .single();

      if (cancelled) return;
      if (error) console.error('[useMapConfig] Failed to verify graph:', error.message);
      
      setConfig(DEFAULT_ROS_MAP_CONFIG);
      setConfigLoading(false);
    };

    load();
    return () => { cancelled = true; };
  }, [graphId]);

  const updateConfig = useCallback(
    async (updates: Partial<RosMapConfig>): Promise<RosMapConfig> => {
      const merged = { ...config, ...updates };
      setConfig(merged);
      console.warn('[useMapConfig] Local update only. DB update bypassed.');
      return merged;
    },
    [config]
  );

  return { config, updateConfig, configLoading };
}