import { useEffect, useState, useCallback, useRef } from 'react';
import mqtt, { type MqttClient } from 'mqtt';

// --- CONFIGURATION ---
const BROKER_URL = 'ws://broker.emqx.io:8083/mqtt';

/**
 * Standard Robot Status Message Structure
 */
export interface RobotStatusMessage {
    id: string | number;
    status: 'idle' | 'busy' | 'offline' | 'error';
    battery: number;
    x: number;
    y: number;
    angle?: number;
    current_task_id?: number | null;
}

/**
 * useMQTT Hook
 * ============
 * Handles real-time telemetry from robots via an MQTT broker.
 * 
 * Features:
 * - Singleton Client Pattern: Prevents multiple client instances on re-renders via useRef.
 * - Resilient Reconnects: Library internal backoff is used instead of force-closing on error.
 * - Performance: Uses refs for status mapping to avoid stale closure issues in callbacks.
 */
export const useMQTT = () => {
    const [isConnected, setIsConnected] = useState(false);
    const [robotStates, setRobotStates] = useState<Record<string, RobotStatusMessage>>({});
    const [logs, setLogs] = useState<string[]>([]);
    
    // Ref-based singleton for the MQTT client
    const clientRef = useRef<MqttClient | null>(null);
    const robotStatesRef = useRef<Record<string, RobotStatusMessage>>({});

    useEffect(() => {
        // Prevent duplicate connection attempts
        if (clientRef.current) return;

        console.log(`[MQTT] Initiating connection to ${BROKER_URL}...`);

        const mqttClient = mqtt.connect(BROKER_URL, {
            clientId: `fleet_interface_${Math.random().toString(16).substring(2, 8)}`,
            keepalive: 60,
            clean: true,
            reconnectPeriod: 5000, // 5s backoff for stability
            connectTimeout: 30 * 1000,
        });

        clientRef.current = mqttClient;

        mqttClient.on('connect', () => {
            console.log('[MQTT] Connected successfully.');
            setIsConnected(true);

            mqttClient.subscribe(['robots/+/status', 'fleet/logs'], (err) => {
                if (err) console.error('[MQTT] Subscription error:', err);
                else console.log('[MQTT] Subscribed to telemetry and log topics.');
            });
        });

        mqttClient.on('reconnect', () => {
            console.log('[MQTT] Attempting to reconnect...');
        });

        mqttClient.on('close', () => {
            console.log('[MQTT] Connection closed.');
            setIsConnected(false);
        });

        mqttClient.on('message', (topic, message) => {
            try {
                // Log routing
                if (topic === 'fleet/logs') {
                    const payload = JSON.parse(message.toString());
                    const msg = payload.msg || "Unknown Event";
                    setLogs(prev => [msg, ...prev].slice(0, 50));
                    return;
                }

                // Status routing (topic format: robots/{id}/status)
                const parts = topic.split('/');
                const robotId = parts[1];
                const type = parts[2];

                if (type === 'status' && robotId) {
                    const payload = JSON.parse(message.toString()) as RobotStatusMessage;
                    setRobotStates((prev) => {
                        const next = { ...prev, [robotId]: payload };
                        robotStatesRef.current = next;
                        return next;
                    });
                }
            } catch (err) {
                console.error('[MQTT] Failed to parse message:', err);
            }
        });

        mqttClient.on('error', (err) => {
            console.error('[MQTT] Connection error encountered:', err);
            // Internal reconnect logic will handle recovery; do not call end()
        });

        mqttClient.on('offline', () => {
            console.log('[MQTT] Broker went offline.');
            setIsConnected(false);
        });

        return () => {
            console.log('[MQTT] Hook unmounting. Terminating connection...');
            if (clientRef.current) {
                clientRef.current.end(true); // Force close
                clientRef.current = null;
            }
        };
    }, []);

    /**
     * Publishes a control command to a robot.
     */
    const publishCommand = useCallback((robotId: number | string, command: string, payload: any = {}) => {
        const client = clientRef.current;
        if (!client || !client.connected) {
            console.warn('[MQTT] Cannot publish command: Client not connected.');
            return;
        }

        const topic = `robots/${robotId}/command`;
        const message = JSON.stringify({ command, ...payload, timestamp: Date.now() });

        client.publish(topic, message, { qos: 1 }, (err) => {
            if (err) console.error(`[MQTT] Publish error to ${topic}:`, err);
            else console.log(`[MQTT] Dispatched ${command} to ${robotId}`);
        });
    }, []);

    return { isConnected, robotStates, logs, publishCommand, client: clientRef.current };
};
