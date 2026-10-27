import {
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
  type PointerEvent,
  type Ref,
} from "react";
import "./DrawingCanvas.css";

const COLORS = [
  { name: "Black", value: "#111111" },
  { name: "Red", value: "#e53935" },
  { name: "Blue", value: "#1e63e9" },
  { name: "Orange", value: "#fb8c00" },
  { name: "Green", value: "#2e9d50" },
];

export type DrawingPoint = {
  x: number;
  y: number;
};

export type DrawingStroke = {
  id: string;
  color: string;
  width: number;
  points: DrawingPoint[];
};

export type DrawingData = {
  version: 1;
  canvas: {
    width: number;
    height: number;
  };
  strokes: DrawingStroke[];
};

/** What a parent gets through `ref` so it can export, undo, redo, or reset. */
export type DrawingCanvasHandle = {
  /** Export editable stroke data as a JSON string. */
  toJSON: () => string;
  /** Export a PNG image with a white background. */
  toDataURL: () => string;
  undo: () => void;
  redo: () => void;
  clear: () => void;
};

type Props = {
  /** Internal drawing resolution in pixels. The canvas shrinks to fit narrow screens. */
  width?: number;
  height?: number;
  ref?: Ref<DrawingCanvasHandle>;
};

export function DrawingCanvas({ width = 400, height = 300, ref }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const currentStroke = useRef<DrawingStroke | null>(null);
  const [color, setColor] = useState(COLORS[0].value);
  const [size, setSize] = useState(8);
  const [strokes, setStrokes] = useState<DrawingStroke[]>([]);
  const [redoStrokes, setRedoStrokes] = useState<DrawingStroke[]>([]);

  function renderDrawing(strokesToDraw: DrawingStroke[]) {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;

    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, width, height);

    for (const stroke of strokesToDraw) {
      if (stroke.points.length === 0) continue;

      ctx.strokeStyle = stroke.color;
      ctx.fillStyle = stroke.color;
      ctx.lineWidth = stroke.width;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";

      // Draw a dot for a tap that contains only one point.
      if (stroke.points.length === 1) {
        ctx.beginPath();
        ctx.arc(
          stroke.points[0].x,
          stroke.points[0].y,
          stroke.width / 2,
          0,
          Math.PI * 2,
        );
        ctx.fill();
        continue;
      }

      ctx.beginPath();
      ctx.moveTo(stroke.points[0].x, stroke.points[0].y);
      for (let i = 1; i < stroke.points.length; i++) {
        ctx.lineTo(stroke.points[i].x, stroke.points[i].y);
      }
      ctx.stroke();
    }
  }

  useEffect(() => {
    renderDrawing(strokes);
  }, [strokes, width, height]);

  function pointFrom(e: PointerEvent<HTMLCanvasElement>): DrawingPoint {
    const rect = e.currentTarget.getBoundingClientRect();
    return {
      x: ((e.clientX - rect.left) / rect.width) * width,
      y: ((e.clientY - rect.top) / rect.height) * height,
    };
  }

  function handlePointerDown(e: PointerEvent<HTMLCanvasElement>) {
    if (e.button !== 0) return;
    e.currentTarget.setPointerCapture(e.pointerId);

    const point = pointFrom(e);
    currentStroke.current = {
      id: crypto.randomUUID(),
      color,
      width: size,
      points: [point],
    };

    // Draw immediately so taps and the beginning of a stroke feel responsive.
    const ctx = canvasRef.current?.getContext("2d");
    if (ctx) {
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(point.x, point.y, size / 2, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  function handlePointerMove(e: PointerEvent<HTMLCanvasElement>) {
    const stroke = currentStroke.current;
    if (!stroke) return;

    const point = pointFrom(e);
    const previousPoint = stroke.points[stroke.points.length - 1];
    stroke.points.push(point);

    const ctx = canvasRef.current?.getContext("2d");
    if (!ctx) return;

    ctx.strokeStyle = stroke.color;
    ctx.lineWidth = stroke.width;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.beginPath();
    ctx.moveTo(previousPoint.x, previousPoint.y);
    ctx.lineTo(point.x, point.y);
    ctx.stroke();
  }

  function stopDrawing() {
    if (!currentStroke.current) return;

    const finishedStroke = currentStroke.current;
    currentStroke.current = null;
    setStrokes((oldStrokes) => [...oldStrokes, finishedStroke]);
    // A new stroke after undo creates a new branch of drawing history.
    setRedoStrokes([]);
  }

  function undo() {
    setStrokes((oldStrokes) => {
      if (oldStrokes.length === 0) return oldStrokes;
      const lastStroke = oldStrokes[oldStrokes.length - 1];
      setRedoStrokes((oldRedo) => [...oldRedo, lastStroke]);
      return oldStrokes.slice(0, -1);
    });
  }

  function redo() {
    setRedoStrokes((oldRedo) => {
      if (oldRedo.length === 0) return oldRedo;
      const lastUndoneStroke = oldRedo[oldRedo.length - 1];
      setStrokes((oldStrokes) => [...oldStrokes, lastUndoneStroke]);
      return oldRedo.slice(0, -1);
    });
  }

  function clear() {
    currentStroke.current = null;
    setStrokes([]);
    setRedoStrokes([]);
  }

  function toJSON() {
    const drawing: DrawingData = {
      version: 1,
      canvas: { width, height },
      strokes,
    };
    return JSON.stringify(drawing);
  }

  function toDataURL() {
    // Render from stroke data before exporting so the image matches saved state.
    renderDrawing(strokes);
    return canvasRef.current?.toDataURL("image/png") ?? "";
  }

  useImperativeHandle(ref, () => ({
    toJSON,
    toDataURL,
    undo,
    redo,
    clear,
  }));

  return (
    <div className="drawing">
      <canvas
        ref={canvasRef}
        className="drawing-canvas"
        width={width}
        height={height}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={stopDrawing}
        onPointerCancel={stopDrawing}
      />

      <div className="drawing-toolbar">
        <div className="drawing-group" role="group" aria-label="Color">
          {COLORS.map((c) => (
            <button
              key={c.value}
              type="button"
              className="drawing-swatch"
              style={{ backgroundColor: c.value }}
              aria-label={c.name}
              title={c.name}
              aria-pressed={color === c.value}
              onClick={() => setColor(c.value)}
            />
          ))}
        </div>

        <div className="drawing-group drawing-brush-control">
          <label htmlFor="drawing-brush-size">
            Brush size: {size}px
          </label>
          <input
            id="drawing-brush-size"
            className="drawing-brush-slider"
            type="range"
            min="1"
            max="30"
            step="1"
            value={size}
            onChange={(e) => setSize(Number(e.target.value))}
            aria-label="Brush size"
          />
        </div>

        <div className="drawing-group" role="group" aria-label="Drawing history">
          <button type="button" onClick={undo} disabled={strokes.length === 0}>
            Undo
          </button>
          <button type="button" onClick={redo} disabled={redoStrokes.length === 0}>
            Redo
          </button>
          <button type="button" onClick={clear} disabled={strokes.length === 0}>
            Clear
          </button>
        </div>
      </div>
    </div>
  );
}
