import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react';

/**
 * Métodos que el formulario puede llamar sobre la firma.
 */
export interface SignaturePadHandle {
  isEmpty: () => boolean;
  clear: () => void;
  toDataURL: () => string;
}

interface Props {
  height?: number;
}

/**
 * Recuadro de firma digital. Funciona con mouse y con el dedo (touch).
 * No usa librerías externas: dibuja sobre un <canvas>.
 * La imagen se obtiene con toDataURL() como PNG en base64.
 */
const SignaturePad = forwardRef<SignaturePadHandle, Props>(function SignaturePad(
  { height = 160 },
  ref,
) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const empty = useRef(true);

  // Ajusta el tamaño interno del canvas al ancho del contenedor (para que se vea nítido).
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const setup = () => {
      const width = canvas.parentElement?.clientWidth ?? 300;
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      ctx.lineWidth = 2;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.strokeStyle = '#111';
      empty.current = true;
    };

    setup();
    window.addEventListener('resize', setup);
    return () => window.removeEventListener('resize', setup);
  }, [height]);

  function getPos(e: React.MouseEvent | React.TouchEvent) {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    const point = 'touches' in e ? e.touches[0] : e;
    return { x: point.clientX - rect.left, y: point.clientY - rect.top };
  }

  function start(e: React.MouseEvent | React.TouchEvent) {
    e.preventDefault();
    const ctx = canvasRef.current?.getContext('2d');
    if (!ctx) return;
    drawing.current = true;
    const { x, y } = getPos(e);
    ctx.beginPath();
    ctx.moveTo(x, y);
  }

  function move(e: React.MouseEvent | React.TouchEvent) {
    if (!drawing.current) return;
    e.preventDefault();
    const ctx = canvasRef.current?.getContext('2d');
    if (!ctx) return;
    const { x, y } = getPos(e);
    ctx.lineTo(x, y);
    ctx.stroke();
    empty.current = false;
  }

  function end() {
    drawing.current = false;
  }

  useImperativeHandle(ref, () => ({
    // Revisa los píxeles reales del canvas: si no hay ningún trazo (todo
    // transparente), está vacío. Es a prueba de fallos, no depende de flags.
    isEmpty: () => {
      const canvas = canvasRef.current;
      if (!canvas) return true;
      const ctx = canvas.getContext('2d');
      if (!ctx) return true;
      const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height);
      for (let i = 3; i < data.length; i += 4) {
        if (data[i] !== 0) return false; // encontró un píxel dibujado
      }
      return true;
    },
    clear: () => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      canvas.getContext('2d')?.clearRect(0, 0, canvas.width, canvas.height);
      empty.current = true;
    },
    toDataURL: () => canvasRef.current?.toDataURL('image/png') ?? '',
  }));

  return (
    <div
      style={{
        border: '1px solid var(--bugie-border)',
        borderRadius: 12,
        overflow: 'hidden',
        background: '#fff',
        touchAction: 'none',
      }}
    >
      <canvas
        ref={canvasRef}
        style={{ display: 'block', width: '100%', height, cursor: 'crosshair' }}
        onMouseDown={start}
        onMouseMove={move}
        onMouseUp={end}
        onMouseLeave={end}
        onTouchStart={start}
        onTouchMove={move}
        onTouchEnd={end}
      />
    </div>
  );
});

export default SignaturePad;
