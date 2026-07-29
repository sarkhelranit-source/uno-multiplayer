import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import './FloatingReaction.css';

interface FloatingReactionProps {
  id: string;
  emoji: string;
  playerName: string;
  isLocalPlayer: boolean;
  onComplete: (id: string) => void;
}

const ANIMATION_DURATION = 2.5;

const getAnimationConfig = (emoji: string) => {
  switch (emoji) {
    case '😂': // Laughing: Bounces + tilts side-to-side
      return {
        y:       [0, -60, -80, -120, -160, -200],
        x:       [0, -20,  20,  -10,   10,    0],
        rotate:  [0, -15,  15,  -10,   10,    0],
        scale:   [0, 1.2,   1,  1.1,    1,  0.8],
        opacity: [0,   1,   1,    1,  0.8,    0],
      };
    case '😡': // Angry: Aggressive shake + scale pulse
      return {
        y:       [0, -40, -80, -120, -180, -220],
        x:       [0, -15,  15,  -10,   10,    0],
        scale:   [0, 1.5, 1.2,  1.4,  1.2,  0.8],
        rotate:  [0,  -5,   5,   -5,    5,    0],
        opacity: [0,   1,   1,    1,    1,    0],
      };
    case '😎': // Swag: Smooth tilt + cool bounce entrance
      return {
        y:       [0, -50, -80, -120, -160, -200],
        x:       [0,  30,  15,    5,    0,    0],
        rotate:  [-30, -10, 5,   0,    0,    0],
        scale:   [0, 1.1, 1.05,  1,    1,  0.8],
        opacity: [0,   1,   1,   1,    1,    0],
      };
    case '🤯': // Mind blown: Rapid scale burst + wobble
      return {
        y:       [0, -80, -120, -160, -200, -240],
        scale:   [0, 1.8,  0.9, 1.2,    1,  0.8],
        rotate:  [0, -10,   10,  -5,    5,    0],
        opacity: [0,   1,    1,   1,    1,    0],
      };
    case '😢': // Sad: Droops downward with slow sway
      return {
        y:       [0, -20,   0,   20,  -40,  -100],
        x:       [0, -30,  30,  -10,    0,     0],
        rotate:  [0,  -5,   5,   -2,    0,     0],
        scale:   [0,   1, 0.9,  0.9,  0.8,   0.6],
        opacity: [0,   1, 0.8,  0.5,  0.3,     0],
      };
    case '🔥': // Fire: Flickers + pulses
      return {
        y:       [0, -50, -100, -150, -200, -250],
        scale:   [0, 1.3,  0.8,  1.4,    1,  0.8],
        rotate:  [0,  -5,    5,   -5,    5,    0],
        opacity: [0,   1,  0.8,    1,  0.8,    0],
      };
    case '👏': // Clapping: Rhythmic squeeze
      return {
        y:       [0, -50, -100, -150, -200, -250],
        scale:   [0, 1.2,  0.8,  1.2,  0.8,    0],
        rotate:  [0,   5,   -5,    5,   -5,    0],
        opacity: [0,   1,    1,    1,    1,    0],
      };
    case '💀': // RIP: Spins and tumbles
      return {
        y:       [0, -80, -160, -200, -240, -280],
        x:       [0,  40,  -40,   20,  -20,    0],
        rotate:  [0, 120,  240,  360,  450,  540],
        scale:   [0,   1,    1,  0.8,  0.5,  0.3],
        opacity: [0,   1,    1,    1,  0.5,    0],
      };
    default: // Default float up
      return {
        y:       [0, -80, -160, -200, -240, -280],
        scale:   [0, 1.2,    1,  0.9,  0.8,  0.6],
        opacity: [0,   1,    1,    1,  0.5,    0],
      };
  }
};

export default function FloatingReaction({ id, emoji, playerName, isLocalPlayer, onComplete }: FloatingReactionProps) {
  const [origin, setOrigin] = useState<{ x: number; y: number } | null>(null);
  const animation = getAnimationConfig(emoji);

  useEffect(() => {
    // Find the DOM element to emit from
    const targetId = isLocalPlayer ? 'my-player-area' : `player-avatar-${playerName}`;
    const el = document.getElementById(targetId);
    if (el) {
      const rect = el.getBoundingClientRect();
      setOrigin({
        x: rect.left + rect.width / 2,
        y: rect.top + rect.height / 2
      });
    } else {
      // Fallback to center screen if element not found
      setOrigin({
        x: window.innerWidth / 2,
        y: window.innerHeight / 2
      });
    }
  }, [isLocalPlayer, playerName]);

  // Safety timeout in case onAnimationComplete doesn't fire
  useEffect(() => {
    const timer = setTimeout(() => onComplete(id), (ANIMATION_DURATION + 0.5) * 1000);
    return () => clearTimeout(timer);
  }, [id, onComplete]);

  if (!origin) return null; // Wait until origin is measured

  return (
    <motion.div
      className="floating-reaction"
      initial={{ opacity: 0, scale: 0, y: 0 }}
      animate={animation}
      transition={{ duration: ANIMATION_DURATION, ease: "easeOut" }}
      onAnimationComplete={() => onComplete(id)}
      style={{
        left: origin.x,
        top: origin.y
      }}
    >
      <div className={`emoji-symbol ${emoji === '😡' ? 'glow-red' : ''} ${emoji === '🔥' ? 'glow-orange' : ''}`}>
        {emoji}
      </div>
      <div className="reaction-player-name">{playerName}</div>
    </motion.div>
  );
}
