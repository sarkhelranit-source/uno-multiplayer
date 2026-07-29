import { useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import './EmojiReactionTray.css';

const EMOJIS = ['😂', '😡', '😎', '🤯', '😢', '🔥', '👏', '💀'];

interface EmojiReactionTrayProps {
  onSendReaction: (emoji: string) => void;
}

export default function EmojiReactionTray({ onSendReaction }: EmojiReactionTrayProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [cooldown, setCooldown] = useState(false);

  const handleSend = useCallback((emoji: string) => {
    if (cooldown) return;
    onSendReaction(emoji);
    setIsOpen(false);
    setCooldown(true);
    setTimeout(() => setCooldown(false), 3000);
  }, [cooldown, onSendReaction]);

  return (
    <div className="emoji-reaction-tray">
      <AnimatePresence>
        {isOpen && (
          <motion.div
            className="emoji-picker-menu glass"
            initial={{ opacity: 0, scale: 0.8, x: -20, y: 10 }}
            animate={{ opacity: 1, scale: 1, x: 0, y: 0 }}
            exit={{ opacity: 0, scale: 0.8, x: -20, y: 10 }}
            transition={{ type: 'spring', stiffness: 400, damping: 25 }}
          >
            {EMOJIS.map((emoji) => (
              <motion.button
                key={emoji}
                className="emoji-btn"
                onClick={() => handleSend(emoji)}
                whileHover={{ scale: 1.2 }}
                whileTap={{ scale: 0.9 }}
                disabled={cooldown}
              >
                {emoji}
              </motion.button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>

      <motion.button
        className={`emoji-toggle-btn glass ${cooldown ? 'on-cooldown' : ''}`}
        onClick={() => setIsOpen(!isOpen)}
        whileHover={{ scale: 1.1 }}
        whileTap={{ scale: 0.9 }}
      >
        😊
      </motion.button>
    </div>
  );
}
