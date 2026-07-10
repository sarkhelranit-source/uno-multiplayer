import type { WsMessage } from '../types/game';

type MessageHandler = (msg: WsMessage) => void;

class WebSocketService {
  private ws: WebSocket | null = null;
  private url: string;
  private sessionId: string;
  private handlers: Set<MessageHandler> = new Set();
  private isConnecting: boolean = false;

  constructor() {
    // Read from .env
    this.url = import.meta.env.VITE_WEBSOCKET_URL || '';
    if (!this.url) {
      console.error('VITE_WEBSOCKET_URL is not defined in .env');
    }

    // Persist sessionId across reloads but keep it unique per tab for local testing
    let sid = sessionStorage.getItem('uno_session_id');
    if (!sid) {
      sid = `session_${Math.random().toString(36).substring(2, 15)}`;
      sessionStorage.setItem('uno_session_id', sid);
    }
    this.sessionId = sid;
  }

  private pingInterval: ReturnType<typeof setInterval> | null = null;

  public connect(roomId?: string): Promise<void> {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      return Promise.resolve();
    }

    if (this.isConnecting) {
      return new Promise((resolve) => {
        const interval = setInterval(() => {
          if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            clearInterval(interval);
            resolve();
          }
        }, 100);
      });
    }

    this.isConnecting = true;
    return new Promise((resolve, reject) => {
      let connectionUrl = `${this.url}?sessionId=${this.sessionId}`;
      if (roomId) {
        connectionUrl += `&roomId=${roomId}`;
      }

      this.ws = new WebSocket(connectionUrl);

      this.ws.onopen = () => {
        console.log('WebSocket connected');
        this.isConnecting = false;
        
        // AWS API Gateway disconnects idle websockets after 10 minutes.
        // Send a ping every 5 minutes to keep it alive.
        this.pingInterval = setInterval(() => {
          this.sendAction('PING');
        }, 5 * 60 * 1000);

        if (roomId) {
          this.sendAction('RECONNECT', { roomId, sessionId: this.sessionId });
        }
        
        resolve();
      };

      this.ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data) as WsMessage;
          this.handlers.forEach((handler) => handler(data));
        } catch (err) {
          console.error('Failed to parse WebSocket message:', event.data, err);
        }
      };

      this.ws.onclose = () => {
        console.log('WebSocket disconnected');
        this.ws = null;
        this.isConnecting = false;
        if (this.pingInterval) {
          clearInterval(this.pingInterval);
          this.pingInterval = null;
        }
      };

      this.ws.onerror = (err) => {
        console.error('WebSocket error:', err);
        this.isConnecting = false;
        reject(err);
      };
    });
  }

  public subscribe(handler: MessageHandler): () => void {
    this.handlers.add(handler);
    return () => {
      this.handlers.delete(handler);
    };
  }

  public sendAction(action: string, payload: Record<string, any> = {}) {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      console.error('WebSocket is not connected. Cannot send action:', action);
      return;
    }

    this.ws.send(JSON.stringify({ action, payload }));
  }

  public disconnect() {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
      this.pingInterval = null;
    }
  }

  public getSessionId() {
    return this.sessionId;
  }
}

// Export a singleton instance
export const wsService = new WebSocketService();
