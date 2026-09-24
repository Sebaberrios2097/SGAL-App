// Genera el timbre electrónico (TED) como código PDF417 para la representación impresa del DTE.
// El TED es el XML <TED>…</TED> del documento firmado; el SII lo codifica tal cual en PDF417.
//
// bwip-js se importa de forma dinámica para no cargarlo en el bundle principal: solo se descarga
// cuando efectivamente se imprime/emite una boleta.

// Devuelve un data URL (PNG) del PDF417 del TED, o null si no se pudo generar.
export const ted417DataUrl = async (ted) => {
  if (!ted) {
    console.warn('[timbre] TED vacío: no se genera PDF417.');
    return null;
  }
  try {
    const mod = await import('bwip-js');
    const bwipjs = mod.default || mod;
    const canvas = document.createElement('canvas');
    // Sin fijar `columns`: bwip-js auto-dimensiona para que quepa el TED (fijarlo en 10 puede
    // dar "insufficient capacity"). eclevel 5 es el nivel de corrección que usa el SII.
    bwipjs.toCanvas(canvas, {
      bcid: 'pdf417',
      text: ted,
      eclevel: 5,
      scale: 2,
      backgroundcolor: 'FFFFFF'
    });
    return canvas.toDataURL('image/png');
  } catch (error) {
    console.error('[timbre] No se pudo generar el PDF417:', error);
    return null;
  }
};
