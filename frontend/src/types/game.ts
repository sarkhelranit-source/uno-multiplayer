export type CardColor = 'red' | 'blue' | 'green' | 'yellow' | 'wild';
export type CardValue = '0' | '1' | '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9' | 'skip' | 'reverse' | 'draw2' | 'wild' | 'wild4';

export interface Card {
  color: CardColor;
  value: CardValue;
  id: string;
}

export interface PlayerInfo {
  name: string;
  isHost: boolean;
  isDisconnected: boolean;
  cardCount?: number;
  hasCalledUno?: boolean;
}

export interface PublicGameState {
  roomId: string;
  status: 'waiting' | 'playing' | 'finished';
  currentPlayerIndex: number;
  direction: 1 | -1;
  currentColor: CardColor;
  topCard: Card;
  drawPileCount: number;
  pendingDrawCount: number;
  winner?: string;
  lastAction?: string;
  players: PlayerInfo[];
}

export interface PrivateGameState {
  hand: Card[];
  playableCardIds: string[];
}

// WebSocket incoming messages
export type WsMessage =
  | { type: 'roomCreated'; roomId: string; players: PlayerInfo[] }
  | { type: 'lobbyUpdate'; roomId: string; players: PlayerInfo[]; playerCount: number; maxPlayers: number }
  | { type: 'gameStateUpdate'; publicState: PublicGameState; privateState: PrivateGameState }
  | { type: 'playerDisconnected'; playerName: string; playerIndex: number; players: PlayerInfo[] }
  | { type: 'leftRoom' }
  | { type: 'error'; message: string };
