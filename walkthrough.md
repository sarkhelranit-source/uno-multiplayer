# Classic UNO Card Visual Overhaul

## Overview
Revamped the entire in-game UI to resemble classic UNO cards with a premium dark-mode aesthetic, matching the mockup design the user selected.

## Changes Made

### 🎨 Card Design — Classic UNO Look
#### [index.css](file:///home/ubuntu/uno-multiplayer/frontend/src/index.css)
- **Color palette**: Shifted from pastel/flat colors to bold, saturated classic UNO colors (`#d72600` red, `#0956bf` blue, `#379711` green, `#ecd407` yellow)
- Added `--dark` variants for each color to create rich gradients
- **Card dimensions**: Increased from 80×120 to 90×135px for better readability
- **Border**: Changed from translucent `rgba(255,255,255,0.25)` to solid white `4px` border — the classic UNO card edge
- **Card value**: Bolder 2.2rem font, heavier weight (900), stronger text shadow
- **Corner labels**: Larger (0.75rem), fully opaque, with text shadows
- **Wild cards**: Dark background with a 4-quadrant conic-gradient oval (red/yellow/green/blue) instead of a full-card rainbow gradient
- **Yellow cards**: Dark text (`#1a1a2e`) instead of white for proper contrast
- **Disabled cards**: Stronger grayscale + dimming for clearer unplayable state

#### [UnoCard.css](file:///home/ubuntu/uno-multiplayer/frontend/src/components/UnoCard.css)
- **White oval**: Bigger (75%×60%), thicker border (3px), more visible background — the signature UNO card element
- **Card back logo**: Glowing red text shadow UNO branding, larger font
- **Wild oval**: Colored conic gradient for the 4-quadrant wild card look
- **Hover effect**: Oval brightens on hover

---

### 🎮 Game Table Layout
#### [GamePage.css](file:///home/ubuntu/uno-multiplayer/frontend/src/pages/GamePage.css)
- **Glass table surface**: Added subtle glass panel behind the draw/discard area with blur backdrop
- **Ambient particles**: Colored dots (red, blue, green, yellow) scattered across the table with a gentle twinkle animation
- **Draw pile area**: New wrapper with "Pick Up Card" label, "X Cards Left" count
- **Discard pile area**: New wrapper with "Active Card" label
- **Player hand header**: "Your Cards (N)" section header showing card count
- **Improved hand background**: Deeper gradient for better card contrast

#### [GamePage.tsx](file:///home/ubuntu/uno-multiplayer/frontend/src/pages/GamePage.tsx)
- Wrapped draw pile in `draw-pile-area` with `draw-pile-label` ("Pick Up Card")
- Wrapped discard pile in `discard-pile-area` with `discard-pile-label` ("Active Card")
- Added `my-hand-header` with "Your Cards" label and card count
- "Pass Turn" button repositioned inside the draw pile area with glass ghost styling

---

### 👥 Player Row
#### [OpponentRow.tsx](file:///home/ubuntu/uno-multiplayer/frontend/src/components/OpponentRow.tsx)
- Each player seat gets a unique ring color (amber, blue, emerald, purple, pink, etc.)
- Active player's avatar glows with their ring color
- Added "Active" badge (amber, pulsing) for the current-turn player
- "You" badge rendered below the name (green gradient)

#### [OpponentRow.css](file:///home/ubuntu/uno-multiplayer/frontend/src/components/OpponentRow.css)
- Larger avatars (48px) with colored ring borders
- `is-me` class highlights your own seat with a subtle indigo tint
- `active-badge`: Amber gradient with pulsing glow animation
- `you-badge`: Green gradient with shadow
- Active turn seat gets brighter glass background

## Verification
- ✅ TypeScript compilation passes with zero errors
- ✅ All CSS variable references are consistent across files
- ✅ Dev server running without build errors
