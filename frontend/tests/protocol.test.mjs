import test from "node:test";
import assert from "node:assert/strict";
import { DrawingTransport, encodeMessage, MessageAssembler, validDrawing } from "../src/messaging/protocol.ts";

const message = () => ({
  id: crypto.randomUUID(), sentAt: Date.now(), caption: "Hello 🎨",
  drawing: { version: 1, canvas: { width: 650, height: 450 },
    strokes: [{ id: "stroke-1", color: "#e53935", width: 8, points: [{ x: 100, y: 200 }] }] },
});

test("large drawings round-trip through bounded Unicode-safe frames", () => {
  const value = message();
  value.caption = "🎨".repeat(1000);
  value.drawing.strokes[0].points = Array.from({ length: 15_000 }, (_, i) => ({ x: i % 650, y: i % 450 }));
  const frames = encodeMessage(value);
  assert.ok(frames.length > 20);
  const assembler = new MessageAssembler();
  let decoded;
  for (const frame of frames) {
    assert.ok(Buffer.byteLength(frame) < 16_384);
    decoded = assembler.receive(frame);
  }
  assert.deepEqual(decoded, value);
});

test("invalid drawings and oversized content are rejected before send", () => {
  const value = message();
  value.drawing.strokes = [];
  assert.throws(() => encodeMessage(value), /Add a drawing/);
  for (const x of [-1, 651, Infinity, NaN, "1"]) {
    const invalid = message();
    invalid.drawing.strokes[0].points[0].x = x;
    assert.equal(validDrawing(invalid.drawing), false);
  }
  const invalid = message();
  invalid.drawing.strokes[0].color = "url(https://untrusted.example)";
  assert.equal(validDrawing(invalid.drawing), false);
  const large = message();
  large.drawing.strokes[0].points = Array.from({ length: 20_000 }, () => ({ x: 0.00012345678912345678, y: 0.00012345678912345678 }));
  assert.throws(() => encodeMessage(large), /too large/);
});

test("missing, duplicate, oversized and mismatched chunks are rejected", () => {
  const value = message();
  value.caption = "a".repeat(2000);
  const frames = encodeMessage(value);
  assert.throws(() => new MessageAssembler().receive(frames[1]), /Missing/);
  const duplicate = new MessageAssembler();
  duplicate.receive(frames[0]);
  assert.throws(() => duplicate.receive(frames[0]), /Out-of-order/);
  assert.throws(() => new MessageAssembler().receive("a".repeat(16_385)), /Invalid message frame/);
  const wrong = JSON.parse(encodeMessage(message())[0]);
  wrong.id = crypto.randomUUID();
  assert.throws(() => new MessageAssembler().receive(JSON.stringify(wrong)), /Invalid drawing message/);
  assert.throws(() => new MessageAssembler().receive(JSON.stringify({ ...wrong, total: 999_999 })), /Invalid message chunk/);
});

class Channel extends EventTarget {
  readyState = "open";
  bufferedAmount = 0;
  bufferedAmountLowThreshold = 0;
  onmessage = null;
  other;
  send(data) { queueMicrotask(() => this.other.onmessage?.({ data })); }
}

test("delivery waits for peer receipt and duplicate messages render only once", async () => {
  const a = new Channel(), b = new Channel();
  a.other = b; b.other = a;
  const received = [];
  const fail = (error) => assert.fail(error);
  const sender = new DrawingTransport(a, () => {}, fail);
  const receiver = new DrawingTransport(b, value => received.push(value), fail);
  const value = message();
  await sender.send(value);
  await sender.send(value);
  assert.deepEqual(received, [value]);
  sender.close(); receiver.close();
});

test("disconnect rejects a pending unacknowledged delivery", async () => {
  const a = new Channel(), b = new Channel();
  a.other = b;
  const sender = new DrawingTransport(a, () => {}, () => {});
  const sending = sender.send(message());
  const rejected = assert.rejects(sending, /Disconnected before delivery/);
  sender.close();
  await rejected;
});

test("sender respects backpressure before writing more chunks", async () => {
  const a = new Channel(), b = new Channel();
  a.other = b; b.other = a;
  a.bufferedAmount = 100_000;
  const received = [];
  const sender = new DrawingTransport(a, () => {}, assert.fail);
  const receiver = new DrawingTransport(b, value => received.push(value), assert.fail);
  const sending = sender.send(message());
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(received.length, 0);
  a.bufferedAmount = 0;
  a.dispatchEvent(new Event("bufferedamountlow"));
  await sending;
  assert.equal(received.length, 1);
  sender.close(); receiver.close();
});
