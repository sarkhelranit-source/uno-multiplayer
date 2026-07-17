import { motion } from 'framer-motion';
import './OpponentRow.css';

interface OpponentInfo {
  name: string;
  cardCount: number;
  hasCalledUno: boolean;
  isDisconnected: boolean;
  isCurrentTurn: boolean;
  isMe?: boolean;
}

interface OpponentRowProps {
  opponents: OpponentInfo[];
}

// Assign a unique ring color for each player seat
const RING_COLORS = [
  '#f59e0b', // amber
  '#3b82f6', // blue
  '#10b981', // emerald
  '#a855f7', // purple
  '#ec4899', // pink
  '#ef4444', // red
  '#06b6d4', // cyan
  '#84cc16', // lime
];

export default function OpponentRow({ opponents }: OpponentRowProps) {
  return (
    <div className="opponent-row">
      {opponents.map((opp, i) => {
        const ringColor = RING_COLORS[i % RING_COLORS.length];
        return (
          <motion.div
            key={opp.name}
            className={`opponent-seat ${opp.isCurrentTurn ? 'active-turn' : ''} ${opp.isDisconnected ? 'disconnected' : ''} ${opp.isMe ? 'is-me' : ''}`}
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.1 }}
          >
            <div
              className="opponent-avatar"
              style={{
                borderColor: ringColor,
                boxShadow: opp.isCurrentTurn ? `0 0 16px ${ringColor}` : 'none',
              }}
            >
              {opp.name.charAt(0).toUpperCase()}
              {opp.isCurrentTurn && (
                <motion.div
                  className="turn-ring"
                  style={{ borderColor: ringColor }}
                  animate={{ scale: [1, 1.2, 1], opacity: [0.6, 1, 0.6] }}
                  transition={{ duration: 1.5, repeat: Infinity }}
                />
              )}
            </div>
            <span className="opponent-name">{opp.name}</span>
            {opp.isMe && <span className="you-badge">You</span>}
            {opp.isCurrentTurn && !opp.isMe && <span className="active-badge">Active</span>}
            <div className="opponent-card-count">
              <span className="card-count-icon">🃏</span>
              <span className="card-count-number">{opp.cardCount}</span>
            </div>
            {opp.hasCalledUno && (
              <motion.span
                className="uno-badge"
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ type: 'spring', stiffness: 500 }}
              >
                UNO!
              </motion.span>
            )}
            {opp.isDisconnected && (
              <span className="disconnect-badge">⚡ Offline</span>
            )}
          </motion.div>
        );
      })}
    </div>
  );
}
