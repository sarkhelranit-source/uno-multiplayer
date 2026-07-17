// Win-detection and UNO penalty regression tests
import { initializeGame, playCard, drawCard, callUno } from '../lambdas/gameEngine.js';
import { UnoGame, Card, CardColor } from '../lambdas/types.js';

let passed = 0;
let failed = 0;

function assert(condition: boolean, message: string) {
  if (condition) {
    console.log(`  ✅ ${message}`);
    passed++;
  } else {
    console.error(`  ❌ FAIL: ${message}`);
    failed++;
  }
}

/**
 * Helper: set up a 2-player game in a controlled state.
 * Returns the game with player 0's turn, both players having specified hands.
 */
function setupGame(
  p0Hand: Card[],
  p1Hand: Card[],
  topCard: Card,
  currentColor: CardColor,
): UnoGame {
  return {
    roomId: 'TEST',
    hostId: 'session-0',
    status: 'playing',
    drawPile: [
      // Enough cards for draw penalties
      { color: 'red', value: '1', id: 'draw-1' },
      { color: 'blue', value: '2', id: 'draw-2' },
      { color: 'green', value: '3', id: 'draw-3' },
      { color: 'yellow', value: '4', id: 'draw-4' },
      { color: 'red', value: '5', id: 'draw-5' },
      { color: 'blue', value: '6', id: 'draw-6' },
      { color: 'green', value: '7', id: 'draw-7' },
      { color: 'yellow', value: '8', id: 'draw-8' },
    ],
    discardPile: [topCard],
    currentPlayerIndex: 0,
    direction: 1,
    currentColor,
    pendingDrawCount: 0,
    players: [
      {
        connectionId: 'conn-0',
        sessionId: 'session-0',
        name: 'Alice',
        hand: [...p0Hand],
        hasCalledUno: false,
        isDisconnected: false,
      },
      {
        connectionId: 'conn-1',
        sessionId: 'session-1',
        name: 'Bob',
        hand: [...p1Hand],
        hasCalledUno: false,
        isDisconnected: false,
      },
    ],
    settings: {
      stackDrawCards: true,
      forcePlay: false,
      jumpIn: false,
      drawUntilMatch: false,
    },
    turnStartedAt: Date.now(),
    hasDrawnThisTurn: false,
  };
}

// ================================================================
console.log('\n🃏 Win-Detection Tests');
console.log('================================================================');

// --- Test 1: Normal number card as last card → should win ---
console.log('\nTest 1: Number card as last card');
{
  const lastCard: Card = { color: 'red', value: '5', id: 'last-red-5' };
  const topCard: Card = { color: 'red', value: '3', id: 'top-red-3' };
  const game = setupGame([lastCard], [{ color: 'blue', value: '7', id: 'b7' }], topCard, 'red');
  game.players[0].hasCalledUno = true; // Already called UNO

  const result = playCard(game, 'conn-0', 'last-red-5');
  assert(result.success, 'Play should succeed');
  assert(game.status === 'finished', 'Game should be finished');
  assert(game.winner === 'Alice', 'Alice should be the winner');
  assert(result.event?.type === 'gameWon', 'Event should be gameWon');
}

// --- Test 2: Skip card as last card → should win ---
console.log('\nTest 2: Skip card as last card');
{
  const lastCard: Card = { color: 'red', value: 'skip', id: 'last-red-skip' };
  const topCard: Card = { color: 'red', value: '3', id: 'top-red-3' };
  const game = setupGame([lastCard], [{ color: 'blue', value: '7', id: 'b7' }], topCard, 'red');
  game.players[0].hasCalledUno = true;

  const result = playCard(game, 'conn-0', 'last-red-skip');
  assert(result.success, 'Play should succeed');
  assert(game.status === 'finished', 'Game should be finished');
  assert(game.winner === 'Alice', 'Alice should be the winner');
  assert(result.event?.type === 'gameWon', 'Event should be gameWon');
}

// --- Test 3: Reverse card as last card (2-player) → should win ---
console.log('\nTest 3: Reverse card as last card (2-player game)');
{
  const lastCard: Card = { color: 'blue', value: 'reverse', id: 'last-blue-rev' };
  const topCard: Card = { color: 'blue', value: '3', id: 'top-blue-3' };
  const game = setupGame([lastCard], [{ color: 'red', value: '7', id: 'r7' }], topCard, 'blue');
  game.players[0].hasCalledUno = true;

  const result = playCard(game, 'conn-0', 'last-blue-rev');
  assert(result.success, 'Play should succeed');
  assert(game.status === 'finished', 'Game should be finished');
  assert(game.winner === 'Alice', 'Alice should be the winner');
  assert(result.event?.type === 'gameWon', 'Event should be gameWon');
}

// --- Test 4: Draw2 as last card → should win ---
console.log('\nTest 4: Draw2 as last card');
{
  const lastCard: Card = { color: 'green', value: 'draw2', id: 'last-green-d2' };
  const topCard: Card = { color: 'green', value: '3', id: 'top-green-3' };
  const game = setupGame([lastCard], [{ color: 'red', value: '7', id: 'r7' }], topCard, 'green');
  game.players[0].hasCalledUno = true;

  const result = playCard(game, 'conn-0', 'last-green-d2');
  assert(result.success, 'Play should succeed');
  assert(game.status === 'finished', 'Game should be finished');
  assert(game.winner === 'Alice', 'Alice should be the winner');
  assert(result.event?.type === 'gameWon', 'Event should be gameWon');
}

// --- Test 5: Wild4 as last card → should win ---
console.log('\nTest 5: Wild4 as last card');
{
  const lastCard: Card = { color: 'wild', value: 'wild4', id: 'last-wild4' };
  const topCard: Card = { color: 'yellow', value: '3', id: 'top-yellow-3' };
  const game = setupGame([lastCard], [{ color: 'red', value: '7', id: 'r7' }], topCard, 'yellow');
  game.players[0].hasCalledUno = true;

  const result = playCard(game, 'conn-0', 'last-wild4', 'red');
  assert(result.success, 'Play should succeed');
  assert(game.status === 'finished', 'Game should be finished');
  assert(game.winner === 'Alice', 'Alice should be the winner');
  assert(result.event?.type === 'gameWon', 'Event should be gameWon');
}

// --- Test 6: Wild as last card → should win ---
console.log('\nTest 6: Wild as last card');
{
  const lastCard: Card = { color: 'wild', value: 'wild', id: 'last-wild' };
  const topCard: Card = { color: 'yellow', value: '3', id: 'top-yellow-3' };
  const game = setupGame([lastCard], [{ color: 'red', value: '7', id: 'r7' }], topCard, 'yellow');
  game.players[0].hasCalledUno = true;

  const result = playCard(game, 'conn-0', 'last-wild', 'blue');
  assert(result.success, 'Play should succeed');
  assert(game.status === 'finished', 'Game should be finished');
  assert(game.winner === 'Alice', 'Alice should be the winner');
  assert(result.event?.type === 'gameWon', 'Event should be gameWon');
}

// ================================================================
console.log('\n\n🃏 UNO Penalty Timing Tests');
console.log('================================================================');

// --- Test 7: UNO penalty triggers when playing last card (1→0) without UNO call ---
console.log('\nTest 7: No UNO call when playing last card (1→0) → penalty, no win');
{
  const lastCard: Card = { color: 'red', value: '5', id: 'card-r5' };
  const topCard: Card = { color: 'red', value: '3', id: 'top-red-3' };
  const game = setupGame([lastCard], [{ color: 'green', value: '7', id: 'g7' }], topCard, 'red');
  // Player has NOT called UNO

  const result = playCard(game, 'conn-0', 'card-r5');
  assert(result.success, 'Play should succeed');
  // Player should have been penalized: had 1, +2 penalty = 3, -1 played = 2
  assert(game.players[0].hand.length === 2, `Hand should be 2 after penalty (got ${game.players[0].hand.length})`);
  assert(game.status === 'playing', 'Game should still be playing (penalty prevented win)');
}

// --- Test 8: UNO called with 1 card, then plays last card → wins ---
console.log('\nTest 8: UNO called with 1 card, plays last card → wins');
{
  const lastCard: Card = { color: 'red', value: '5', id: 'last-r5' };
  const topCard: Card = { color: 'red', value: '3', id: 'top-red-3' };
  const game = setupGame([lastCard], [{ color: 'blue', value: '7', id: 'b7' }], topCard, 'red');
  game.players[0].hasCalledUno = true; // Player called UNO when they had 1 card

  const result = playCard(game, 'conn-0', 'last-r5');
  assert(result.success, 'Play should succeed');
  assert(game.players[0].hand.length === 0, 'Hand should be empty');
  assert(game.status === 'finished', 'Game should be finished');
  assert(game.winner === 'Alice', 'Alice should win');
}

// --- Test 9: UNO called via play action (unoCalled flag) → no penalty, wins ---
console.log('\nTest 9: UNO called with play action on last card → no penalty, wins');
{
  const lastCard: Card = { color: 'red', value: '5', id: 'card-r5' };
  const topCard: Card = { color: 'red', value: '3', id: 'top-red-3' };
  const game = setupGame([lastCard], [{ color: 'green', value: '7', id: 'g7' }], topCard, 'red');
  // Player has NOT called UNO yet, but will send unoCalled=true with play action

  const result = playCard(game, 'conn-0', 'card-r5', undefined, true);
  assert(result.success, 'Play should succeed');
  assert(game.players[0].hand.length === 0, `Hand should be 0 (got ${game.players[0].hand.length})`);
  assert(game.status === 'finished', 'Game should be finished');
  assert(game.winner === 'Alice', 'Alice should win');
}

// ================================================================
// Summary
// ================================================================
console.log('\n================================================================');
console.log(`Results: ${passed} passed, ${failed} failed out of ${passed + failed} assertions`);
if (failed > 0) {
  console.log('❌ SOME TESTS FAILED');
  process.exit(1);
} else {
  console.log('🎉 ALL TESTS PASSED!');
}
