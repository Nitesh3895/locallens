import { useEffect, useRef, useCallback } from 'react';
import { useStore } from '../stores/appStore';

type WsEvent = {
  type: string;
  payload: Record<string, unknown>;
};

export function useWebSocket() {
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimer = useRef<ReturnType<typeof setTimeout>>();
  const {
    setConnected,
    handleWsEvent,
  } = useStore();

  const connect = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) return;

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/ws`;

    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onopen = () => {
      setConnected(true);
    };

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data) as WsEvent;
        if (data.type === 'batch') {
          const events = (data.payload['events'] as WsEvent[]) || [];
          for (const evt of events) {
            handleWsEvent(evt.type, evt.payload);
          }
        } else {
          handleWsEvent(data.type, data.payload);
        }
      } catch {
        // ignore parse errors
      }
    };

    ws.onclose = () => {
      setConnected(false);
      reconnectTimer.current = setTimeout(connect, 3000);
    };

    ws.onerror = () => {
      ws.close();
    };
  }, [setConnected, handleWsEvent]);

  useEffect(() => {
    connect();
    return () => {
      clearTimeout(reconnectTimer.current);
      wsRef.current?.close();
    };
  }, [connect]);

  return wsRef;
}
