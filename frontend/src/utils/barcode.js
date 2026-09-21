// Generador de código de barras Code39 → SVG, sin dependencias externas.
// Code39 es simple y lo leen todos los lectores. Cada carácter son 9 elementos que
// alternan barra/espacio (empezando y terminando en barra); 'W' = ancho, 'N' = angosto.
// El dato se enmarca con '*' de inicio/fin (el lector los omite al leer).

const CODE39 = {
  '0': 'NNNWWNWNN', '1': 'WNNWNNNNW', '2': 'NNWWNNNNW', '3': 'WNWWNNNNN', '4': 'NNNWWNNNW',
  '5': 'WNNWWNNNN', '6': 'NNWWWNNNN', '7': 'NNNWNNWNW', '8': 'WNNWNNWNN', '9': 'NNWWNNWNN',
  'A': 'WNNNNWNNW', 'B': 'NNWNNWNNW', 'C': 'WNWNNWNNN', 'D': 'NNNNWWNNW', 'E': 'WNNNWWNNN',
  'F': 'NNWNWWNNN', 'G': 'NNNNNWWNW', 'H': 'WNNNNWWNN', 'I': 'NNWNNWWNN', 'J': 'NNNNWWWNN',
  'K': 'WNNNNNNWW', 'L': 'NNWNNNNWW', 'M': 'WNWNNNNWN', 'N': 'NNNNWNNWW', 'O': 'WNNNWNNWN',
  'P': 'NNWNWNNWN', 'Q': 'NNNNNNWWW', 'R': 'WNNNNNWWN', 'S': 'NNWNNNWWN', 'T': 'NNNNWNWWN',
  'U': 'WWNNNNNNW', 'V': 'NWWNNNNNW', 'W': 'WWWNNNNNN', 'X': 'NWNNWNNNW', 'Y': 'WWNNWNNNN',
  'Z': 'NWWNWNNNN', '-': 'NWNNNNWNW', '.': 'WWNNNNWNN', ' ': 'NWWNNNWNN', '*': 'NWNNWNWNN'
};

/**
 * Devuelve el SVG (string) del código de barras Code39 para `data`.
 * @param {string} data  Texto a codificar (se convierte a mayúsculas; solo caracteres soportados).
 */
export function code39Svg(data, { narrow = 2, height = 46, margin = 10 } = {}) {
  const wide = narrow * 3;
  const text = `*${String(data).toUpperCase()}*`;
  const rects = [];
  let x = margin;

  for (const character of text) {
    const pattern = CODE39[character];
    if (!pattern) continue;
    for (let i = 0; i < pattern.length; i++) {
      const width = pattern[i] === 'W' ? wide : narrow;
      if (i % 2 === 0) rects.push(`<rect x="${x}" y="0" width="${width}" height="${height}" fill="#000"/>`);
      x += width;
    }
    x += narrow; // Espacio angosto entre caracteres.
  }

  const totalWidth = x - narrow + margin;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${totalWidth}" height="${height}" viewBox="0 0 ${totalWidth} ${height}" preserveAspectRatio="xMidYMid meet">${rects.join('')}</svg>`;
}
