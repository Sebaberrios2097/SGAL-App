import { useEffect, useRef } from 'react';

// Un lector de códigos de barra actúa como teclado: "escribe" el código muy rápido y
// termina con Enter. Este hook escucha a nivel de ventana y, cuando detecta esa ráfaga
// seguida de Enter, entrega el código completo — sin necesidad de enfocar ningún campo.
//
// Para no interferir con la escritura manual, se ignora mientras el foco está en un
// campo editable (input, textarea, select o contenteditable).

const isEditableTarget = (element) => {
  if (!element) return false;
  const tag = element.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || element.isContentEditable;
};

/**
 * @param {(code: string) => void} onScan  Se invoca con el código escaneado.
 * @param {object} [options]
 * @param {boolean} [options.enabled=true]   Activa/desactiva el escáner.
 * @param {number}  [options.minLength=3]    Largo mínimo para considerarlo un escaneo.
 * @param {number}  [options.resetMs=500]    Si pasa más de este tiempo entre teclas, se
 *                                           descarta el búfer (evita acumular pulsaciones sueltas).
 */
export function useBarcodeScanner(onScan, { enabled = true, minLength = 3, resetMs = 500 } = {}) {
  const buffer = useRef('');
  const lastTime = useRef(0);
  const callback = useRef(onScan);
  callback.current = onScan;

  useEffect(() => {
    if (!enabled) return undefined;

    const handleKeyDown = (event) => {
      if (event.ctrlKey || event.altKey || event.metaKey) return;
      if (isEditableTarget(document.activeElement)) return;

      const now = performance.now();

      if (event.key === 'Enter') {
        const code = buffer.current.trim();
        buffer.current = '';
        if (code.length >= minLength) {
          event.preventDefault();
          callback.current?.(code);
        }
        return;
      }

      // Solo caracteres imprimibles forman parte de un código.
      if (event.key.length === 1) {
        if (now - lastTime.current > resetMs) buffer.current = '';
        buffer.current += event.key;
        lastTime.current = now;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [enabled, minLength, resetMs]);
}
