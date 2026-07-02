import { useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import PlayerHand from '../components/PlayerHand';
import OpponentRow from '../components/OpponentRow';
import ColorPicker from '../components/ColorPicker';
import UnoCard from '../components/UnoCard';
import './GamePage.css';

interface Card {
  color: 'red' | 'blue' | 'green' | 'yellow' | 'wild';
  value: string;
  id: string;
}

// Mock data for visual development
const MOCK_HAND: Card[] = [
  { color: 'red', value: '3', id: 'r3' },
  { color: 'red', value: '7', id: 'r7' },
  { color: 'blue', value: '5', id: 'b5' },
  { color: 'blue', value: 'skip', id: 'bs' },
  { color: 'green', value: '2', id: 'g2' },
  { color: 'yellow', value: '9', id: 'y9' },
  { color: 'wild', value: 'wild', id: 'w1' },
];

const MOCK_DISCARD: Card = { color: 'red', value: '5', id: 'discard1' };

const MOCK_OPPONENTS = [
  { name: 'Alice', cardCount: 5, hasCalledUno: false, isDisconnected: false, isCurrentTurn: false },
  { name: 'Bob', cardCount: 2, hasCalledUno: true, isDisconnected: false, isCurrentTurn: false },
  { name: 'Charlie', cardCount: 8, hasCalledUno: false, isDisconnected: true, isCurrentTurn: false },
];

export default function GamePage() {
  const [hand, setHand] = useState<Card[]>(MOCK_HAND);
  const [discardTop, setDiscardTop] = useState<Card>(MOCK_DISCARD);
  const [currentColor, setCurrentColor] = useState<string>('red');
  const [isMyTurn, setIsMyTurn] = useState(true);
  const [showColorPicker, setShowColorPicker] = useState(false);
  const [pendingWildCardId, setPendingWildCardId] = useState<string | null>(null);
  const [direction, setDirection] = useState<1 | -1>(1);
  const [drawPileCount, setDrawPileCount] = useState(42);

  const handlePlayCard = useCallback((cardId: string) => {
    const card = hand.find(c => c.id === cardId);
    if (!card) return;

    // If it's a wild card, show color picker first
    if (card.color === 'wild') {
      setPendingWildCardId(cardId);
      setShowColorPicker(true);
      return;
    }

    // Remove from hand and update discard
    setHand(prev => prev.filter(c => c.id !== cardId));
    setDiscardTop(card);
    setCurrentColor(card.color);
    // TODO: send PLAY_CARD action via WebSocket
  }, [hand]);

  const handleColorSelected = useCallback((color: string) => {
    if (!pendingWildCardId) return;
    const card = hand.find(c => c.id === pendingWildCardId);
    if (!card) return;

    setHand(prev => prev.filter(c => c.id !== pendingWildCardId));
    setDiscardTop(card);
    setCurrentColor(color);
    setShowColorPicker(false);
    setPendingWildCardId(null);
    // TODO: send PLAY_CARD with wildColor via WebSocket
  }, [hand, pendingWildCardId]);

  const handleDrawCard = useCallback(() => {
    // Mock: add a random card
    const colors: Card['color'][] = ['red', 'blue', 'green', 'yellow'];
    const values = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9'];
    const newCard: Card = {
      color: colors[Math.floor(Math.random() * colors.length)],
      value: values[Math.floor(Math.random() * values.length)],
      id: `drawn-${Date.now()}`,
    };
    setHand(prev => [...prev, newCard]);
    setDrawPileCount(prev => prev - 1);
    // TODO: send DRAW_CARD via WebSocket
  }, []);

  const handleCallUno = useCallback(() => {
    // TODO: send CALL_UNO via WebSocket
  }, []);

  const COLOR_INDICATOR_MAP: Record<string, string> = {
    red: 'var(--uno-red)',
    blue: 'var(--uno-blue)',
    green: 'var(--uno-green)',
    yellow: 'var(--uno-yellow)',
  };

  return (
    <div className="game-page">
      {/* Top bar */}
      <div className="game-topbar glass">
        <div className="topbar-left">
          <span className="topbar-logo">UNO</span>
        </div>
        <div className="topbar-center">
          <div
            className="direction-indicator"
            title={direction === 1 ? 'Clockwise' : 'Counter-clockwise'}
          >
            <motion.span
              className="direction-arrow"
              animate={{ rotate: direction === 1 ? 0 : 180 }}
              transition={{ type: 'spring', stiffness: 300 }}
            >
              ⟳
            </motion.span>
          </div>
          <div
            className="current-color-indicator"
            style={{ background: COLOR_INDICATOR_MAP[currentColor] || 'var(--accent-primary)' }}
          />
        </div>
        <div className="topbar-right">
          <span className="turn-label">
            {isMyTurn ? '🔥 Your Turn' : "⏳ Waiting..."}
          </span>
        </div>
      </div>

      {/* Opponents */}
      <OpponentRow opponents={MOCK_OPPONENTS} />

      {/* Game Table Center */}
      <div className="game-table-center">
        {/* Draw Pile */}
        <motion.div
          className="draw-pile"
          onClick={isMyTurn ? handleDrawCard : undefined}
          whileHover={isMyTurn ? { scale: 1.05 } : {}}
          whileTap={isMyTurn ? { scale: 0.95 } : {}}
        >
          <UnoCard color="red" value="" faceDown playable={false} />
          <span className="pile-count">{drawPileCount}</span>
          {isMyTurn && <span className="draw-hint">Draw</span>}
        </motion.div>

        {/* Discard Pile */}
        <div className="discard-pile">
          <AnimatePresence mode="popLayout">
            <motion.div
              key={discardTop.id}
              initial={{ scale: 0.5, rotate: -20, opacity: 0 }}
              animate={{ scale: 1, rotate: 0, opacity: 1 }}
              transition={{ type: 'spring', stiffness: 400, damping: 25 }}
            >
              <UnoCard
                color={discardTop.color}
                value={discardTop.value}
                playable={false}
              />
            </motion.div>
          </AnimatePresence>
        </div>
      </div>

      {/* UNO Call Button */}
      {hand.length <= 2 && (
        <motion.div
          className="uno-call-area"
          initial={{ scale: 0, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ type: 'spring', stiffness: 400 }}
        >
          <button
            id="call-uno-btn"
            className="btn btn-uno-red btn-lg uno-call-btn"
            onClick={handleCallUno}
          >
            UNO!
          </button>
        </motion.div>
      )}

      {/* Player's Hand */}
      <div className="my-hand-area">
        <PlayerHand
          cards={hand}
          currentColor={currentColor}
          topCard={discardTop}
          isMyTurn={isMyTurn}
          onPlayCard={handlePlayCard}
        />
      </div>

      {/* Color Picker Modal */}
      <ColorPicker
        isOpen={showColorPicker}
        onSelect={handleColorSelected}
      />
    </div>
  );
}
