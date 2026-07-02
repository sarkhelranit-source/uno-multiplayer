export interface UnoGame {
  roomId: string;              // Partition key (e.g., "ABCD")
  hostId: string;              // connectionId of host
  status: 'waiting' | 'playing' | 'finished';
  
  // UNO-specific state
  drawPile: Card[];            // Face-down deck
  discardPile: Card[];         // Face-up pile (top = current card)
  currentPlayerIndex: number;  // Whose turn
  direction: 1 | -1;          // 1 = clockwise, -1 = counter-clockwise
  currentColor: string;        // Active color (matters after wild)
  pendingDrawCount: number;    // Stacked draw-2/draw-4 count (if house rule enabled)
  
  // Players with their private hands
  players: UnoPlayer[];
  
  // Room metadata
  winner?: string;
  settings: GameSettings;
}

export interface Card {
  color: 'red' | 'blue' | 'green' | 'yellow' | 'wild';
  value: string;  // '0'-'9', 'skip', 'reverse', 'draw2', 'wild', 'wild4'
  id: string;     // Unique ID for animation tracking
}

export interface UnoPlayer {
  connectionId: string;
  sessionId: string;
  name: string;
  hand: Card[];              // PRIVATE — never broadcast
  hasCalledUno: boolean;     // Whether they called UNO
  isDisconnected: boolean;
}

export interface GameSettings {
  stackDrawCards: boolean;    // Can you stack +2 on +2?
  forcePlay: boolean;        // Must play if you can?
  jumpIn: boolean;           // Can you play out of turn if you have exact match?
  drawUntilMatch: boolean;   // Keep drawing until you get a playable card?
}
