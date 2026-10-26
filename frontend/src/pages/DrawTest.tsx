import { useRef, useState } from "react";
import { DrawingCanvas, type DrawingCanvasHandle } from "../components/DrawingCanvas";

function DrawTest() {
  const canvasRef = useRef<DrawingCanvasHandle>(null);
  const [preview, setPreview] = useState<string | null>(null);

  return (
    <div className="page">
      <h1>Canvas test</h1>
      <DrawingCanvas ref={canvasRef} />

      <div className="button-row">
        <button onClick={() => setPreview(canvasRef.current?.toDataURL() ?? null)}>
          Export PNG
        </button>
        <button onClick={() => { canvasRef.current?.clear(); setPreview(null); }}>
          Clear
        </button>
      </div>

      {preview && (
        <>
          <p className="muted">Exported image:</p>
          <img src={preview} alt="Exported drawing" style={{ border: "1px solid #ccc", maxWidth: "100%" }} />
        </>
      )}
    </div>
  );
}

export default DrawTest;