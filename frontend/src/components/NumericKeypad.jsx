import { createContext, useCallback, useContext, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Delete, GripHorizontal } from 'lucide-react';

// Teclado numérico personalizado para las pantallas de cuadratura (apertura y cierre de turno).
// En dispositivos táctiles (tablets) reemplaza al teclado del sistema: los campos numéricos se
// vuelven de solo lectura y toda la edición pasa por este teclado en pantalla. En equipos con
// mouse/teclado físico el comportamiento es el habitual (input numérico normal).

const KeypadContext = createContext(null);

const digitsOnly = (value) => String(value ?? '').replace(/\D/g, '');

const detectCoarsePointer = () =>
  typeof window !== 'undefined' &&
  typeof window.matchMedia === 'function' &&
  window.matchMedia('(pointer: coarse)').matches;

export const NumericKeypadProvider = ({ children }) => {
  const isTouch = useMemo(detectCoarsePointer, []);
  const [active, setActive] = useState(null);
  const activeRef = useRef(null);

  const register = useCallback((field) => {
    activeRef.current = field;
    setActive(field);
  }, []);

  const close = useCallback(() => {
    activeRef.current = null;
    setActive(null);
  }, []);

  const applyValue = useCallback((rawValue) => {
    const field = activeRef.current;
    if (!field) return;
    const next = field.sanitize ? field.sanitize(rawValue) : digitsOnly(rawValue);
    field.onValueChange(next);
    const updated = { ...field, value: next };
    activeRef.current = updated;
    setActive(updated);
  }, []);

  const pressDigit = useCallback((digit) => {
    const field = activeRef.current;
    if (!field) return;
    applyValue(`${field.value ?? ''}${digit}`);
  }, [applyValue]);

  const backspace = useCallback(() => {
    const field = activeRef.current;
    if (!field) return;
    applyValue(String(field.value ?? '').slice(0, -1));
  }, [applyValue]);

  const clear = useCallback(() => applyValue(''), [applyValue]);

  const contextValue = useMemo(() => ({ isTouch, register, close }), [isTouch, register, close]);

  return (
    <KeypadContext.Provider value={contextValue}>
      {children}
      {isTouch && active && (
        <NumericKeypad onDigit={pressDigit} onBackspace={backspace} onClear={clear} onDone={close} />
      )}
    </KeypadContext.Provider>
  );
};

export const NumericInput = ({
  value,
  onValueChange,
  sanitize = digitsOnly,
  style,
  className,
  placeholder,
  disabled,
  ariaLabel,
  fieldId
}) => {
  const context = useContext(KeypadContext);
  const isTouch = context?.isTouch;
  const inputRef = useRef(null);

  const registerAsActive = () => {
    if (isTouch && context && !disabled) {
      context.register({
        id: fieldId ?? ariaLabel ?? 'campo',
        el: inputRef.current,
        sanitize,
        onValueChange,
        value: value == null ? '' : String(value)
      });
    }
  };

  return (
    <input
      ref={inputRef}
      type={isTouch ? 'text' : 'number'}
      inputMode={isTouch ? 'none' : 'numeric'}
      min="0"
      readOnly={isTouch}
      value={value ?? ''}
      onChange={(event) => onValueChange(sanitize(event.target.value))}
      onFocus={registerAsActive}
      onClick={registerAsActive}
      placeholder={placeholder}
      disabled={disabled}
      aria-label={ariaLabel}
      className={className}
      style={style}
    />
  );
};

const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9'];

const MARGIN = 12;

const NumericKeypad = ({ onDigit, onBackspace, onClear, onDone }) => {
  const keypadRef = useRef(null);
  const [pos, setPos] = useState(null);

  // Posición inicial: esquina inferior izquierda, para no tapar los campos del centro.
  useLayoutEffect(() => {
    const el = keypadRef.current;
    const height = el?.offsetHeight ?? 340;
    setPos({ left: MARGIN, top: Math.max(MARGIN, window.innerHeight - height - MARGIN) });
  }, []);

  const startDrag = (event) => {
    event.preventDefault();
    const el = keypadRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const offsetX = event.clientX - rect.left;
    const offsetY = event.clientY - rect.top;

    const onMove = (moveEvent) => {
      const maxLeft = Math.max(MARGIN, window.innerWidth - el.offsetWidth - MARGIN);
      const maxTop = Math.max(MARGIN, window.innerHeight - el.offsetHeight - MARGIN);
      const left = Math.min(Math.max(MARGIN, moveEvent.clientX - offsetX), maxLeft);
      const top = Math.min(Math.max(MARGIN, moveEvent.clientY - offsetY), maxTop);
      setPos({ left, top });
    };
    const onUp = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  };

  const positionStyle = pos
    ? { left: `${pos.left}px`, top: `${pos.top}px`, bottom: 'auto', transform: 'none' }
    : undefined;

  return (
  <div className="num-keypad" role="group" aria-label="Teclado numérico" ref={keypadRef} style={positionStyle}>
    <div className="num-keypad-handle" onPointerDown={startDrag} role="presentation" aria-hidden="true">
      <GripHorizontal size={18} />
      <span>Mover</span>
    </div>
    <div className="num-keypad-grid">
      {KEYS.map((key) => (
        <button
          key={key}
          type="button"
          className="num-key"
          onPointerDown={(e) => e.preventDefault()}
          onClick={() => onDigit(key)}
        >
          {key}
        </button>
      ))}
      <button
        type="button"
        className="num-key num-key-action"
        onPointerDown={(e) => e.preventDefault()}
        onClick={onClear}
        aria-label="Limpiar"
      >
        C
      </button>
      <button
        type="button"
        className="num-key"
        onPointerDown={(e) => e.preventDefault()}
        onClick={() => onDigit('0')}
      >
        0
      </button>
      <button
        type="button"
        className="num-key num-key-action"
        onPointerDown={(e) => e.preventDefault()}
        onClick={onBackspace}
        aria-label="Borrar"
      >
        <Delete size={22} />
      </button>
    </div>
    <button
      type="button"
      className="num-key-done"
      onPointerDown={(e) => e.preventDefault()}
      onClick={onDone}
    >
      Listo
    </button>
  </div>
  );
};

export default NumericKeypad;
