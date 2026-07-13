import { useState, useCallback, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate, useLocation } from 'react-router-dom';
import PlayerHand from '../components/PlayerHand';
import OpponentRow from '../components/OpponentRow';
import ColorPicker from '../components/ColorPicker';
import UnoCard from '../components/UnoCard';
import { wsService } from '../services/WebSocketService';
import type { WsMessage, PublicGameState, PrivateGameState } from '../types/game';
import './GamePage.css';

export default function GamePage() {
  const navigate = useNavigate();
  const location = useLocation();

  // Core Game State
  const [publicState, setPublicState] = useState<PublicGameState | null>(location.state?.publicState || null);
  const [privateState, setPrivateState] = useState<PrivateGameState | null>(location.state?.privateState || null);

  // UI State
  const [isReconnecting, setIsReconnecting] = useState(!wsService.isConnected());
  const [showColorPicker, setShowColorPicker] = useState(false);
  const [pendingWildCardId, setPendingWildCardId] = useState<string | null>(null);
  const [localUnoCalled, setLocalUnoCalled] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  
  // UNO Animation states
  const [showUnoCelebration, setShowUnoCelebration] = useState(false);
  const [unoWarningMessage, setUnoWarningMessage] = useState<string | null>(null);

  useEffect(() => {
    if (publicState?.lastAction) {
      const actionStr = publicState.lastAction;
      
      // Check if it's an UNO call action
      if (actionStr.includes('called UNO!')) {
        // Is it the local player?
        const myPlayerName = publicState.players[privateState?.myPlayerIndex || 0]?.name;
        if (actionStr.startsWith(myPlayerName)) {
          setShowUnoCelebration(true);
          setTimeout(() => setShowUnoCelebration(false), 3000);
        } else {
          setUnoWarningMessage(actionStr);
          setTimeout(() => setUnoWarningMessage(null), 3000);
        }
      } else {
        // Standard action toast
        setToastMessage(actionStr);
        const timer = setTimeout(() => {
          setToastMessage(null);
        }, 3500);
        return () => clearTimeout(timer);
      }
    }
  }, [publicState?.lastAction, publicState?.players, privateState?.myPlayerIndex]);

  useEffect(() => {
    // Always ensure connection on mount.
    // In SPA navigation, it's already connected. On reload, this reconnects.
    const savedRoomId = sessionStorage.getItem('uno_room_id');
    if (savedRoomId) {
      wsService.connect(savedRoomId).catch(() => {
        sessionStorage.removeItem('uno_room_id');
        navigate('/');
      });
    } else {
      // No saved room, go home
      navigate('/');
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Run only on mount

  useEffect(() => {
    const unsubscribe = wsService.subscribe((msg: WsMessage) => {
      switch (msg.type) {
        case 'gameStateUpdate':
          setPublicState(msg.publicState);
          setPrivateState(msg.privateState);
          setIsReconnecting(false);
          break;
        case 'playerDisconnected':
          setPublicState(prev => {
            if (!prev) return prev;
            return {
              ...prev,
              players: prev.players.map(p =>
                p.name === msg.playerName ? { ...p, isDisconnected: true } : p
              ),
              lastAction: `${msg.playerName} disconnected.`
            };
          });
          break;
        case 'leftRoom':
          sessionStorage.removeItem('uno_room_id');
          navigate('/');
          break;
        case 'error':
          // If reconnection failed (room gone, player not found), go home
          if (!publicState) {
            sessionStorage.removeItem('uno_room_id');
            navigate('/');
          } else {
            // Show error as a toast if game is active (e.g. backend rejected a card play)
            setToastMessage(msg.message);
            setTimeout(() => setToastMessage(null), 3000);
          }
          break;
      }
    });

    return () => unsubscribe();
  }, [navigate, publicState]);

  const handlePlayCard = useCallback((cardId: string) => {
    if (!privateState || !publicState) return;

    const card = privateState.hand.find(c => c.id === cardId);
    if (!card) return;

    // Check if playable
    if (!privateState.playableCardIds.includes(cardId)) {
      return;
    }

    // If it's a wild card, show color picker first
    if (card.color === 'wild') {
      setPendingWildCardId(cardId);
      setShowColorPicker(true);
      return;
    }

    wsService.sendAction('PLAY_CARD', { cardId, unoCalled: localUnoCalled });
    if (localUnoCalled) setLocalUnoCalled(false);
  }, [privateState, publicState, localUnoCalled]);

  const handleColorSelected = useCallback((color: string) => {
    if (!pendingWildCardId) return;

    wsService.sendAction('PLAY_CARD', {
      cardId: pendingWildCardId,
      wildColor: color,
      unoCalled: localUnoCalled
    });

    setShowColorPicker(false);
    setPendingWildCardId(null);
    if (localUnoCalled) setLocalUnoCalled(false);
  }, [pendingWildCardId, localUnoCalled]);

  const handleDrawCard = useCallback(() => {
    wsService.sendAction('DRAW_CARD');
  }, []);

  const handleCallUno = useCallback(() => {
    setLocalUnoCalled(true);
    wsService.sendAction('CALL_UNO');
  }, []);

  const COLOR_INDICATOR_MAP: Record<string, string> = {
    red: 'var(--uno-red)',
    blue: 'var(--uno-blue)',
    green: 'var(--uno-green)',
    yellow: 'var(--uno-yellow)',
    wild: 'var(--accent-primary)',
  };

  if (!publicState || !privateState || isReconnecting) {
    return (
      <div className="game-page" style={{ justifyContent: 'center', alignItems: 'center' }}>
        <h2 style={{ color: 'white' }}>
          {isReconnecting ? 'Reconnecting to game...' : 'Loading game state...'}
        </h2>
      </div>
    );
  }

  // Use the authoritative player index from the backend's private state.
  // The backend knows exactly which player we are (by connectionId),
  // so this is always correct regardless of session/connection lifecycle.
  const myPlayerIndex = privateState.myPlayerIndex;

  // Only show OTHER players in the top row
  const opponents = publicState.players
    .filter((_, index) => index !== myPlayerIndex)
    .map((p) => {
      const actualIndex = publicState.players.indexOf(p);
      return {
        name: p.name,
        cardCount: p.cardCount || 0,
        hasCalledUno: !!p.hasCalledUno,
        isDisconnected: !!p.isDisconnected,
        isCurrentTurn: actualIndex === publicState.currentPlayerIndex,
      };
    });

  // Check if it's OUR turn
  const amICurrentPlayer = myPlayerIndex === publicState.currentPlayerIndex;

  return (
    <div className="game-page">
      {/* Top bar */}
      <div className="game-topbar glass">
        <div className="topbar-left" style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <button
            className="btn btn-danger btn-sm"
            onClick={() => {
              if (window.confirm('Are you sure you want to leave the game?')) {
                sessionStorage.removeItem('uno_room_id');
                wsService.sendAction('LEAVE_ROOM');
              }
            }}
          >
            🚪 Leave
          </button>
          <span className="topbar-logo">UNO</span>
        </div>
        <div className="topbar-center">
          <div
            className="direction-indicator"
            title={publicState.direction === 1 ? 'Clockwise' : 'Counter-clockwise'}
          >
            <motion.span
              className="direction-arrow"
              animate={{ rotate: publicState.direction === 1 ? 0 : 180 }}
              transition={{ type: 'spring', stiffness: 300 }}
            >
              ⟳
            </motion.span>
          </div>
          <div
            className="current-color-indicator"
            style={{ background: COLOR_INDICATOR_MAP[publicState.currentColor] || 'var(--accent-primary)' }}
          />
        </div>
        <div className="topbar-right">
          <span className="turn-label">
            {amICurrentPlayer ? '🔥 Your Turn' : "⏳ Waiting..."}
          </span>
        </div>
      </div>

      {/* UNO Celebration / Warning Overlays */}
      <AnimatePresence>
        {showUnoCelebration && (
          <motion.div
            className="uno-celebration-overlay"
            initial={{ x: '-50%', y: '-50%', scale: 0, opacity: 0, rotate: -20 }}
            animate={{ x: '-50%', y: '-50%', scale: 1, opacity: 1, rotate: 0 }}
            exit={{ x: '-50%', y: '-50%', scale: 1.5, opacity: 0 }}
          >
            🎉 UNO! 🎉
          </motion.div>
        )}
        {unoWarningMessage && (
          <motion.div
            className="uno-warning-overlay"
            initial={{ x: '-50%', y: '-100px', opacity: 0 }}
            animate={{ x: '-50%', y: 0, opacity: 1 }}
            exit={{ x: '-50%', y: '-100px', opacity: 0 }}
          >
            ⚠️ {unoWarningMessage}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Action Toast */}
      <AnimatePresence>
        {toastMessage && (
          <motion.div
            className="action-toast"
            initial={{ x: '-50%', y: '-50%', opacity: 0 }}
            animate={{ x: '-50%', y: '-50%', opacity: 1 }}
            exit={{ x: '-50%', y: '-50%', opacity: 0 }}
            style={{
              position: 'fixed',
              top: '50%',
              left: '50%',
              transform: 'translate(-50%, -50%)',
              background: 'rgba(0, 0, 0, 0.75)',
              color: 'white',
              padding: '12px 24px',
              borderRadius: '24px',
              zIndex: 1000,
              fontWeight: 'bold',
              boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
              border: '1px solid rgba(255,255,255,0.1)',
              textAlign: 'center',
              whiteSpace: 'normal',
              wordWrap: 'break-word',
              maxWidth: '90vw'
            }}
          >
            {toastMessage}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Opponents */}
      <OpponentRow opponents={opponents} />

      {/* Game Table Center */}
      <div className="game-table-center">
        {/* Draw Pile */}
        <motion.div
          className="draw-pile"
          onClick={amICurrentPlayer && !privateState.hasDrawn ? handleDrawCard : undefined}
          whileHover={amICurrentPlayer && !privateState.hasDrawn ? { scale: 1.05 } : {}}
          whileTap={amICurrentPlayer && !privateState.hasDrawn ? { scale: 0.95 } : {}}
          style={{ opacity: privateState.hasDrawn ? 0.5 : 1 }}
        >
          <UnoCard color="red" value="" faceDown playable={false} />
          <span className="pile-count">{publicState.drawPileCount}</span>
          {amICurrentPlayer && !privateState.hasDrawn && <span className="draw-hint">Draw</span>}
        </motion.div>

        {amICurrentPlayer && privateState.hasDrawn && (
          <button
            className="btn btn-secondary"
            style={{ position: 'absolute', bottom: '-60px' }}
            onClick={() => wsService.sendAction('PASS_AFTER_DRAW')}
          >
            Pass Turn
          </button>
        )}

        {/* Discard Pile */}
        <div className="discard-pile">
          <AnimatePresence mode="popLayout">
            <motion.div
              key={publicState.topCard.id}
              initial={{ scale: 0.5, rotate: -20, opacity: 0 }}
              animate={{ scale: 1, rotate: 0, opacity: 1 }}
              transition={{ type: 'spring', stiffness: 400, damping: 25 }}
            >
              <UnoCard
                color={publicState.topCard.color}
                value={publicState.topCard.value}
                playable={false}
              />
            </motion.div>
          </AnimatePresence>
        </div>
      </div>

      {/* UNO Call Button */}
      {privateState.hand.length === 1 && (
        <motion.div
          className="uno-call-area"
          initial={{ scale: 0, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ type: 'spring', stiffness: 400 }}
        >
          <motion.button
            id="call-uno-btn"
            className="btn btn-uno-red btn-lg uno-call-btn"
            onClick={handleCallUno}
            whileTap={{ scale: 0.9 }}
          >
            UNO!
          </motion.button>
        </motion.div>
      )}

      {/* Player's Hand */}
      <div className="my-hand-area">
        <PlayerHand
          cards={privateState.hand}
          isMyTurn={!!amICurrentPlayer}
          playableCardIds={privateState.playableCardIds}
          onPlayCard={handlePlayCard}
        />
      </div>

      {/* Color Picker Modal */}
      <ColorPicker
        isOpen={showColorPicker}
        onSelect={handleColorSelected}
      />

      {/* Winner Overlay */}
      {publicState.status === 'finished' && (
        <div className="winner-overlay" style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.8)', zIndex: 2000,
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center'
        }}>
          <h1 style={{ fontSize: '4rem', color: 'var(--uno-yellow)' }}>Game Over!</h1>
          <h2 style={{ color: 'white', marginTop: '1rem' }}>{publicState.winner} won the game!</h2>
          <button className="btn btn-primary btn-lg" style={{ marginTop: '2rem' }} onClick={() => {
              sessionStorage.removeItem('uno_room_id');
              wsService.disconnect();
              navigate('/');
            }}>
            Back to Home
          </button>
        </div>
      )}
    </div>
  );
}
