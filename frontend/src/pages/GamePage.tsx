import { useState, useCallback, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate, useLocation } from 'react-router-dom';
import PlayerHand from '../components/PlayerHand';
import OpponentRow from '../components/OpponentRow';
import ColorPicker from '../components/ColorPicker';
import UnoCard from '../components/UnoCard';
import EmojiReactionTray from '../components/EmojiReactionTray';
import FloatingReaction from '../components/FloatingReaction';
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
  const [timeLeftMs, setTimeLeftMs] = useState<number>(30_000);
  const [kickoutReason, setKickoutReason] = useState<string | null>(null);
  const [showLeaveConfirm, setShowLeaveConfirm] = useState(false);
  const [isProcessingMove, setIsProcessingMove] = useState(false);

  // UNO Animation states
  const [showUnoCelebration, setShowUnoCelebration] = useState(false);
  const [unoWarningMessage, setUnoWarningMessage] = useState<string | null>(null);

  // Color splash states
  const [splashColor, setSplashColor] = useState<string | null>(null);
  const previousTopCardIdRef = useRef<string | null>(null);

  // Victory state
  const [victoryPhase, setVictoryPhase] = useState<'none' | 'pulse' | 'confetti' | 'celebration'>('none');
  const [wantsToReturn, setWantsToReturn] = useState(false);
  const wantsToReturnRef = useRef(wantsToReturn);

  useEffect(() => {
    wantsToReturnRef.current = wantsToReturn;
  }, [wantsToReturn]);

  // Emoji Reactions
  const [activeReactions, setActiveReactions] = useState<Array<{ id: string; emoji: string; playerName: string }>>([]);

  const handleReactionComplete = useCallback((id: string) => {
    setActiveReactions(prev => prev.filter(r => r.id !== id));
  }, []);

  // Orchestrate victory animation
  useEffect(() => {
    if (publicState?.status === 'finished') {
      const t1 = setTimeout(() => setVictoryPhase('pulse'), 500);
      const t2 = setTimeout(() => setVictoryPhase('confetti'), 900);
      const t3 = setTimeout(() => setVictoryPhase('celebration'), 1800);
      return () => {
        clearTimeout(t1);
        clearTimeout(t2);
        clearTimeout(t3);
      };
    } else {
      setVictoryPhase('none');
    }
  }, [publicState?.status]);


  useEffect(() => {
    if (publicState?.lastAction) {
      const actionStr = publicState.lastAction;

      // Check if it's an UNO call action
      if (actionStr.includes('called UNO!')) {
        setToastMessage(null);
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
        // Standard action toast — show "You" instead of the local player's name
        const myPlayerName = publicState.players[privateState?.myPlayerIndex || 0]?.name;
        const displayAction = myPlayerName && actionStr.startsWith(myPlayerName)
          ? actionStr.replace(myPlayerName, 'You')
          : actionStr;
        setToastMessage(displayAction);
        const timer = setTimeout(() => {
          setToastMessage(null);
        }, 3500);
        return () => clearTimeout(timer);
      }
    }
  }, [publicState?.lastAction, publicState?.players, privateState?.myPlayerIndex]);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    if (publicState?.topCard && publicState?.currentColor) {
      if (
        previousTopCardIdRef.current &&
        previousTopCardIdRef.current !== publicState.topCard.id &&
        publicState.topCard.color === 'wild'
      ) {
        setSplashColor(publicState.currentColor);
        timer = setTimeout(() => {
          setSplashColor(null);
        }, 2000);
      }
      previousTopCardIdRef.current = publicState.topCard.id;
    }
    return () => {
      if (timer) clearTimeout(timer);
    };
  }, [publicState?.topCard, publicState?.currentColor]);

  // Turn Timer Countdown
  useEffect(() => {
    if (privateState?.hand.length !== 1) {
      setLocalUnoCalled(false);
    }
  }, [privateState?.hand.length]);

  useEffect(() => {
    if (publicState?.status !== 'playing' || !publicState.turnStartedAt) {
      return;
    }

    const updateTimer = () => {
      const elapsed = Date.now() - publicState.turnStartedAt!;
      const remaining = Math.max(0, 30_000 - elapsed);
      setTimeLeftMs(remaining);

      // If timer hits 0, the current player sends TIMEOUT.
      // If the current player's browser is closed/dead, they won't send it.
      // To prevent the game from getting stuck, OTHER players will also send the TIMEOUT action
      // as a fallback if the timer goes 2 seconds past 0.
      if (remaining === 0) {
        const isCurrentPlayer = privateState?.myPlayerIndex === publicState.currentPlayerIndex;
        if (isCurrentPlayer) {
          wsService.sendAction('TIMEOUT');
        } else if (elapsed >= 32_000) {
          wsService.sendAction('TIMEOUT');
        }
      }
    };

    updateTimer(); // Call immediately
    const intervalId = setInterval(updateTimer, 1000);

    return () => clearInterval(intervalId);
  }, [publicState?.status, publicState?.turnStartedAt, publicState?.currentPlayerIndex, privateState?.myPlayerIndex]);

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
    // Intercept back button to show leave confirmation instead of unloading the game
    window.history.pushState(null, '', window.location.href);

    const handlePopState = () => {
      // Re-push the state to prevent actually navigating back
      window.history.pushState(null, '', window.location.href);
      setShowLeaveConfirm(true);
    };

    window.addEventListener('popstate', handlePopState);
    return () => {
      window.removeEventListener('popstate', handlePopState);
    };
  }, []);


  useEffect(() => {
    const unsubscribe = wsService.subscribe((msg: WsMessage) => {
      switch (msg.type) {
        case 'gameStateUpdate':
          setPublicState(msg.publicState);
          setPrivateState(msg.privateState);
          setIsReconnecting(false);
          setIsProcessingMove(false);
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
          if (msg.reason) {
            setKickoutReason(msg.reason);
            wsService.disconnect();
          } else {
            navigate('/');
          }
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
            setIsProcessingMove(false);
          }
          break;
        case 'reconnecting':
          setIsReconnecting(true);
          break;
        case 'reconnected':
          setIsReconnecting(false);
          break;
        case 'lobbyUpdate':
          if (wantsToReturnRef.current) {
            navigate('/lobby', { state: { roomId: msg.roomId, players: msg.players } });
          } else {
            setPublicState(prev => prev ? { ...prev, status: 'waiting' } : prev);
          }
          break;
        case 'reaction':
          console.log('[REACTION RECEIVED]', msg);
          setActiveReactions(prev => [
            ...prev,
            { id: Date.now().toString() + Math.random(), emoji: msg.emoji, playerName: msg.playerName }
          ]);
          // Debug: also show as toast so we can tell if the message arrived
          setToastMessage(`${msg.playerName} reacted: ${msg.emoji}`);
          setTimeout(() => setToastMessage(null), 3000);
          break;
      }
    });

    return () => unsubscribe();
  }, [navigate, publicState]);

  const handlePlayCard = useCallback((cardId: string) => {
    if (!privateState || !publicState || isProcessingMove) return;

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

    setIsProcessingMove(true);
    wsService.sendAction('PLAY_CARD', { cardId, unoCalled: localUnoCalled });
    if (localUnoCalled) setLocalUnoCalled(false);
  }, [privateState, publicState, localUnoCalled, isProcessingMove]);

  const handleColorSelected = useCallback((color: string) => {
    if (!pendingWildCardId || isProcessingMove) return;

    setIsProcessingMove(true);
    wsService.sendAction('PLAY_CARD', {
      cardId: pendingWildCardId,
      wildColor: color,
      unoCalled: localUnoCalled
    });

    setShowColorPicker(false);
    setPendingWildCardId(null);
    if (localUnoCalled) setLocalUnoCalled(false);
  }, [pendingWildCardId, localUnoCalled]);

  const handleColorPickerClose = useCallback(() => {
    setShowColorPicker(false);
    setPendingWildCardId(null);
  }, []);

  const handleDrawCard = useCallback(() => {
    if (isProcessingMove) return;
    setIsProcessingMove(true);
    wsService.sendAction('DRAW_CARD');
  }, [isProcessingMove]);

  const handleCallUno = useCallback(() => {
    if (isProcessingMove) return;
    setIsProcessingMove(true);
    setLocalUnoCalled(true);
    wsService.sendAction('CALL_UNO');
  }, [isProcessingMove]);

  const handlePassTurn = useCallback(() => {
    if (isProcessingMove) return;
    setIsProcessingMove(true);
    wsService.sendAction('PASS_AFTER_DRAW');
  }, [isProcessingMove]);

  const handleReturnToLobby = useCallback(() => {
    if (publicState?.status === 'waiting') {
      navigate('/lobby', { state: { roomId: publicState.roomId, players: publicState.players } });
      return;
    }
    
    setWantsToReturn(true);
    
    const myIndex = privateState?.myPlayerIndex;
    const myPlayer = myIndex !== undefined ? publicState?.players[myIndex] : undefined;
    if (myPlayer?.isHost) {
      wsService.sendAction('RETURN_TO_LOBBY');
    } else {
      const host = publicState?.players.find(p => p.isHost);
      if (host?.isDisconnected) {
        wsService.sendAction('RETURN_TO_LOBBY');
      }
    }
  }, [publicState, privateState, navigate]);

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

  // Show ALL players in the top row, but identify the local player
  const opponents = publicState.players
    .map((p, index) => {
      return {
        name: p.name,
        cardCount: p.cardCount || 0,
        hasCalledUno: !!p.hasCalledUno,
        isDisconnected: !!p.isDisconnected,
        isCurrentTurn: index === publicState.currentPlayerIndex,
        isMe: index === myPlayerIndex,
      };
    });

  // Check if it's OUR turn
  const amICurrentPlayer = myPlayerIndex === publicState.currentPlayerIndex;

  // Format the time remaining
  const formatTime = (ms: number) => {
    const totalSeconds = Math.ceil(ms / 1000);
    const m = Math.floor(totalSeconds / 60);
    const s = totalSeconds % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  return (
    <div className="game-page">
      {/* Top bar */}
      <div className="game-topbar glass">
        <div className="topbar-left" style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <button
            className="btn btn-danger btn-sm"
            onClick={() => setShowLeaveConfirm(true)}
          >
            🚪 Leave
          </button>
          <div className="uno-authentic-logo">
            <span>UNO</span>
          </div>
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
            {amICurrentPlayer
              ? '🔥 Your Turn'
              : `⏳ Waiting for ${publicState.players[publicState.currentPlayerIndex]?.name || 'Player'}`}
          </span>
          {publicState.status === 'playing' && publicState.turnStartedAt && (
            <span
              className="turn-timer"
              style={{
                marginLeft: '1rem',
                fontWeight: 'bold',
                color: timeLeftMs < 10000 ? 'var(--uno-red)' : 'inherit'
              }}
            >
              ⏱️ {formatTime(timeLeftMs)}
            </span>
          )}
        </div>
      </div>

      {/* UNO Celebration / Warning Overlays */}
      <AnimatePresence>
        {splashColor && (
          <motion.div
            className="color-splash-overlay"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3 }}
          >
            <motion.div
              className="color-splash-bg"
              style={{ background: `radial-gradient(circle, ${COLOR_INDICATOR_MAP[splashColor] || 'white'} 0%, transparent 70%)` }}
              initial={{ scale: 0 }}
              animate={{ scale: 1.5 }}
              transition={{ duration: 0.8, ease: 'easeOut' }}
            />
            <motion.h2
              className="color-splash-text"
              initial={{ scale: 0.8, y: 30 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 1.1, opacity: 0 }}
              transition={{ type: 'spring', stiffness: 300, damping: 20 }}
            >
              {splashColor}!
            </motion.h2>
          </motion.div>
        )}
      </AnimatePresence>

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



      {/* Opponents */}
      <OpponentRow opponents={opponents} />

      {/* Game Table Center */}
      <motion.div
        className="game-table-center"
        animate={victoryPhase === 'pulse' ? { x: [0, -15, 15, -15, 15, -10, 10, -5, 5, 0], y: [0, 10, -10, 10, -10, 5, -5, 0] } : { x: 0, y: 0 }}
        transition={{ duration: 0.5 }}
      >
        {/* Draw Pile Area */}
        <div className="draw-pile-area">
          <span className="draw-pile-label">Pick Up Card</span>
          <motion.div
            className="draw-pile"
            onClick={amICurrentPlayer && !privateState.hasDrawn ? handleDrawCard : undefined}
            whileHover={amICurrentPlayer && !privateState.hasDrawn ? { scale: 1.05 } : {}}
            whileTap={amICurrentPlayer && !privateState.hasDrawn ? { scale: 0.95 } : {}}
            style={{ opacity: privateState.hasDrawn ? 0.5 : 1 }}
          >
            <UnoCard color="red" value="" faceDown playable={false} />
            <span className="pile-count">{publicState.drawPileCount} Cards Left</span>
            {amICurrentPlayer && !privateState.hasDrawn && <span className="draw-hint">Draw</span>}
          </motion.div>

          {amICurrentPlayer && privateState.hasDrawn && (
            <button
              className="btn btn-ghost btn-sm"
              style={{ marginTop: '8px' }}
              onClick={handlePassTurn}
            >
              Pass Turn
            </button>
          )}
        </div>

        {/* Discard Pile Area */}
        <div className="discard-pile-area">
          <span className="discard-pile-label">Active Card</span>
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
      </motion.div>

      {/* Action Toast Anchor (between card stack and player cards) */}
      <div style={{ position: 'relative', width: '100%', height: 0 }}>
        <AnimatePresence>
          {toastMessage && (
            <motion.div
              className="action-toast"
              initial={{ x: '-50%', y: '-30%', opacity: 0 }}
              animate={{ x: '-50%', y: '-50%', opacity: 1 }}
              exit={{ x: '-50%', y: '-30%', opacity: 0 }}
              style={{
                position: 'absolute',
                top: 0,
                left: '50%',
                background: 'rgba(0, 0, 0, 0.85)',
                color: 'white',
                padding: '10px 20px',
                borderRadius: '20px',
                zIndex: 1000,
                fontWeight: 'bold',
                boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
                border: '1px solid rgba(255,255,255,0.1)',
                textAlign: 'center',
                whiteSpace: 'nowrap',
                maxWidth: '90vw'
              }}
            >
              {toastMessage}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* UNO Call Button */}
      {privateState.hand.length === 1 && !publicState.players[myPlayerIndex]?.hasCalledUno && !localUnoCalled && (
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
      <div id="my-player-area" className="my-hand-area">
        <div className="my-hand-header">
          <span className="my-hand-label">Your Cards</span>
          <span className="my-hand-count">({privateState.hand.length})</span>
        </div>
        <PlayerHand
          cards={privateState.hand}
          isMyTurn={!!amICurrentPlayer}
          playableCardIds={privateState.playableCardIds}
          onPlayCard={handlePlayCard}
        />
      </div>

      {/* Emoji Reaction Tray */}
      <EmojiReactionTray onSendReaction={(emoji) => wsService.sendAction('SEND_REACTION', { emoji })} />

      {/* Floating Reactions */}
      {activeReactions.map((reaction) => {
        const myName = publicState.players[privateState.myPlayerIndex]?.name;
        return (
          <FloatingReaction
            key={reaction.id}
            id={reaction.id}
            emoji={reaction.emoji}
            playerName={reaction.playerName}
            isLocalPlayer={reaction.playerName === myName}
            onComplete={handleReactionComplete}
          />
        );
      })}

      {/* Color Picker Modal */}
      <ColorPicker
        isOpen={showColorPicker}
        onSelect={handleColorSelected}
        onClose={handleColorPickerClose}
      />

      {/* Shockwave Pulse & Confetti */}
      <AnimatePresence>
        {victoryPhase === 'pulse' && (
          <motion.div
            className="shockwave-pulse"
            initial={{ scale: 0, opacity: 1 }}
            animate={{ scale: 4, opacity: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.8, ease: 'easeOut' }}
            style={{
              position: 'fixed',
              top: '50%',
              left: '50%',
              width: '100vw',
              height: '100vw',
              marginLeft: '-50vw',
              marginTop: '-50vw',
              borderRadius: '50%',
              border: '40px solid rgba(255, 255, 255, 0.9)',
              pointerEvents: 'none',
              zIndex: 1500,
            }}
          />
        )}
      </AnimatePresence>

      {/* Confetti container rendering logic */}
      {(victoryPhase === 'confetti' || victoryPhase === 'celebration') && (
        <div className="confetti-container">
          {Array.from({ length: 50 }).map((_, i) => {
            const colors = ['var(--uno-red)', 'var(--uno-blue)', 'var(--uno-green)', 'var(--uno-yellow)'];
            const color = colors[i % colors.length];
            return (
              <div
                key={i}
                className="confetti-piece"
                style={{
                  '--confetti-color': color,
                  left: `${Math.random() * 100}%`,
                  animationDelay: `${Math.random() * 2}s`,
                  animationDuration: `${2 + Math.random() * 2}s`
                } as React.CSSProperties}
              ></div>
            );
          })}
        </div>
      )}

      {/* Winner Overlay */}
      <AnimatePresence>
        {victoryPhase === 'celebration' && (
          <motion.div
            className="winner-overlay"
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.8, type: 'spring' }}
            style={{
              position: 'fixed', inset: 0, background: 'rgba(10, 14, 26, 0.95)', zIndex: 2000,
              display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center'
            }}
          >
            <div className="fireworks-container">
              <div className="firework"></div>
              <div className="firework"></div>
              <div className="firework"></div>
            </div>

            <motion.h1
              style={{ fontSize: 'clamp(4rem, 10vw, 8rem)', color: 'var(--uno-yellow)', fontFamily: 'var(--font-display)', textShadow: '0 0 20px rgba(255, 214, 0, 0.5)', margin: 0 }}
              animate={{ scale: [1, 1.05, 1] }}
              transition={{ repeat: Infinity, duration: 2 }}
            >
              {publicState?.winner === publicState?.players[privateState?.myPlayerIndex || 0]?.name ? 'VICTORY!' : 'GAME OVER'}
            </motion.h1>
            <h2 style={{ color: 'white', marginTop: '1rem', fontSize: '2rem', fontFamily: 'var(--font-display)' }}>
              <span style={{ color: 'var(--accent-primary)' }}>
                {publicState?.winner === publicState?.players[privateState?.myPlayerIndex || 0]?.name ? 'You' : publicState?.winner}
              </span> won the game!
            </h2>
            <div style={{ display: 'flex', gap: '1rem', marginTop: '3rem' }}>
              <button className="btn btn-primary btn-lg" style={{ fontSize: '1.2rem' }} onClick={handleReturnToLobby}>
                {wantsToReturn ? 'Waiting for host...' : 'Return to Lobby'}
              </button>
              <button
                className="btn btn-lg"
                style={{ fontSize: '1.2rem', color: 'white', background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.3)' }}
                onClick={() => {
                  sessionStorage.removeItem('uno_room_id');
                  wsService.disconnect();
                  navigate('/');
                }}
              >
                Leave Game
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Kickout Overlay */}
      {kickoutReason && (
        <div className="winner-overlay" style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.8)', zIndex: 2000,
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center'
        }}>
          <h1 style={{ fontSize: '4rem', color: 'var(--uno-red)' }}>Disconnected</h1>
          <h2 style={{ color: 'white', marginTop: '1rem' }}>{kickoutReason}</h2>
          <button className="btn btn-primary btn-lg" style={{ marginTop: '2rem' }} onClick={() => {
            setKickoutReason(null);
            navigate('/');
          }}>
            Back to Home
          </button>
        </div>
      )}

      {/* Leave Confirmation Overlay */}
      {showLeaveConfirm && (
        <div className="winner-overlay" style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.8)', zIndex: 2000,
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center'
        }}>
          <h2 style={{ color: 'white', marginBottom: '2rem' }}>Are you sure you want to leave the game?</h2>
          <div style={{ display: 'flex', gap: '1rem' }}>
            <button
              className="btn btn-lg"
              style={{ color: 'white', background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.3)' }}
              onClick={() => setShowLeaveConfirm(false)}
            >
              Cancel
            </button>
            <button className="btn btn-danger btn-lg" onClick={() => {
              setShowLeaveConfirm(false);
              sessionStorage.removeItem('uno_room_id');
              wsService.sendAction('LEAVE_ROOM');
            }}>
              Yes, Leave
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
