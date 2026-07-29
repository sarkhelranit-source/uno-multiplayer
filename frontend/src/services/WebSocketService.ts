import type { WsMessage } from '../types/game';

type MessageHandler = (msg: WsMessage) => void;

class WebSocketService {
  private ws: WebSocket | null = null;
  private url: string;
  private sessionId: string;
  private handlers: Set<MessageHandler> = new Set();
  private isConnecting: boolean = false;
  
  // Reconnection state
  private reconnectAttempts = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private pingInterval: ReturnType<typeof setInterval> | null = null;
  private intentionallyDisconnected = false;

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

    // Listen to tab visibility to handle mobile app switching.
    // This is the KEY fix: when a mobile user switches to WhatsApp and back,
    // the browser fires visibilitychange. We use this to detect stale connections.
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', this.handleVisibilityChange);
      window.addEventListener('focus', this.handleFocus);
    }
  }

  /**
   * Gets the current room ID from sessionStorage — the single source of truth.
   * Both LobbyPage and GamePage save roomId to sessionStorage when they learn it
   * (e.g. after roomCreated, lobbyUpdate messages). This means even if the host
   * called connect() without a roomId (during CREATE_ROOM), we'll still know
   * the room once the server responds and the page saves it.
   */
  private getRoomId(): string | null {
    return sessionStorage.getItem('uno_room_id');
  }

  private handleVisibilityChange = () => {
    if (document.visibilityState === 'visible') {
      this.checkConnectionOnResume();
    }
  };

  private handleFocus = () => {
    // Some mobile browsers fire focus but not visibilitychange
    this.checkConnectionOnResume();
  };

  /**
   * Called when the tab becomes visible again (user switched back from WhatsApp etc).
   * Checks if the WebSocket is still alive and reconnects if needed.
   */
  private checkConnectionOnResume() {
    const roomId = this.getRoomId();
    if (!roomId || this.intentionallyDisconnected) return;

    if (!this.isConnected()) {
      // Socket is dead — reconnect immediately (no delay for first attempt on resume)
      console.log('Tab resumed: socket is dead, reconnecting...');
      this.reconnectAttempts = 0; // Reset so we get a fresh set of retries
      this.emit({ type: 'reconnecting' });
      this.connect(roomId).catch(() => {
        // connect() rejection is handled; onclose will trigger further retries
      });
    }
    // If the socket IS still open, do nothing. When the server receives any 
    // subsequent message (like the keep-alive PING), it will respond and 
    // prove liveness. No need for a forced heartbeat check that could
    // accidentally kill healthy connections.
  }

  public connect(roomId?: string): Promise<void> {
    this.intentionallyDisconnected = false;

    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      // Already connected. If we have a roomId and need to re-sync, send RECONNECT.
      if (roomId) {
        this.sendAction('RECONNECT', { roomId, sessionId: this.sessionId });
      }
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
    // Use the provided roomId, or fall back to sessionStorage
    const targetRoomId = roomId || this.getRoomId();

    return new Promise((resolve, reject) => {
      let connectionUrl = `${this.url}?sessionId=${this.sessionId}`;
      if (targetRoomId) {
        connectionUrl += `&roomId=${targetRoomId}`;
      }

      this.ws = new WebSocket(connectionUrl);

      this.ws.onopen = () => {
        console.log('WebSocket connected');
        this.isConnecting = false;
        this.reconnectAttempts = 0;

        // Notify UI that the connection was (re-)established
        this.emit({ type: 'reconnected' });

        // AWS API Gateway disconnects idle websockets after 10 minutes.
        // Send a keep-alive PING every 5 minutes.
        this.pingInterval = setInterval(() => {
          this.sendAction('PING');
        }, 5 * 60 * 1000);

        // If we know we're in a room, send RECONNECT to re-sync state.
        // This is what tells the backend "I'm back, update my connectionId
        // and broadcast the updated player list to everyone."
        if (targetRoomId) {
          this.sendAction('RECONNECT', { roomId: targetRoomId, sessionId: this.sessionId });
        }

        resolve();
      };

      this.ws.onmessage = (event) => {
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
        
        // Auto-reconnect if this wasn't an intentional disconnect
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

  /**
   * Schedules a reconnection attempt with exponential backoff.
   * Called automatically from onclose when the disconnect was unexpected.
   */
  private triggerReconnect() {
    const roomId = this.getRoomId();
    if (this.intentionallyDisconnected || !roomId) return;
    
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    
    if (this.reconnectAttempts < 5) {
      this.reconnectAttempts++;
      const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts - 1), 10000);
      console.log(`Auto-reconnecting in ${delay}ms... (Attempt ${this.reconnectAttempts}/5)`);
      
      this.emit({ type: 'reconnecting' });
      
      this.reconnectTimer = setTimeout(() => {
        this.connect(roomId).catch(() => {
          // If connect() rejects (onerror), onclose will also fire and re-trigger this.
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

// Export a singleton instance
export const wsService = new WebSocketService();
