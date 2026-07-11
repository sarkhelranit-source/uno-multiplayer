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
            
            // Apply base fan arc offset
            const yOffset = Math.abs(angle) * 0.4;

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
                  transform: `translateY(${yOffset}px) rotate(${angle}deg)`,
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
