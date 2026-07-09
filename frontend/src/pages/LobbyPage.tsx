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

  const [playerName, setPlayerName] = useState('');
  const [roomCode, setRoomCode] = useState('');
  
  // State for waiting room
  const [joined, setJoined] = useState(false);
  const [players, setPlayers] = useState<PlayerInfo[]>([]);
  const [activeRoomId, setActiveRoomId] = useState('');
  
  // UI states
  const [copied, setCopied] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [isConnecting, setIsConnecting] = useState(false);

  useEffect(() => {
    // Subscribe to WebSocket messages
    const unsubscribe = wsService.subscribe((msg: WsMessage) => {
      switch (msg.type) {
        case 'roomCreated':
          setActiveRoomId(msg.roomId);
          setPlayers(msg.players);
          setJoined(true);
          setIsConnecting(false);
          break;
        case 'lobbyUpdate':
          setActiveRoomId(msg.roomId);
          setPlayers(msg.players);
          setJoined(true);
          setIsConnecting(false);
          break;
        case 'gameStateUpdate':
          // Game started, navigate to game page
          navigate('/game', { replace: true });
          break;
        case 'leftRoom':
          setJoined(false);
          setActiveRoomId('');
          setPlayers([]);
          break;
        case 'error':
          setErrorMsg(msg.message);
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
    navigate('/');
  };

  const isHost = players.find(p => p.name === playerName)?.isHost || false;

  // Pre-join: name entry + room code
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
