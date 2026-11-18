import type { DrawingData } from "./DrawingCanvas";

export function DrawingPreview({ drawing }: { drawing: DrawingData }) {
  return (
    <svg className="drawing-preview" viewBox={`0 0 ${drawing.canvas.width} ${drawing.canvas.height}`}
      role="img" aria-label="Drawing message" xmlns="http://www.w3.org/2000/svg">
      <rect width="100%" height="100%" fill="white" />
      {drawing.strokes.map((stroke, index) => stroke.points.length === 1 ? (
        <circle key={index} cx={stroke.points[0].x} cy={stroke.points[0].y} r={stroke.width / 2} fill={stroke.color} />
      ) : (
        <polyline key={index} points={stroke.points.map(point => `${point.x},${point.y}`).join(" ")}
          fill="none" stroke={stroke.color} strokeWidth={stroke.width} strokeLinecap="round" strokeLinejoin="round" />
      ))}
    </svg>
  );
}
