// =====================================================
// gameEngine.ts — Pure UNO Game Logic
//
// This module contains ZERO AWS dependencies. It operates
// entirely on the UnoGame state object, making it easy
// to unit test in isolation.
//
// Rules implemented: Official UNO Rules
//   - No stacking (Draw 2 cannot be stacked)
//   - No jump-in
//   - Draw one and pass (draw 1 card; play it if playable, else turn ends)
//   - No 7-0 rule
//   - First to empty hand wins
// =====================================================

import {
  Card, CardColor, CardValue, AnyColor, WildValue,
  UnoGame, UnoPlayer, GameSettings, ActionResult, GameEvent,
} from './types.js';

// =====================================================
// CONSTANTS
// =====================================================

const COLORS: CardColor[] = ['red', 'blue', 'green', 'yellow'];
const NUMBER_VALUES: CardValue[] = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9'];
const ACTION_VALUES: CardValue[] = ['skip', 'reverse', 'draw2'];
const WILD_VALUES: WildValue[] = ['wild', 'wild4'];
const CARDS_PER_PLAYER = 7;
const TURN_TIMEOUT_MS = 30_000; // 30 seconds
const UNO_PENALTY_CARDS = 2;

// =====================================================
// DECK GENERATION
// =====================================================

/**
 * Generates a full 108-card UNO deck:
 *   - 76 number cards: one 0 per color, two of each 1-9 per color
 *   - 24 action cards: two each of skip, reverse, draw2 per color
 *   -  8 wild cards: four wild, four wild draw four
 */
export function generateDeck(): Card[] {
  const deck: Card[] = [];
  let idCounter = 0;

  for (const color of COLORS) {
    // One "0" per color
    deck.push({ color, value: '0', id: `${color}-0-${idCounter++}` });

    // Two of each 1–9 per color
    for (const val of NUMBER_VALUES) {
      if (val === '0') continue; // already added above
      deck.push({ color, value: val, id: `${color}-${val}-${idCounter++}` });
      deck.push({ color, value: val, id: `${color}-${val}-${idCounter++}` });
    }

    // Two of each action card per color
    for (const val of ACTION_VALUES) {
      deck.push({ color, value: val, id: `${color}-${val}-${idCounter++}` });
      deck.push({ color, value: val, id: `${color}-${val}-${idCounter++}` });
    }
  }

  // 4 wild and 4 wild draw four
  for (const val of WILD_VALUES) {
    for (let i = 0; i < 4; i++) {
      deck.push({ color: 'wild', value: val, id: `wild-${val}-${idCounter++}` });
    }
  }

  return deck; // 108 cards total
}

// =====================================================
// SHUFFLE (Fisher-Yates)
// =====================================================

/**
 * Shuffles an array in place using the Fisher-Yates algorithm
 * with crypto-quality randomness.
 */
export function shuffleDeck<T>(array: T[]): T[] {
  for (let i = array.length - 1; i > 0; i--) {
    // Use crypto.getRandomValues for better randomness
    const randomBuffer = new Uint32Array(1);
    crypto.getRandomValues(randomBuffer);
    const j = randomBuffer[0] % (i + 1);
    [array[i], array[j]] = [array[j], array[i]];
  }
  return array;
}

// =====================================================
// GAME INITIALIZATION
// =====================================================

/**
 * Creates a new UnoGame from a list of players.
 * Generates and shuffles the deck, deals 7 cards each,
 * and flips the first valid card onto the discard pile.
 */
export function initializeGame(
  roomId: string,
  hostId: string,
  playerInfos: Array<{ connectionId: string; sessionId: string; name: string }>,
): UnoGame {
  if (playerInfos.length < 2 || playerInfos.length > 8) {
    throw new Error(`Invalid player count: ${playerInfos.length}. Must be 2-8.`);
  }

  const deck = shuffleDeck(generateDeck());

  // Create player objects and deal 7 cards each
  const players: UnoPlayer[] = playerInfos.map((info) => ({
    connectionId: info.connectionId,
    sessionId: info.sessionId,
    name: info.name,
    hand: deck.splice(0, CARDS_PER_PLAYER),
    hasCalledUno: false,
    isDisconnected: false,
  }));

  // Flip the first card for the discard pile.
  // If it's a Wild Draw Four, keep drawing until we get a non-WD4 card (official rule).
  let firstCard = deck.pop()!;
  const discardPile: Card[] = [];

  while (firstCard.value === 'wild4') {
    deck.unshift(firstCard); // put it back at the bottom
    firstCard = deck.pop()!;
  }
  discardPile.push(firstCard);

  // Determine starting color
  let startingColor: CardColor;
  if (firstCard.color === 'wild') {
    // If the first card is a regular Wild, the dealer chooses a color.
    // For simplicity, pick a random color.
    startingColor = COLORS[Math.floor(Math.random() * COLORS.length)];
  } else {
    startingColor = firstCard.color;
  }

  const game: UnoGame = {
    roomId,
    hostId,
    status: 'playing',
    drawPile: deck,
    discardPile,
    currentPlayerIndex: 0,
    direction: 1,
    currentColor: startingColor,
    pendingDrawCount: 0,
    players,
    settings: defaultSettings(),
    turnStartedAt: Date.now(),
    hasDrawnThisTurn: false,
  };

  // Apply the first card's effect (skip, reverse, draw2 can be first cards)
  applyFirstCardEffect(game, firstCard);

  return game;
}

/**
 * If the first flipped card is an action card, apply its effect
 * per official UNO rules.
 */
function applyFirstCardEffect(game: UnoGame, card: Card): void {
  switch (card.value) {
    case 'skip':
      // First player is skipped; play moves to player index 1
      game.currentPlayerIndex = getNextPlayerIndex(game);
      break;
    case 'reverse':
      // Reverse direction; in a 2-player game this acts like a skip
      game.direction = -1;
      if (game.players.length === 2) {
        game.currentPlayerIndex = getNextPlayerIndex(game);
      }
      break;
    case 'draw2':
      // First player draws 2 and loses their turn
      game.pendingDrawCount = 2;
      break;
    case 'wild':
      // Already handled above (random color chosen)
      break;
    default:
      // Number card — no special effect
      break;
  }
}

function defaultSettings(): GameSettings {
  return {
    stackDrawCards: true,   // Stack +2 on +2, +4 on +4, and +4 on +2
    forcePlay: false,       // Official: player chooses whether to play drawn card
    jumpIn: false,          // Official: no jump-in
    drawUntilMatch: false,  // Official: draw one, then pass
  };
}

// =====================================================
// CARD VALIDATION
// =====================================================

/**
 * Checks if a card can be legally played on the current game state.
 *
 * A card is playable if:
 *   - It's a Wild or Wild Draw Four (always playable)
 *   - Its color matches the current active color
 *   - Its value matches the top discard card's value
 *
 * If there's a pending draw penalty (draw2/wild4), the player
 * MUST draw first (no stacking in official rules).
 */
export function isCardPlayable(card: Card, game: UnoGame): boolean {
  // If there's a pending draw, they must draw UNLESS stacking is enabled and they play a valid stacking card
  if (game.pendingDrawCount > 0) {
    if (!game.settings.stackDrawCards) {
      return false;
    }
    // If stacking is enabled, they can play draw2 on draw2, wild4 on wild4, and wild4 on draw2
    const topCard = game.discardPile[game.discardPile.length - 1];
    if (topCard.value === 'draw2') {
      if (card.value === 'draw2' || card.value === 'wild4') return true;
    }
    if (topCard.value === 'wild4' && card.value === 'wild4') return true;
    return false;
  }

  // Wild cards are always playable
  if (card.color === 'wild') {
    return true;
  }

  const topCard = game.discardPile[game.discardPile.length - 1];

  // Color match
  if (card.color === game.currentColor) {
    return true;
  }

  // Value match (e.g., a red 5 on a blue 5)
  if (card.value === topCard.value) {
    return true;
  }

  return false;
}

/**
 * Returns true if the player has at least one playable card.
 */
export function hasPlayableCard(player: UnoPlayer, game: UnoGame): boolean {
  return player.hand.some(card => isCardPlayable(card, game));
}

// =====================================================
// TURN MANAGEMENT
// =====================================================

/**
 * Gets the next player index, respecting direction and wrapping.
 */
function getNextPlayerIndex(game: UnoGame): number {
  const count = game.players.length;
  return ((game.currentPlayerIndex + game.direction) % count + count) % count;
}

/**
 * Advances the turn to the next player.
 * Resets the UNO call flag and updates the turn timer.
 */
function advanceTurn(game: UnoGame): void {
  game.currentPlayerIndex = getNextPlayerIndex(game);
  game.turnStartedAt = Date.now();

  // Do NOT reset UNO call here! The UNO tag must persist across turns
  // as long as the player still has 1 card. It only resets when they draw.
  
  // Reset draw flag
  game.hasDrawnThisTurn = false;
}

/**
 * Skips the next player (used by Skip cards and Draw penalties).
 * Effectively advances the turn twice.
 */
function skipNextPlayer(game: UnoGame): void {
  advanceTurn(game); // skip past the next player
}

// =====================================================
// DRAW PILE MANAGEMENT
// =====================================================

/**
 * Draws a card from the draw pile.
 * If the draw pile is empty, reshuffles the discard pile (except the top card).
 */
function drawOneCard(game: UnoGame): Card | null {
  if (game.drawPile.length === 0) {
    reshuffleDiscardIntoDraw(game);
  }

  if (game.drawPile.length === 0) {
    // Extremely rare: both piles empty (shouldn't happen with 108 cards)
    return null;
  }

  return game.drawPile.pop()!;
}

/**
 * Reshuffles all discard pile cards except the top card back into the draw pile.
 */
function reshuffleDiscardIntoDraw(game: UnoGame): void {
  if (game.discardPile.length <= 1) return; // nothing to reshuffle

  const topCard = game.discardPile[game.discardPile.length - 1];
  const cardsToReshuffle = game.discardPile.slice(0, -1);

  game.drawPile = shuffleDeck(cardsToReshuffle);
  game.discardPile = [topCard];
}

// =====================================================
// WIN DETECTION
// =====================================================

/**
 * Checks if the current player has won (empty hand) and updates game state.
 */
function checkWinCondition(game: UnoGame): GameEvent | null {
  const player = game.players[game.currentPlayerIndex];

  if (player.hand.length === 0) {
    game.status = 'finished';
    game.winner = player.name;
    return { type: 'gameWon', playerName: player.name };
  }

  return null;
}

// =====================================================
// CORE ACTIONS
// =====================================================

/**
 * Plays a card from the current player's hand.
 *
 * Validates:
 *   1. It's the player's turn
 *   2. The card exists in their hand
 *   3. The card is legally playable
 *   4. If wild: a valid color must be chosen
 *
 * Then applies the card's effect and advances the turn.
 */
export function playCard(
  game: UnoGame,
  connectionId: string,
  cardId: string,
  wildColor?: string,
  unoCalled?: boolean,
): ActionResult {
  // Verify it's this player's turn
  const playerIndex = game.players.findIndex(p => p.connectionId === connectionId);
  if (playerIndex === -1) {
    return { success: false, error: 'Player not found in this game.' };
  }
  if (playerIndex !== game.currentPlayerIndex) {
    return { success: false, error: 'Not your turn.' };
  }

  const player = game.players[playerIndex];

  if (unoCalled === true) {
    player.hasCalledUno = true;
  }

  // Find the card in hand
  const cardIndex = player.hand.findIndex(c => c.id === cardId);
  if (cardIndex === -1) {
    return { success: false, error: 'Card not in your hand.' };
  }

  const card = player.hand[cardIndex];

  // Validate the card is playable
  if (!isCardPlayable(card, game)) {
    return { success: false, error: 'This card cannot be played right now.' };
  }

  // Validate wild color selection
  if (card.color === 'wild') {
    if (!wildColor || !COLORS.includes(wildColor as CardColor)) {
      return { success: false, error: 'You must choose a valid color for wild cards.' };
    }
  }

  // --- UNO call check ---
  // If the player is going down to 1 card and hasn't called UNO, they get penalized.
  // (UNO must be called BEFORE playing the second-to-last card)
  const unoEvents: GameEvent[] = [];
  if (player.hand.length === 1 && !player.hasCalledUno) {
    // Player forgot to call UNO! Draw 2 penalty cards.
    for (let i = 0; i < UNO_PENALTY_CARDS; i++) {
      const penaltyCard = drawOneCard(game);
      if (penaltyCard) player.hand.push(penaltyCard);
    }
    if (player.hand.length > 1) player.hasCalledUno = false;
    unoEvents.push({ type: 'unoFailed', playerName: player.name, penaltyCards: UNO_PENALTY_CARDS });
  }

  // Remove card from hand and place on discard pile
  player.hand.splice(cardIndex, 1);
  game.discardPile.push(card);

  // Update active color
  if (card.color === 'wild') {
    game.currentColor = wildColor as CardColor;
  } else {
    game.currentColor = card.color;
  }

  // Check win condition BEFORE applying card effects
  // (effects like skip/reverse change currentPlayerIndex,
  //  which would cause checkWinCondition to check the wrong player)
  const winEvent = checkWinCondition(game);
  if (winEvent) {
    return {
      success: true,
      event: winEvent,
    };
  }

  // Apply card effects
  const effectEvents = applyCardEffect(game, card);

  // Advance turn (if not already advanced by skip/draw effects)
  if (!effectEvents.some(e => e.type === 'turnSkipped' || e.type === 'drawPenalty')) {
    advanceTurn(game);
  }

  game.lastAction = `${player.name} played ${card.color} ${card.value}`;

  return {
    success: true,
    event: { type: 'cardPlayed', playerName: player.name, card, newColor: game.currentColor },
  };
}

/**
 * Applies the effect of a played card.
 */
function applyCardEffect(game: UnoGame, card: Card): GameEvent[] {
  const events: GameEvent[] = [];

  switch (card.value) {
    case 'skip': {
      // Skip the next player
      advanceTurn(game); // move to skipped player
      const skippedPlayer = game.players[game.currentPlayerIndex];
      advanceTurn(game); // move past them
      events.push({ type: 'turnSkipped', playerName: skippedPlayer.name });
      break;
    }

    case 'reverse': {
      game.direction = (game.direction === 1 ? -1 : 1) as 1 | -1;
      events.push({ type: 'directionReversed' });

      // In a 2-player game, reverse acts like a skip
      if (game.players.length === 2) {
        advanceTurn(game); // move past the other player
        advanceTurn(game); // back to current (but advanceTurn resets timer)
        events.push({ type: 'turnSkipped', playerName: game.players[getNextPlayerIndex(game)].name });
      }
      break;
    }

    case 'draw2': {
      game.pendingDrawCount += 2;
      events.push({ type: 'drawPenaltyPending', count: game.pendingDrawCount } as any);
      // Turn will be advanced normally by playCard, passing to the penalized player
      break;
    }

    case 'wild4': {
      game.pendingDrawCount += 4;
      events.push({ type: 'drawPenaltyPending', count: game.pendingDrawCount } as any);
      // Turn will be advanced normally by playCard, passing to the penalized player
      break;
    }

    case 'wild':
      // Color already set by caller — no additional effect
      break;

    default:
      // Number cards — no effect
      break;
  }

  return events;
}

// =====================================================
// DRAW CARD ACTION
// =====================================================

/**
 * Current player draws one card from the draw pile.
 *
 * Official rules:
 *   - If the drawn card is playable, the player MAY play it immediately.
 *   - If not, the turn ends.
 *   - This function draws the card and returns it. The player can then
 *     choose to play it via a separate PLAY_DRAWN_CARD action.
 */
export function drawCard(
  game: UnoGame,
  connectionId: string,
): ActionResult & { drawnCard?: Card; canPlayDrawn?: boolean } {
  const playerIndex = game.players.findIndex(p => p.connectionId === connectionId);
  if (playerIndex === -1) {
    return { success: false, error: 'Player not found in this game.' };
  }
  if (playerIndex !== game.currentPlayerIndex) {
    return { success: false, error: 'Not your turn.' };
  }

  if (game.hasDrawnThisTurn) {
    return { success: false, error: 'You have already drawn a card this turn. Play it or pass.' };
  }

  const player = game.players[playerIndex];

  // If there's a pending draw penalty, the player draws that many cards
  if (game.pendingDrawCount > 0) {
    const count = game.pendingDrawCount;
    game.pendingDrawCount = 0;

    for (let i = 0; i < count; i++) {
      const card = drawOneCard(game);
      if (card) player.hand.push(card);
    }
    if (player.hand.length > 1) player.hasCalledUno = false;

    advanceTurn(game);

    game.lastAction = `${player.name} drew ${count} cards (penalty)`;

    return {
      success: true,
      event: { type: 'drawPenalty', playerName: player.name, count },
    };
  }

  // Check if player had a playable card BEFORE drawing
  const hadPlayableCard = player.hand.some(c => isCardPlayable(c, game));

  // Normal draw: draw exactly 1 card
  const drawnCard = drawOneCard(game);
  if (!drawnCard) {
    return { success: false, error: 'No cards left to draw.' };
  }

  player.hand.push(drawnCard);
  if (player.hand.length > 1) player.hasCalledUno = false;

  // If they didn't have a playable card, check if the NEW drawn card is playable
  const isDrawnPlayable = isCardPlayable(drawnCard, game);
  const canPlayDrawn = !hadPlayableCard && isDrawnPlayable;

  if (!canPlayDrawn) {
    // Turn ends immediately (either they had a playable card already, or the drawn card isn't playable)
    advanceTurn(game);
    game.lastAction = `${player.name} drew a card and passed`;
  } else {
    // They had no playable cards, but drew one! Let them play it.
    game.hasDrawnThisTurn = true;
    game.lastAction = `${player.name} drew a card`;
  }

  return {
    success: true,
    drawnCard,
    canPlayDrawn,
    event: { type: 'cardDrawn', playerName: player.name, count: 1 },
  };
}

/**
 * Plays the card that was just drawn (if it's playable).
 * This is the second step after drawCard() returns canPlayDrawn=true.
 */
export function playDrawnCard(
  game: UnoGame,
  connectionId: string,
  cardId: string,
  wildColor?: string,
  unoCalled?: boolean,
): ActionResult {
  // Same logic as playCard, but we might want to restrict it to only the drawn card.
  // For simplicity, we just defer to playCard.
  return playCard(game, connectionId, cardId, wildColor, unoCalled);
}

/**
 * Player chooses to pass after drawing a playable card.
 * (They drew a card that CAN be played but chose not to.)
 */
export function passAfterDraw(
  game: UnoGame,
  connectionId: string,
): ActionResult {
  const playerIndex = game.players.findIndex(p => p.connectionId === connectionId);
  if (playerIndex === -1) {
    return { success: false, error: 'Player not found in this game.' };
  }
  if (playerIndex !== game.currentPlayerIndex) {
    return { success: false, error: 'Not your turn.' };
  }

  advanceTurn(game);
  const player = game.players[playerIndex];
  game.lastAction = `${player.name} passed`;

  return { success: true };
}

// =====================================================
// UNO CALL
// =====================================================

/**
 * Player calls "UNO!" before playing their second-to-last card.
 * Must be called BEFORE the play action, not after.
 */
export function callUno(
  game: UnoGame,
  connectionId: string,
): ActionResult {
  const player = game.players.find(p => p.connectionId === connectionId);
  if (!player) {
    return { success: false, error: 'Player not found.' };
  }

  // UNO can only be called when you have 2 or fewer cards
  // (you call it when you're ABOUT to go down to 1)
  if (player.hand.length > 2) {
    return { success: false, error: 'You can only call UNO when you have 2 or fewer cards.' };
  }

  player.hasCalledUno = true;
  game.lastAction = `${player.name} called UNO!`;

  return {
    success: true,
    event: { type: 'unoCalled', playerName: player.name },
  };
}

// =====================================================
// UTILITY / QUERY FUNCTIONS
// =====================================================

/**
 * Gets the public game state that's safe to broadcast to all players.
 * Excludes private hand data.
 */
export function getPublicGameState(game: UnoGame) {
  return {
    roomId: game.roomId,
    status: game.status,
    currentPlayerIndex: game.currentPlayerIndex,
    direction: game.direction,
    currentColor: game.currentColor,
    topCard: game.discardPile[game.discardPile.length - 1],
    drawPileCount: game.drawPile.length,
    pendingDrawCount: game.pendingDrawCount,
    winner: game.winner,
    lastAction: game.lastAction,
    turnStartedAt: game.turnStartedAt,
    hasDrawnThisTurn: game.hasDrawnThisTurn,
    settings: game.settings,
    players: game.players.map(p => ({
      name: p.name,
      cardCount: p.hand.length,
      hasCalledUno: p.hasCalledUno,
      isDisconnected: p.isDisconnected,
      sessionId: p.sessionId,
    })),
  };
}

/**
 * Gets the private state for a specific player (their hand).
 */
export function getPrivatePlayerState(game: UnoGame, connectionId: string) {
  const playerIndex = game.players.findIndex(p => p.connectionId === connectionId);
  if (playerIndex === -1) return null;
  const player = game.players[playerIndex];

  return {
    hand: player.hand,
    playableCardIds: game.status === 'playing' && game.currentPlayerIndex === playerIndex
      ? player.hand.filter(c => isCardPlayable(c, game)).map(c => c.id)
      : [],
    hasDrawn: game.hasDrawnThisTurn,
    myPlayerIndex: playerIndex,
  };
}
