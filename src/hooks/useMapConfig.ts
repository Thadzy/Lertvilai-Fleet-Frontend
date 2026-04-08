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

export const DEFAULT_ROS_MAP_CONFIG: RosMapConfig = {
  resolution: 0.05,
  originX: -6.77,
  originY: -19.2,
  imgHeight: 1000,
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