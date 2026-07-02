import { useState } from 'react';
import { motion } from 'framer-motion';
import { useNavigate, useSearchParams } from 'react-router-dom';
import './LobbyPage.css';

interface Player {
  name: string;
  isHost: boolean;
  isReady: boolean;
}

// Mock data for UI development
const MOCK_PLAYERS: Player[] = [
  { name: 'You', isHost: true, isReady: true },
  { name: 'Alice', isHost: false, isReady: true },
  { name: 'Bob', isHost: false, isReady: false },
];

export default function LobbyPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const mode = searchParams.get('mode') || 'create';

  const [playerName, setPlayerName] = useState('');
  const [roomCode, setRoomCode] = useState('');
  const [joined, setJoined] = useState(false);
  const [players] = useState<Player[]>(MOCK_PLAYERS);
  const [copied, setCopied] = useState(false);

  const generatedCode = 'ABCD'; // Mock

  const handleJoin = () => {
    if (!playerName.trim()) return;
    // TODO: Connect to WebSocket and join room
    setJoined(true);
  };

  const handleCreate = () => {
    if (!playerName.trim()) return;
    // TODO: Connect to WebSocket and create room
    setJoined(true);
  };

  const handleCopyCode = () => {
    navigator.clipboard.writeText(generatedCode).catch(() => {
      // Clipboard API may fail in some contexts; silently ignore
    });
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleStartGame = () => {
    navigate('/game');
  };

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

            <button
              id="lobby-submit-btn"
              className="btn btn-primary btn-lg lobby-submit-btn"
              onClick={mode === 'create' ? handleCreate : handleJoin}
              disabled={!playerName.trim() || (mode === 'join' && roomCode.length < 4)}
            >
              {mode === 'create' ? 'Create Room' : 'Join Room'}
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
            <span className="room-code-value">{generatedCode}</span>
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
              </span>
              <span className={`ready-indicator ${player.isReady ? 'ready' : ''}`}>
                {player.isReady ? '✓ Ready' : '⏳ Waiting'}
              </span>
            </motion.div>
          ))}
        </div>

        <div className="lobby-actions">
          <button
            id="start-game-btn"
            className="btn btn-uno-red btn-lg"
            onClick={handleStartGame}
          >
            🎴 Start Game
          </button>
          <button
            id="leave-room-btn"
            className="btn btn-ghost"
            onClick={() => navigate('/')}
          >
            Leave Room
          </button>
        </div>
      </motion.div>
    </div>
  );
}
