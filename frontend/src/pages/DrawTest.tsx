import { useRef, useState } from "react";
import { DrawingCanvas, type DrawingCanvasHandle } from "../components/DrawingCanvas";

function DrawTest() {
  const canvasRef = useRef<DrawingCanvasHandle>(null);
  const [jsonPreview, setJsonPreview] = useState<string | null>(null);
  const [pngPreview, setPngPreview] = useState<string | null>(null);

  function exportJSON() {
    setJsonPreview(canvasRef.current?.toJSON() ?? null);
  }

  function exportPNG() {
    setPngPreview(canvasRef.current?.toDataURL() ?? null);
  }

  function clearCanvas() {
    canvasRef.current?.clear();
    setJsonPreview(null);
    setPngPreview(null);
  }

  return (
    <div className="page">
      <h1>Canvas test</h1>
      <DrawingCanvas ref={canvasRef} />

      <div className="button-row">
        <button onClick={exportJSON}>Export JSON</button>
        <button onClick={exportPNG}>Export PNG</button>
        <button onClick={clearCanvas}>Clear</button>
      </div>

      {jsonPreview && (
        <>
          <p className="muted">Editable drawing data (JSON):</p>
          <pre style={{ maxWidth: "100%", overflowX: "auto", whiteSpace: "pre-wrap" }}>
            {JSON.stringify(JSON.parse(jsonPreview), null, 2)}
          </pre>
        </>
      )}

      {pngPreview && (
        <>
          <p className="muted">PNG preview:</p>
          <img
            src={pngPreview}
            alt="Exported drawing"
            style={{ border: "1px solid #ccc", maxWidth: "100%" }}
          />
        </>
      )}
    </div>
  );
}

export default DrawTest;
