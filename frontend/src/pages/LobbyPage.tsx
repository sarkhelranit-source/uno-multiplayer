import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { wsService } from '../services/WebSocketService';
import type { PlayerInfo, WsMessage } from '../types/game';
import './LobbyPage.css';

export default function LobbyPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const mode = searchParams.get('mode') || 'create';

  const [playerName, setPlayerName] = useState(sessionStorage.getItem('uno_player_name') || '');
  const [roomCode, setRoomCode] = useState('');
  
  // State for waiting room
  const [joined, setJoined] = useState(false);
  const [players, setPlayers] = useState<PlayerInfo[]>([]);
  const [activeRoomId, setActiveRoomId] = useState('');
  
  // UI states
  const [copied, setCopied] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [isConnecting, setIsConnecting] = useState(false);
  const [isReconnecting, setIsReconnecting] = useState(!!sessionStorage.getItem('uno_room_id') && !wsService.isConnected());

  // The WebSocketService now automatically reconnects. We just need to trigger it
  // on mount if there's a saved room, and it's not already connected.
  useEffect(() => {
    const savedRoomId = sessionStorage.getItem('uno_room_id');
    if (savedRoomId && !wsService.isConnected()) {
      setIsReconnecting(true);
      setIsConnecting(true);
      wsService.connect(savedRoomId).catch(() => {
        setIsConnecting(false);
        setIsReconnecting(false);
        sessionStorage.removeItem('uno_room_id');
      });
    } else if (savedRoomId && wsService.isConnected()) {
      // If already connected, make sure we show the right state
      setIsReconnecting(false);
    }
  }, []);

  useEffect(() => {
    // Subscribe to WebSocket messages
    const unsubscribe = wsService.subscribe((msg: WsMessage) => {
      switch (msg.type) {
        case 'roomCreated':
          setActiveRoomId(msg.roomId);
          setPlayers(msg.players);
          setJoined(true);
          setIsConnecting(false);
          setIsReconnecting(false);
          sessionStorage.setItem('uno_room_id', msg.roomId);
          break;
        case 'lobbyUpdate':
          setActiveRoomId(msg.roomId);
          setPlayers(msg.players);
          setJoined(true);
          setIsConnecting(false);
          setIsReconnecting(false);
          sessionStorage.setItem('uno_room_id', msg.roomId);
          break;
        case 'gameStateUpdate':
          // Game started, navigate to game page and pass the initial state
          navigate('/game', { 
            replace: true,
            state: { 
              publicState: msg.publicState, 
              privateState: msg.privateState 
            }
          });
          break;
        case 'leftRoom':
          setJoined(false);
          setActiveRoomId('');
          setPlayers([]);
          sessionStorage.removeItem('uno_room_id');
          break;
        case 'error':
          setErrorMsg(msg.message);
          setIsConnecting(false);
          setIsReconnecting(false);
          sessionStorage.removeItem('uno_room_id');
          break;
        case 'reconnecting':
          setIsReconnecting(true);
          break;
        case 'reconnected':
          setIsReconnecting(false);
          setIsConnecting(false);
          break;
      }
    });

    return () => {
      unsubscribe();
    };
  }, [navigate]);

  const handleCreate = async () => {
    if (!playerName.trim()) return;
    setIsConnecting(true);
    setErrorMsg('');
    try {
      await wsService.connect();
      sessionStorage.setItem('uno_player_name', playerName.trim());
      wsService.sendAction('CREATE_ROOM', { playerName: playerName.trim() });
    } catch (err) {
      setErrorMsg('Failed to connect to server.');
      setIsConnecting(false);
    }
  };

  const handleJoin = async () => {
    if (!playerName.trim() || roomCode.length < 4) return;
    setIsConnecting(true);
    setErrorMsg('');
    try {
      await wsService.connect();
      sessionStorage.setItem('uno_player_name', playerName.trim());
      wsService.sendAction('JOIN_ROOM', { 
        roomId: roomCode.toUpperCase(), 
        playerName: playerName.trim() 
      });
    } catch (err) {
      setErrorMsg('Failed to connect to server.');
      setIsConnecting(false);
    }
  };

  const handleCopyCode = () => {
    navigator.clipboard.writeText(activeRoomId).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleStartGame = () => {
    wsService.sendAction('START_GAME');
  };

  const handleLeaveRoom = () => {
    wsService.sendAction('LEAVE_ROOM');
    sessionStorage.removeItem('uno_room_id');
    navigate('/');
  };

  const isHost = players.find(p => p.name === playerName)?.isHost || false;

  useEffect(() => {
    if (!joined) return; // Only trap if they are inside the lobby room

    window.history.pushState(null, '', window.location.href);
    const handlePopState = () => {
      wsService.sendAction('LEAVE_ROOM');
      sessionStorage.removeItem('uno_room_id');
      navigate('/');
    };

    window.addEventListener('popstate', handlePopState);
    return () => {
      window.removeEventListener('popstate', handlePopState);
    };
  }, [joined, navigate]);

  // Pre-join: name entry + room code
  if (isReconnecting && !joined) {
    return (
      <div className="page lobby-page" style={{ justifyContent: 'center', alignItems: 'center' }}>
        <h2 style={{ color: 'white' }}>Reconnecting to lobby...</h2>
      </div>
    );
  }

  if (!joined) {
    return (
      <div className="page lobby-page">
        <motion.div
          className="lobby-card glass"
          initial={{ opacity: 0, y: 30, scale: 0.95 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ duration: 0.5 }}
        >
          <button
            className="lobby-back-btn"
            onClick={() => navigate('/')}
            aria-label="Go back"
          >
            ← Back
          </button>

          <h1 className="lobby-title">
            {mode === 'create' ? '🎮 Create a Room' : '🚪 Join a Room'}
          </h1>

          <div className="lobby-form">
            <div className="form-group">
              <label className="form-label" htmlFor="player-name-input">Your Name</label>
              <input
                id="player-name-input"
                className="input"
                type="text"
                placeholder="Enter your name"
                value={playerName}
                onChange={(e) => setPlayerName(e.target.value)}
                maxLength={20}
                autoComplete="off"
              />
            </div>

            {mode === 'join' && (
              <div className="form-group">
                <label className="form-label" htmlFor="room-code-input">Room Code</label>
                <input
                  id="room-code-input"
                  className="input input-lg"
                  type="text"
                  placeholder="ABCD"
                  value={roomCode}
                  onChange={(e) => setRoomCode(e.target.value.toUpperCase().slice(0, 4))}
                  maxLength={4}
                  autoComplete="off"
                />
              </div>
            )}

            {errorMsg && <div style={{ color: 'var(--accent-warning)', fontSize: '0.9rem', textAlign: 'center' }}>{errorMsg}</div>}

            <button
              id="lobby-submit-btn"
              className="btn btn-primary btn-lg lobby-submit-btn"
              onClick={mode === 'create' ? handleCreate : handleJoin}
              disabled={!playerName.trim() || (mode === 'join' && roomCode.length < 4) || isConnecting}
            >
              {isConnecting ? 'Connecting...' : (mode === 'create' ? 'Create Room' : 'Join Room')}
            </button>
          </div>
        </motion.div>
      </div>
    );
  }

  // Post-join: waiting room
  return (
    <div className="page lobby-page">
      <motion.div
        className="lobby-card glass lobby-waiting"
        initial={{ opacity: 0, y: 30, scale: 0.95 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.5 }}
      >
        <h1 className="lobby-title">🎯 Waiting Room</h1>

        <div className="room-code-display">
          <span className="room-code-label">Room Code</span>
          <div className="room-code-box">
            <span className="room-code-value">{activeRoomId}</span>
            <button
              id="copy-room-code-btn"
              className="btn btn-sm btn-ghost copy-btn"
              onClick={handleCopyCode}
            >
              {copied ? '✓ Copied' : '📋 Copy'}
            </button>
          </div>
        </div>

        <div className="player-list">
          <h3 className="player-list-title">
            Players ({players.length}/8)
          </h3>
          {players.map((player, i) => (
            <motion.div
              key={player.name}
              className="player-list-item"
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: i * 0.1 }}
            >
              <div className="player-list-avatar">
                {player.name.charAt(0).toUpperCase()}
              </div>
              <span className="player-list-name">
                {player.name}
                {player.isHost && <span className="host-badge">HOST</span>}
                {player.name === playerName && <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>(You)</span>}
              </span>
              <span className={`ready-indicator ${player.isDisconnected ? '' : 'ready'}`}>
                {player.isDisconnected ? '⚡ Offline' : '✓ Connected'}
              </span>
            </motion.div>
          ))}
        </div>

        {errorMsg && <div style={{ color: 'var(--accent-warning)', fontSize: '0.9rem', textAlign: 'center', marginBottom: '16px' }}>{errorMsg}</div>}

        <div className="lobby-actions">
          {isHost ? (
            <button
              id="start-game-btn"
              className="btn btn-uno-red btn-lg"
              onClick={handleStartGame}
              disabled={players.length < 2}
            >
              {players.length >= 2 ? '🎴 Start Game' : 'Waiting for players...'}
            </button>
          ) : (
            <div style={{ textAlign: 'center', color: 'var(--text-secondary)', marginBottom: '12px' }}>
              Waiting for host to start...
            </div>
          )}
          <button
            id="leave-room-btn"
            className="btn btn-ghost"
            onClick={handleLeaveRoom}
          >
            Leave Room
          </button>
        </div>
      </motion.div>
    </div>
  );
}
