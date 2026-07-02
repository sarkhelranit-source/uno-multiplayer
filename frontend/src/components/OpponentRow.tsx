import { motion } from 'framer-motion';
import './OpponentRow.css';

interface OpponentInfo {
  name: string;
  cardCount: number;
  hasCalledUno: boolean;
  isDisconnected: boolean;
  isCurrentTurn: boolean;
}

interface OpponentRowProps {
  opponents: OpponentInfo[];
}

export default function OpponentRow({ opponents }: OpponentRowProps) {
  return (
    <div className="opponent-row">
      {opponents.map((opp, i) => (
        <motion.div
          key={opp.name}
          className={`opponent-seat ${opp.isCurrentTurn ? 'active-turn' : ''} ${opp.isDisconnected ? 'disconnected' : ''}`}
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: i * 0.1 }}
        >
          <div className="opponent-avatar">
            {opp.name.charAt(0).toUpperCase()}
            {opp.isCurrentTurn && (
              <motion.div
                className="turn-ring"
                animate={{ scale: [1, 1.15, 1], opacity: [0.7, 1, 0.7] }}
                transition={{ duration: 1.5, repeat: Infinity }}
              />
            )}
          </div>
          <span className="opponent-name">{opp.name}</span>
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
      ))}
    </div>
  );
}
