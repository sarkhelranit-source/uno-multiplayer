import { motion, AnimatePresence } from 'framer-motion';
import UnoCard from './UnoCard';
import './PlayerHand.css';

interface Card {
  color: 'red' | 'blue' | 'green' | 'yellow' | 'wild';
  value: string;
  id: string;
}

interface PlayerHandProps {
  cards: Card[];
  currentColor: string;
  topCard: Card | null;
  isMyTurn: boolean;
  onPlayCard: (cardId: string) => void;
}

function isPlayable(card: Card, topCard: Card | null, currentColor: string): boolean {
  if (!topCard) return true;
  if (card.color === 'wild') return true;
  if (card.color === currentColor) return true;
  if (card.value === topCard.value) return true;
  return false;
}

export default function PlayerHand({
  cards,
  currentColor,
  topCard,
  isMyTurn,
  onPlayCard,
}: PlayerHandProps) {
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
            const yOffset = Math.abs(angle) * 0.4;
            const playable = isMyTurn && isPlayable(card, topCard, currentColor);

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
