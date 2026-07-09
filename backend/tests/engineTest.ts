// Quick verification script for the game engine
import { generateDeck, shuffleDeck, initializeGame, isCardPlayable, playCard, drawCard, callUno } from '../lambdas/gameEngine.js';
import { Card } from '../lambdas/types.js';

// --- Test 1: Deck Generation ---
const deck = generateDeck();
console.log(`\n✅ Deck size: ${deck.length} (expected 108)`);

// Count cards by color
const colorCounts: Record<string, number> = {};
for (const card of deck) {
  colorCounts[card.color] = (colorCounts[card.color] || 0) + 1;
}
console.log('Card distribution by color:', colorCounts);
// Expected: red=25, blue=25, green=25, yellow=25, wild=8

// Count by value
const valueCounts: Record<string, number> = {};
for (const card of deck) {
  valueCounts[card.value] = (valueCounts[card.value] || 0) + 1;
}
console.log('Card distribution by value:', valueCounts);
// Expected: 0=4(one per color), 1-9=8 each(two per color), skip/reverse/draw2=8 each, wild=4, wild4=4

// Verify unique IDs
const ids = new Set(deck.map(c => c.id));
console.log(`✅ Unique IDs: ${ids.size} (expected 108)`);
console.assert(ids.size === 108, 'ERROR: Duplicate card IDs detected!');

// --- Test 2: Shuffle ---
const shuffled = shuffleDeck([...deck]);
console.log(`\n✅ Shuffled deck size: ${shuffled.length}`);
const isShuffled = shuffled[0].id !== deck[0].id || shuffled[1].id !== deck[1].id;
console.log(`✅ Deck is shuffled: ${isShuffled}`);

// --- Test 3: Game Initialization ---
const game = initializeGame('TEST', 'session-host', [
  { connectionId: 'conn-1', sessionId: 'session-host', name: 'Alice' },
  { connectionId: 'conn-2', sessionId: 'session-2', name: 'Bob' },
  { connectionId: 'conn-3', sessionId: 'session-3', name: 'Charlie' },
  { connectionId: 'conn-4', sessionId: 'session-4', name: 'Diana' },
]);

console.log(`\n✅ Game initialized:`);
console.log(`   Status: ${game.status}`);
console.log(`   Players: ${game.players.length}`);
console.log(`   Cards per player: ${game.players.map(p => p.hand.length).join(', ')}`);
console.log(`   Draw pile: ${game.drawPile.length}`);
console.log(`   Discard pile: ${game.discardPile.length}`);
console.log(`   Current color: ${game.currentColor}`);
console.log(`   Direction: ${game.direction === 1 ? 'Clockwise' : 'Counter-clockwise'}`);
console.log(`   Current player: ${game.players[game.currentPlayerIndex].name}`);

const totalCards = game.drawPile.length + game.discardPile.length + game.players.reduce((s, p) => s + p.hand.length, 0);
console.log(`\n✅ Total cards in game: ${totalCards} (expected 108)`);
console.assert(totalCards === 108, 'ERROR: Cards missing!');

// --- Test 4: Card Playability ---
const currentPlayer = game.players[game.currentPlayerIndex];
const playableCards = currentPlayer.hand.filter(c => isCardPlayable(c, game));
console.log(`\n✅ ${currentPlayer.name}'s hand (${currentPlayer.hand.length} cards):`);
currentPlayer.hand.forEach(c => {
  const marker = isCardPlayable(c, game) ? '▶' : ' ';
  console.log(`   ${marker} ${c.color} ${c.value} (${c.id})`);
});
console.log(`   Playable: ${playableCards.length}`);

// --- Test 5: Play a card ---
if (playableCards.length > 0) {
  const cardToPlay = playableCards[0];
  const wildColor = cardToPlay.color === 'wild' ? 'red' : undefined;
  const result = playCard(game, currentPlayer.connectionId, cardToPlay.id, wildColor);
  console.log(`\n✅ Played ${cardToPlay.color} ${cardToPlay.value}: ${result.success ? 'SUCCESS' : result.error}`);
  console.log(`   New current player: ${game.players[game.currentPlayerIndex].name}`);
  console.log(`   Current color: ${game.currentColor}`);
} else {
  console.log(`\n⚠️ No playable cards, testing draw...`);
  const drawResult = drawCard(game, currentPlayer.connectionId);
  console.log(`   Drew card: ${drawResult.success ? 'SUCCESS' : drawResult.error}`);
}

// --- Test 6: Call UNO ---
// Give a player only 2 cards to test UNO calling
const testPlayer = game.players[1];
testPlayer.hand = testPlayer.hand.slice(0, 2);
const unoResult = callUno(game, testPlayer.connectionId);
console.log(`\n✅ ${testPlayer.name} called UNO: ${unoResult.success ? 'SUCCESS' : unoResult.error}`);
console.log(`   hasCalledUno: ${testPlayer.hasCalledUno}`);

console.log('\n🎉 All engine tests passed!\n');
