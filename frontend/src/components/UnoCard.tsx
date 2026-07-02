import { motion } from 'framer-motion';
import './UnoCard.css';

interface UnoCardProps {
  color: 'red' | 'blue' | 'green' | 'yellow' | 'wild';
  value: string;
  id?: string;
  playable?: boolean;
  onClick?: () => void;
  faceDown?: boolean;
  style?: React.CSSProperties;
  delay?: number;
}

const SYMBOL_MAP: Record<string, string> = {
  skip: '⊘',
  reverse: '⇄',
  draw2: '+2',
  wild: '★',
  wild4: '+4',
};

export default function UnoCard({
  color,
  value,
  playable = true,
  onClick,
  faceDown = false,
  style,
  delay = 0,
}: UnoCardProps) {
  const displayValue = SYMBOL_MAP[value] ?? value;
  const cornerLabel = SYMBOL_MAP[value] ?? value;

  if (faceDown) {
    return (
      <motion.div
        className="uno-card uno-card-back"
        style={style}
        initial={{ opacity: 0, scale: 0.8 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ delay, type: 'spring', stiffness: 300, damping: 25 }}
      >
        <div className="card-back-logo">UNO</div>
      </motion.div>
    );
  }

  return (
    <motion.div
      className={`uno-card ${color} ${!playable ? 'disabled' : ''}`}
      onClick={playable ? onClick : undefined}
      style={style}
      initial={{ opacity: 0, y: -30, rotateZ: -8 }}
      animate={{ opacity: 1, y: 0, rotateZ: 0 }}
      exit={{ opacity: 0, y: -60, scale: 0.5 }}
      transition={{ delay, type: 'spring', stiffness: 300, damping: 25 }}
      whileHover={playable ? { y: -14, scale: 1.08 } : {}}
      whileTap={playable ? { scale: 0.95 } : {}}
      layout
    >
      <span className="card-symbol">{cornerLabel}</span>
      <span className="card-value">{displayValue}</span>
      <span className="card-symbol-bottom">{cornerLabel}</span>

      {/* Inner oval shape like real UNO cards */}
      <div className="card-oval" />
    </motion.div>
  );
}
