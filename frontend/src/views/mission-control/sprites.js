// Procedural pixel-art character sprite generation
// Each character is 16x24px with 12 frames in a spritesheet row

const FRAME_W = 16;
const FRAME_H = 24;
const FRAME_COUNT = 12;

// Skin/hair variations for variety
const SKIN_COLORS = ['#FFDBAC', '#F1C27D', '#E8B89A', '#D5A07A', '#C68642'];
const HAIR_COLORS = ['#111111', '#4a2c0a', '#cc8800', '#333333', '#8B0000'];

function intToHex(n) {
  return '#' + ('000000' + n.toString(16)).slice(-6);
}

/**
 * Create a canvas-based spritesheet for one character
 * @param {number} shirtColor - hex color for shirt (from lane)
 * @param {number} index - deterministic index for skin/hair variation
 * @returns {HTMLCanvasElement}
 */
export function createCharacterCanvas(shirtColor, index = 0) {
  const canvas = document.createElement('canvas');
  canvas.width = FRAME_W * FRAME_COUNT;
  canvas.height = FRAME_H;
  const ctx = canvas.getContext('2d');

  const skinHex = SKIN_COLORS[index % SKIN_COLORS.length];
  const hairHex = HAIR_COLORS[index % HAIR_COLORS.length];
  const shirtHex = intToHex(shirtColor);

  function drawFrame(fx, legL, legR, armL, armR, expr) {
    const ox = fx * FRAME_W;

    // Shadow
    ctx.fillStyle = 'rgba(0,0,0,0.15)';
    ctx.beginPath();
    ctx.ellipse(ox + 8, 23, 5, 2, 0, 0, Math.PI * 2);
    ctx.fill();

    // Legs (dark pants)
    ctx.fillStyle = '#1a1a3e';
    ctx.fillRect(ox + 4, 15 + legL, 3, 7);
    ctx.fillRect(ox + 9, 15 + legR, 3, 7);

    // Shoes
    ctx.fillStyle = '#111';
    ctx.fillRect(ox + 3, 21 + legL, 4, 2);
    ctx.fillRect(ox + 8, 21 + legR, 4, 2);

    // Body / shirt
    ctx.fillStyle = shirtHex;
    ctx.fillRect(ox + 4, 10, 8, 6);

    // Arms
    ctx.fillRect(ox + 2, 10 + armL, 3, 5);
    ctx.fillRect(ox + 11, 10 + armR, 3, 5);

    // Hands
    ctx.fillStyle = skinHex;
    ctx.fillRect(ox + 2, 14 + armL, 2, 2);
    ctx.fillRect(ox + 11, 14 + armR, 2, 2);

    // Neck
    ctx.fillStyle = skinHex;
    ctx.fillRect(ox + 6, 8, 4, 3);

    // Head
    ctx.beginPath();
    ctx.roundRect(ox + 4, 1, 8, 8, 2);
    ctx.fill();

    // Hair
    ctx.fillStyle = hairHex;
    ctx.fillRect(ox + 4, 1, 8, 2);
    ctx.fillRect(ox + 4, 1, 2, 3);
    ctx.fillRect(ox + 10, 1, 2, 3);

    // Eyes
    ctx.fillStyle = expr === 'error' ? '#FF1744' : '#111';
    ctx.fillRect(ox + 6, 4, 1, 1);
    ctx.fillRect(ox + 9, 4, 1, 1);

    // Mouth
    if (expr === 'happy') {
      ctx.fillStyle = '#111';
      ctx.fillRect(ox + 6, 6, 1, 1);
      ctx.fillRect(ox + 7, 7, 2, 1);
      ctx.fillRect(ox + 9, 6, 1, 1);
    } else if (expr === 'error') {
      ctx.fillStyle = '#FF1744';
      ctx.fillRect(ox + 6, 7, 4, 1);
    } else {
      ctx.fillStyle = '#111';
      ctx.fillRect(ox + 6, 7, 4, 1);
    }
  }

  // Frame 0-3: walk right
  drawFrame(0, -1, 1, 1, -1, 'neutral');
  drawFrame(1, 0, 0, 0, 0, 'neutral');
  drawFrame(2, 1, -1, -1, 1, 'neutral');
  drawFrame(3, 0, 0, 0, 0, 'neutral');
  // Frame 4-7: walk left
  drawFrame(4, -1, 1, 1, -1, 'neutral');
  drawFrame(5, 0, 0, 0, 0, 'neutral');
  drawFrame(6, 1, -1, -1, 1, 'neutral');
  drawFrame(7, 0, 0, 0, 0, 'neutral');
  // Frame 8: idle
  drawFrame(8, 0, 0, 0, 0, 'neutral');
  // Frame 9: typing (arms raised to keyboard)
  drawFrame(9, 0, 0, -3, -3, 'neutral');
  // Frame 10: celebrate (arms up, jumping)
  drawFrame(10, -2, 2, -4, -4, 'happy');
  // Frame 11: error (one arm up signaling)
  drawFrame(11, 0, 0, 0, -5, 'error');

  return canvas;
}

export { FRAME_W, FRAME_H, FRAME_COUNT };
