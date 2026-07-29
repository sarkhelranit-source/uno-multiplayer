import { motion, AnimatePresence } from 'framer-motion';
import './ColorPicker.css';

interface ColorPickerProps {
  isOpen: boolean;
  onSelect: (color: string) => void;
  onClose?: () => void;
}

const COLORS = [
  { name: 'red', label: 'Red', hex: '#e74c3c' },
  { name: 'blue', label: 'Blue', hex: '#3498db' },
  { name: 'green', label: 'Green', hex: '#2ecc71' },
  { name: 'yellow', label: 'Yellow', hex: '#f1c40f' },
];

export default function ColorPicker({ isOpen, onSelect, onClose }: ColorPickerProps) {
  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          className="color-picker-overlay"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          <motion.div
            className="color-picker-modal glass"
            initial={{ scale: 0.7, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.7, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 400, damping: 30 }}
          >
            {onClose && (
              <button 
                className="color-picker-close-btn" 
                onClick={onClose} 
                aria-label="Close"
              >
                &times;
              </button>
            )}
            <h3 className="color-picker-title">Choose a Color</h3>
            <div className="color-picker-grid">
              {COLORS.map((c) => (
                <motion.button
                  key={c.name}
                  className="color-picker-btn"
                  style={{ background: c.hex }}
                  onClick={() => onSelect(c.name)}
                  whileHover={{ scale: 1.15 }}
                  whileTap={{ scale: 0.9 }}
                >
                  <span className="color-picker-label">{c.label}</span>
                </motion.button>
              ))}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
