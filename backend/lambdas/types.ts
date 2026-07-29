// =====================================================
// types.ts — UNO Game Data Model
// =====================================================

export type CardColor = 'red' | 'blue' | 'green' | 'yellow';
export type WildColor = 'wild';
export type AnyColor = CardColor | WildColor;

export type NumberValue = '0' | '1' | '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9';
export type ActionValue = 'skip' | 'reverse' | 'draw2';
export type WildValue = 'wild' | 'wild4';
export type CardValue = NumberValue | ActionValue | WildValue;

export interface Card {
  color: AnyColor;
  value: CardValue;
  id: string;             // Unique ID for animation tracking (e.g., "red-7-0")
}

export interface UnoPlayer {
  connectionId: string;
  sessionId: string;
  name: string;
  hand: Card[];           // PRIVATE — never broadcast to other players
  hasCalledUno: boolean;
  isDisconnected: boolean;
  lastReactionAt?: number; // Backend rate limiting for emojis
}

export interface GameSettings {
  stackDrawCards: boolean;    // Can you stack +2 on +2? (OFF for official rules)
  forcePlay: boolean;         // Must play if you can? (OFF for official rules)
  jumpIn: boolean;            // Play out of turn with exact match? (OFF for official rules)
  drawUntilMatch: boolean;    // Keep drawing until playable? (OFF for official rules)
}

export interface UnoGame {
  roomId: string;              // Partition key (e.g., "ABCD")
  hostId: string;              // sessionId of host
  status: 'waiting' | 'playing' | 'finished';

  // UNO-specific state
  drawPile: Card[];            // Face-down deck
  discardPile: Card[];         // Face-up pile (top = current card to match)
  currentPlayerIndex: number;  // Index into players[] for whose turn it is
  direction: 1 | -1;          // 1 = clockwise, -1 = counter-clockwise
  currentColor: CardColor;     // Active color to match (set by wilds or last played card)
  pendingDrawCount: number;    // Cards the next player must draw (draw2 / wild4 penalty)

  // Players with their private hands
  players: UnoPlayer[];

  // Game result
  winner?: string;             // Name of winning player
  settings: GameSettings;

  // Turn timer
  turnStartedAt?: number;      // Timestamp when current turn began (for 5-min timer)
  lastAction?: string;         // Description of last action for UI display
  hasDrawnThisTurn: boolean;   // Has the current player drawn a card this turn?
}

/** Result of a game engine operation */
export interface ActionResult {
  success: boolean;
  error?: string;
  event?: GameEvent;
}

/** Events emitted by engine operations, for broadcast messages */
export type GameEvent =
  | { type: 'cardPlayed'; playerName: string; card: Card; newColor?: CardColor }
  | { type: 'cardDrawn'; playerName: string; count: number }
  | { type: 'unoCalled'; playerName: string }
  | { type: 'unoFailed'; playerName: string; penaltyCards: number }
  | { type: 'turnSkipped'; playerName: string }
  | { type: 'directionReversed' }
  | { type: 'drawPenalty'; playerName: string; count: number }
  | { type: 'gameWon'; playerName: string }
  | { type: 'deckReshuffled' }
  | { type: 'turnTimeout'; playerName: string }
  | { type: 'drawnCardPlayed'; playerName: string; card: Card };
