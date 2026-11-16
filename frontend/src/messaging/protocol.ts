import type { DrawingData } from "../components/DrawingCanvas";

export const MAX_MESSAGE_BYTES = 1_000_000;
const CHUNK_LENGTH = 2000;
const MAX_CHUNKS = Math.ceil(MAX_MESSAGE_BYTES / CHUNK_LENGTH);
const encoder = new TextEncoder();

export type DrawingMessage = {
  id: string;
  sentAt: number;
  caption: string;
  drawing: DrawingData;
};

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function validDrawing(value: unknown): value is DrawingData {
  if (!record(value) || value.version !== 1 || !record(value.canvas) ||
      !Array.isArray(value.strokes) || !value.strokes.length || value.strokes.length > 1000) return false;
  const { width, height } = value.canvas;
  if (typeof width !== "number" || typeof height !== "number" ||
      !Number.isFinite(width) || !Number.isFinite(height) ||
      width < 1 || height < 1 || width > 2048 || height > 2048) return false;
  let points = 0;
  return value.strokes.every((stroke: unknown) => {
    if (!record(stroke) || typeof stroke.id !== "string" || stroke.id.length > 100 ||
        typeof stroke.color !== "string" || !/^#[\da-f]{6}$/i.test(stroke.color) ||
        typeof stroke.width !== "number" || !Number.isFinite(stroke.width) || stroke.width < 1 || stroke.width > 30 ||
        !Array.isArray(stroke.points) || !stroke.points.length) return false;
    points += stroke.points.length;
    return points <= 20_000 && stroke.points.every((point: unknown) =>
      record(point) && typeof point.x === "number" && typeof point.y === "number" &&
      Number.isFinite(point.x) && Number.isFinite(point.y) &&
      point.x >= 0 && point.x <= width && point.y >= 0 && point.y <= height);
  });
}

export function validMessage(value: unknown): value is DrawingMessage {
  return record(value) && typeof value.id === "string" && /^[\da-f-]{36}$/i.test(value.id) &&
    typeof value.sentAt === "number" && Number.isFinite(value.sentAt) && value.sentAt > 0 && value.sentAt < 8.64e15 &&
    typeof value.caption === "string" && value.caption.length <= 2000 && validDrawing(value.drawing);
}

export function encodeMessage(message: DrawingMessage): string[] {
  if (!validMessage(message)) throw new Error("Add a drawing first. Drawings can contain up to 1,000 strokes and 20,000 points.");
  const json = JSON.stringify(message);
  if (encoder.encode(json).length > MAX_MESSAGE_BYTES) throw new Error("This drawing is too large. Try a simpler sketch.");
  const total = Math.ceil(json.length / CHUNK_LENGTH);
  return Array.from({ length: total }, (_, index) => JSON.stringify({
    type: "chunk", id: message.id, index, total, data: json.slice(index * CHUNK_LENGTH, (index + 1) * CHUNK_LENGTH),
  }));
}

export class MessageAssembler {
  private pending?: { id: string; total: number; parts: string[]; bytes: number; started: number };

  receive(raw: unknown): DrawingMessage | { ack: string } | undefined {
    if (typeof raw !== "string" || encoder.encode(raw).length > 16_384) throw new Error("Invalid message frame.");
    const frame: unknown = JSON.parse(raw);
    if (!record(frame) || typeof frame.id !== "string" || !/^[\da-f-]{36}$/i.test(frame.id)) throw new Error("Invalid message ID.");
    if (frame.type === "ack") return { ack: frame.id };
    if (frame.type !== "chunk" || !Number.isInteger(frame.index) || !Number.isInteger(frame.total) ||
        typeof frame.total !== "number" || frame.total < 1 || frame.total > MAX_CHUNKS ||
        typeof frame.data !== "string" || frame.data.length > CHUNK_LENGTH) throw new Error("Invalid message chunk.");
    if (this.pending && Date.now() - this.pending.started > 30_000) this.pending = undefined;
    if (!this.pending) {
      if (frame.index !== 0) throw new Error("Missing message chunk.");
      this.pending = { id: frame.id, total: frame.total, parts: [], bytes: 0, started: Date.now() };
    }
    const pending = this.pending;
    if (frame.id !== pending.id || frame.total !== pending.total || frame.index !== pending.parts.length) {
      throw new Error("Out-of-order message chunk.");
    }
    pending.bytes += encoder.encode(frame.data).length;
    if (pending.bytes > MAX_MESSAGE_BYTES) throw new Error("Drawing exceeds the size limit.");
    pending.parts.push(frame.data);
    if (pending.parts.length !== pending.total) return;
    this.pending = undefined;
    const message: unknown = JSON.parse(pending.parts.join(""));
    if (!validMessage(message) || message.id !== pending.id) throw new Error("Invalid drawing message.");
    return message;
  }
}

function waitForBuffer(channel: RTCDataChannel): Promise<void> {
  if (channel.readyState !== "open") return Promise.reject(new Error("The connection closed."));
  if (channel.bufferedAmount <= 64 * 1024) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const finish = (error?: Error) => {
      clearTimeout(timer);
      channel.removeEventListener("bufferedamountlow", onLow);
      channel.removeEventListener("close", onClose);
      channel.removeEventListener("error", onClose);
      if (error) reject(error); else resolve();
    };
    const onLow = () => finish();
    const onClose = () => finish(new Error("The connection closed during sending."));
    const timer = setTimeout(() => finish(new Error("Sending timed out.")), 15_000);
    channel.addEventListener("bufferedamountlow", onLow);
    channel.addEventListener("close", onClose);
    channel.addEventListener("error", onClose);
  });
}

export class DrawingTransport {
  private assembler = new MessageAssembler();
  private pending = new Map<string, { resolve: () => void; reject: (error: Error) => void; timer: ReturnType<typeof setTimeout> }>();
  private seen = new Set<string>();
  private sending = false;
  private channel: RTCDataChannel;

  constructor(channel: RTCDataChannel, receive: (message: DrawingMessage) => void, fail: (message: string) => void) {
    this.channel = channel;
    channel.bufferedAmountLowThreshold = 64 * 1024;
    channel.onmessage = (event) => {
      try {
        const result = this.assembler.receive(event.data);
        if (!result) return;
        if ("ack" in result) {
          const pending = this.pending.get(result.ack);
          if (pending) { clearTimeout(pending.timer); this.pending.delete(result.ack); pending.resolve(); }
        } else {
          if (!this.seen.has(result.id)) {
            receive(result);
            this.seen.add(result.id);
            if (this.seen.size > 500) this.seen.delete(this.seen.values().next().value!);
          }
          channel.send(JSON.stringify({ type: "ack", id: result.id }));
        }
      } catch {
        fail("The peer sent an invalid message. The connection was closed.");
      }
    };
  }

  async send(message: DrawingMessage): Promise<void> {
    if (this.sending) throw new Error("A drawing is already being sent.");
    const frames = encodeMessage(message);
    this.sending = true;
    const delivered = new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(message.id);
        reject(new Error("Delivery was not confirmed. Your drawing has been kept."));
      }, 30_000);
      this.pending.set(message.id, { resolve, reject, timer });
    });
    void delivered.catch(() => {});
    try {
      for (const frame of frames) {
        await waitForBuffer(this.channel);
        this.channel.send(frame);
      }
      await delivered;
    } finally {
      const pending = this.pending.get(message.id);
      if (pending) { clearTimeout(pending.timer); this.pending.delete(message.id); }
      this.sending = false;
    }
  }

  close() {
    for (const pending of this.pending.values()) {
      clearTimeout(pending.timer);
      pending.reject(new Error("Disconnected before delivery was confirmed. Your drawing has been kept."));
    }
    this.pending.clear();
    this.channel.onmessage = null;
  }
}
