/**
 * @file useMapConfig.ts
 * @description Safe version with local storage persistence to handle database bypass.
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
 */
export const DEFAULT_ROS_MAP_CONFIG: RosMapConfig = {
  resolution: 0.05,
  originX: -6.77,
  originY: -19.2,
  imgHeight: 5000, // canvas px = 1000 raw px × 0.05 m/px × 100 canvas-px/m
};

/**
 * useMapConfig Hook
 * =================
 * Manages spatial configuration for a warehouse graph.
 * Since the database update is currently bypassed, this hook uses
 * localStorage to ensure user-defined map settings persist across reloads.
 * 
 * @param graphId - The unique ID of the graph being edited.
 */
export function useMapConfig(graphId: number) {
  const storageKey = `wcs_map_config_v4_graph_${graphId}`;

  // Initial load from localStorage with fallback to default
  const [config, setConfig] = useState<RosMapConfig>(() => {
    try {
      const saved = localStorage.getItem(storageKey);
      if (saved) {
        return JSON.parse(saved);
      }
    } catch (err) {
      console.warn(`[useMapConfig] Failed to parse local config for graph ${graphId}:`, err);
    }
    return DEFAULT_ROS_MAP_CONFIG;
  });

  const [configLoading, setConfigLoading] = useState(true);

  useEffect(() => {
    if (!graphId) return;

    let cancelled = false;
    setConfigLoading(true);

    const load = async () => {
      // Safe fetch: Verify graph exists
      const { error } = await supabase
        .from('wh_graphs')
        .select('id') 
        .eq('id', graphId)
        .single();

      if (cancelled) return;
      if (error) {
        console.error('[useMapConfig] Failed to verify graph existence:', error.message);
      }
      
      // Configuration is already loaded from localStorage in the state initializer.
      // In the future, this is where we would merge local settings with DB settings.
      
      setConfigLoading(false);
    };

    load();
    return () => { cancelled = true; };
  }, [graphId]);

  /**
   * Updates the configuration state and persists it to localStorage.
   */
  const updateConfig = useCallback(
    async (updates: Partial<RosMapConfig>): Promise<RosMapConfig> => {
      const merged = { ...config, ...updates };
      
      // Update local React state
      setConfig(merged);

      try {
        // Persist to local storage
        localStorage.setItem(storageKey, JSON.stringify(merged));
        console.log(`[useMapConfig] Graph ${graphId} config saved locally.`);
      } catch (err) {
        console.error(`[useMapConfig] Persistence failed for graph ${graphId}:`, err);
      }

      // Maintain warning for DB bypass as requested in audit
      console.warn('[useMapConfig] Database persistence bypassed. Saved to local storage only.');
      return merged;
    },
    [config, graphId, storageKey]
  );

  return { config, updateConfig, configLoading };
}
