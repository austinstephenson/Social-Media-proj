import { useEffect, useImperativeHandle, useRef, useState, type PointerEvent, type Ref } from "react";
import "./DrawingCanvas.css";

const COLORS = [
  { name: "Black", value: "#111111" },
  { name: "Red", value: "#e53935" },
  { name: "Blue", value: "#1e63e9" },
  { name: "Orange", value: "#fb8c00" },
];

const SIZES = [
  { name: "Small", value: 3 },
  { name: "Medium", value: 8 },
  { name: "Large", value: 16 },
];

/** What a parent gets through `ref` so it can send or reset the drawing. */
export type DrawingCanvasHandle = {
  /** The drawing as a PNG data URL (white background), ready to send to the backend. */
  toDataURL: () => string;
  /** Wipe the canvas back to blank white. */
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
  const lastPoint = useRef<{ x: number; y: number } | null>(null);
  const [color, setColor] = useState(COLORS[0].value);
  const [size, setSize] = useState(SIZES[1].value);

  function fillWhite() {
    const ctx = canvasRef.current?.getContext("2d");
    if (!ctx) return;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, width, height);
  }

  // Start with a white background so the exported PNG isn't transparent.
  useEffect(fillWhite, [width, height]);

  useImperativeHandle(ref, () => ({
    toDataURL: () => canvasRef.current?.toDataURL("image/png") ?? "",
    clear: fillWhite,
  }));

  // Pointer position -> canvas pixels (the canvas may be displayed smaller than its real size).
  function pointFrom(e: PointerEvent<HTMLCanvasElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    return {
      x: ((e.clientX - rect.left) / rect.width) * width,
      y: ((e.clientY - rect.top) / rect.height) * height,
    };
  }

  function drawTo(point: { x: number; y: number }) {
    const ctx = canvasRef.current?.getContext("2d");
    const from = lastPoint.current;
    if (!ctx || !from) return;
    ctx.strokeStyle = color;
    ctx.lineWidth = size;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.beginPath();
    ctx.moveTo(from.x, from.y);
    ctx.lineTo(point.x, point.y); // a zero-length line with a round cap draws a dot
    ctx.stroke();
    lastPoint.current = point;
  }

  function handlePointerDown(e: PointerEvent<HTMLCanvasElement>) {
    if (e.button !== 0) return; // left mouse button, touch or pen only
    e.currentTarget.setPointerCapture(e.pointerId); // keep drawing if the pointer leaves the canvas
    const point = pointFrom(e);
    lastPoint.current = point;
    drawTo(point);
  }

  function handlePointerMove(e: PointerEvent<HTMLCanvasElement>) {
    if (lastPoint.current) drawTo(pointFrom(e));
  }

  function stopDrawing() {
    lastPoint.current = null;
  }

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
              aria-pressed={color === c.value}
              onClick={() => setColor(c.value)}
            />
          ))}
        </div>

        <div className="drawing-group" role="group" aria-label="Brush size">
          {SIZES.map((s) => (
            <button
              key={s.value}
              type="button"
              className="drawing-size"
              aria-label={s.name}
              aria-pressed={size === s.value}
              onClick={() => setSize(s.value)}
            >
              <span style={{ width: s.value, height: s.value }} />
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
