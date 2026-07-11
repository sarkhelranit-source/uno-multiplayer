import { useState, useEffect } from 'react';
import { AnimatePresence } from 'framer-motion';
import UnoCard from './UnoCard';
import './PlayerHand.css';

interface Card {
  color: 'red' | 'blue' | 'green' | 'yellow' | 'wild';
  value: string;
  id: string;
}

interface PlayerHandProps {
  cards: Card[];
  isMyTurn: boolean;
  playableCardIds: string[];
  onPlayCard: (cardId: string) => void;
}

export default function PlayerHand({
  cards,
  isMyTurn,
  playableCardIds,
  onPlayCard,
}: PlayerHandProps) {
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth <= 768);
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  const totalCards = cards.length;
  const maxFanAngle = Math.min(totalCards * 3, 40);

  return (
    <div className="player-hand-wrapper">
      <AnimatePresence mode="popLayout">
        <div className="player-hand">
          {cards.map((card, index) => {
            const angle = totalCards > 1
              ? -maxFanAngle / 2 + (index / (totalCards - 1)) * maxFanAngle
              : 0;
            
            // A card is only playable if it's your turn AND the backend says it's playable
            const playable = isMyTurn && playableCardIds.includes(card.id);
            
            // Apply base fan arc offset, and add an extra 20px lift for playable cards on mobile
            const baseOffset = Math.abs(angle) * 0.4;
            const yOffset = isMobile && playable ? baseOffset - 20 : baseOffset;

            return (
              <UnoCard
                key={card.id}
                color={card.color}
                value={card.value}
                id={card.id}
                playable={playable}
                onClick={() => playable && onPlayCard(card.id)}
                delay={index * 0.04}
                style={{
                  transform: `rotate(${angle}deg) translateY(${yOffset}px)`,
                  marginLeft: index === 0 ? 0 : '-18px',
                  zIndex: index,
                }}
              />
            );
          })}
        </div>
      </AnimatePresence>
    </div>
  );
}
