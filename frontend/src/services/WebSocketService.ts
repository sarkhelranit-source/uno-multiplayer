import type { WsMessage } from '../types/game';

type MessageHandler = (msg: WsMessage) => void;

class WebSocketService {
  private ws: WebSocket | null = null;
  private url: string;
  private sessionId: string;
  private handlers: Set<MessageHandler> = new Set();
  private isConnecting: boolean = false;
  
  // Reconnection state
  private lastRoomId?: string;
  private reconnectAttempts = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private pingInterval: ReturnType<typeof setInterval> | null = null;
  private intentionallyDisconnected = false;
  
  // Heartbeat tracking
  private pongTimeout: ReturnType<typeof setTimeout> | null = null;

  constructor() {
    this.url = import.meta.env.VITE_WEBSOCKET_URL || '';
    if (!this.url) {
      console.error('VITE_WEBSOCKET_URL is not defined in .env');
    }

    let sid = sessionStorage.getItem('uno_session_id');
    if (!sid) {
      sid = `session_${Math.random().toString(36).substring(2, 15)}`;
      sessionStorage.setItem('uno_session_id', sid);
    }
    this.sessionId = sid;

    // Listen to tab visibility to handle mobile app switching
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', this.handleVisibilityChange.bind(this));
      window.addEventListener('focus', this.handleVisibilityChange.bind(this));
    }
  }

  private handleVisibilityChange() {
    if (document.visibilityState === 'visible') {
      this.checkConnection();
    }
  }

  private checkConnection() {
    // If not connected and not intentionally disconnected, try to reconnect
    if (!this.isConnected() && !this.intentionallyDisconnected && this.lastRoomId) {
      this.triggerReconnect();
      return;
    }
    
    // If we think we're connected, let's verify with a ping (mobile OS sometimes freezes sockets)
    if (this.isConnected()) {
      this.verifyAlive();
    }
  }

  private verifyAlive() {
    if (!this.ws) return;
    
    // Wait for pong or timeout
    if (this.pongTimeout) clearTimeout(this.pongTimeout);
    this.pongTimeout = setTimeout(() => {
      console.warn('Heartbeat timeout - force reconnecting');
      if (this.ws) {
        this.ws.close(); // This will trigger onclose which triggers auto-reconnect
      }
    }, 3000);
    
    // We send a generic string that the backend can optionally respond to.
    // If the socket is completely frozen, the send might fail or we won't get any messages.
    // However, API Gateway doesn't have a native PING/PONG frame we can intercept in browser WS.
    // To implement a true heartbeat, we should send an action.
    this.sendAction('PING');
  }

  public connect(roomId?: string): Promise<void> {
    if (roomId) this.lastRoomId = roomId;
    this.intentionallyDisconnected = false;

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
      if (this.lastRoomId) {
        connectionUrl += `&roomId=${this.lastRoomId}`;
      }

      this.ws = new WebSocket(connectionUrl);

      this.ws.onopen = () => {
        console.log('WebSocket connected');
        this.isConnecting = false;
        this.reconnectAttempts = 0;
        
        // Notify UI we reconnected
        this.emit({ type: 'reconnected' });

        this.pingInterval = setInterval(() => {
          this.sendAction('PING');
        }, 5 * 60 * 1000); // API Gateway 10 min idle timeout

        if (this.lastRoomId) {
          this.sendAction('RECONNECT', { roomId: this.lastRoomId, sessionId: this.sessionId });
        }
        
        resolve();
      };

      this.ws.onmessage = (event) => {
        // Any message proves the connection is alive
        if (this.pongTimeout) {
          clearTimeout(this.pongTimeout);
          this.pongTimeout = null;
        }

        try {
          const data = JSON.parse(event.data) as WsMessage;
          this.emit(data);
        } catch (err) {
          console.error('Failed to parse WebSocket message:', event.data, err);
        }
      };

      this.ws.onclose = () => {
        console.log('WebSocket disconnected');
        this.ws = null;
        this.isConnecting = false;
        this.cleanupIntervals();
        
        if (!this.intentionallyDisconnected) {
          this.triggerReconnect();
        }
      };

      this.ws.onerror = (err) => {
        console.error('WebSocket error:', err);
        this.isConnecting = false;
        reject(err);
      };
    });
  }

  private triggerReconnect() {
    if (this.intentionallyDisconnected || !this.lastRoomId) return;
    
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    
    if (this.reconnectAttempts < 5) {
      this.reconnectAttempts++;
      const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts - 1), 10000);
      console.log(`Reconnecting in ${delay}ms... (Attempt ${this.reconnectAttempts})`);
      
      this.emit({ type: 'reconnecting' });
      
      this.reconnectTimer = setTimeout(() => {
        this.connect(this.lastRoomId).catch(() => {
          // Reconnection failed, trigger it again (onclose will fire or we handle it here)
          // The error handler will be caught by the connect promise reject, but onclose also fires.
        });
      }, delay);
    } else {
      console.error('Max reconnection attempts reached.');
      this.emit({ type: 'error', message: 'Connection lost. Please refresh the page.' });
    }
  }

  private cleanupIntervals() {
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
      this.pingInterval = null;
    }
    if (this.pongTimeout) {
      clearTimeout(this.pongTimeout);
      this.pongTimeout = null;
    }
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }

  private emit(msg: WsMessage) {
    this.handlers.forEach((handler) => handler(msg));
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
    this.intentionallyDisconnected = true;
    this.lastRoomId = undefined;
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.cleanupIntervals();
  }

  public getSessionId() {
    return this.sessionId;
  }

  public isConnected() {
    return this.ws !== null && this.ws.readyState === WebSocket.OPEN;
  }
}

export const wsService = new WebSocketService();
