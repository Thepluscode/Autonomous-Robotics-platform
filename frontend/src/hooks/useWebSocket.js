import { useState, useEffect, useRef } from "react";

const WS_BASE = (process.env.REACT_APP_BACKEND_URL || "http://localhost:8001")
  .replace("https://", "wss://")
  .replace("http://", "ws://");

// Connects to /ws/updates using the httpOnly access_token cookie set by the
// backend, pings every 25s, and reconnects on ordinary close events.
export default function useWebSocket() {
  const [isConnected, setIsConnected] = useState(false);
  const [lastMessage, setLastMessage] = useState(null);

  const wsRef = useRef(null);
  const reconnectTimer = useRef(null);
  const pingTimer = useRef(null);

  useEffect(() => {
    let cancelled = false;

    const connect = () => {
      if (cancelled) return;

      const ws = new WebSocket(`${WS_BASE}/ws/updates`);
      wsRef.current = ws;

      ws.onopen = () => {
        if (cancelled) {
          ws.close();
          return;
        }
        setIsConnected(true);
        clearInterval(pingTimer.current);
        pingTimer.current = setInterval(() => {
          if (ws.readyState === WebSocket.OPEN) ws.send("ping");
        }, 25000);
      };

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data.type !== "pong") setLastMessage(data);
        } catch {
          // ignore non-JSON
        }
      };

      ws.onclose = (event) => {
        setIsConnected(false);
        clearInterval(pingTimer.current);
        if (cancelled) return;
        if (event.code === 4401) return;
        clearTimeout(reconnectTimer.current);
        reconnectTimer.current = setTimeout(connect, 3000);
      };

      ws.onerror = () => {
        // Let onclose handle reconnect logic; just ensure the socket is closed.
        ws.close();
      };
    };

    connect();

    return () => {
      cancelled = true;
      clearTimeout(reconnectTimer.current);
      clearInterval(pingTimer.current);
      if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
        wsRef.current.close();
      }
    };
  }, []);

  return { isConnected, lastMessage };
}
