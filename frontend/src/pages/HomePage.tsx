import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import UnoCard from '../components/UnoCard';
import './HomePage.css';

const FLOATING_CARDS = [
  { color: 'red' as const, value: '7', x: '8%', y: '15%', rotate: -15, delay: 0 },
  { color: 'blue' as const, value: '3', x: '85%', y: '20%', rotate: 12, delay: 0.3 },
  { color: 'green' as const, value: 'reverse', x: '12%', y: '70%', rotate: -8, delay: 0.6 },
  { color: 'yellow' as const, value: 'skip', x: '80%', y: '75%', rotate: 18, delay: 0.9 },
  { color: 'wild' as const, value: 'wild', x: '50%', y: '10%', rotate: -5, delay: 0.15 },
  { color: 'red' as const, value: 'draw2', x: '90%', y: '48%', rotate: 22, delay: 0.45 },
  { color: 'blue' as const, value: '0', x: '5%', y: '45%', rotate: -20, delay: 0.75 },
];

export default function HomePage() {
  const navigate = useNavigate();

  return (
    <div className="page home-page">
      {/* Floating background cards */}
      <div className="floating-cards" aria-hidden="true">
        {FLOATING_CARDS.map((card, i) => (
          <motion.div
            key={i}
            className="floating-card"
            style={{ left: card.x, top: card.y }}
            animate={{
              y: [0, -12, 0],
              rotate: [card.rotate, card.rotate + 3, card.rotate],
            }}
            transition={{
              duration: 4 + i * 0.5,
              repeat: Infinity,
              ease: 'easeInOut',
            }}
          >
            <UnoCard
              color={card.color}
              value={card.value}
              delay={card.delay}
              playable={false}
            />
          </motion.div>
        ))}
      </div>

      {/* Hero content */}
      <motion.div
        className="hero-content"
        initial={{ opacity: 0, y: 30 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
      >
        <motion.div
          className="hero-logo"
          initial={{ scale: 0.6, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ delay: 0.2, type: 'spring', stiffness: 200, damping: 15 }}
        >
          <span className="logo-text">
            <span className="logo-u">U</span>
            <span className="logo-n">N</span>
            <span className="logo-o">O</span>
          </span>
          <span className="logo-subtitle">ONLINE</span>
        </motion.div>

        <motion.p
          className="hero-tagline"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.5 }}
        >
          Play the classic card game with friends — anywhere, anytime.
        </motion.p>

        <motion.div
          className="hero-actions"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.7 }}
        >
          <button
            id="create-room-btn"
            className="btn btn-primary btn-lg"
            onClick={() => navigate('/lobby?mode=create')}
          >
            🎮 Create Room
          </button>
          <button
            id="join-room-btn"
            className="btn btn-ghost btn-lg"
            onClick={() => navigate('/lobby?mode=join')}
          >
            🚪 Join Room
          </button>
        </motion.div>
      </motion.div>

      {/* Bottom decorative strip */}
      <div className="home-bottom-strip">
        <div className="strip-color red" />
        <div className="strip-color blue" />
        <div className="strip-color green" />
        <div className="strip-color yellow" />
      </div>
    </div>
  );
}
