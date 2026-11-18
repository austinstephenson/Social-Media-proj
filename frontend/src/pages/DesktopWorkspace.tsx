import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { DrawingCanvas, type DrawingCanvasHandle } from "../components/DrawingCanvas";
import { DrawingPreview } from "../components/DrawingPreview";
import { MessagingClient, initialState } from "../messaging/client";
import "./DesktopWorkspace.css";

const connectionLabels = {
  inviting: "Waiting for them to accept…", incoming: "Would like to draw with you",
  connecting: "Connecting…", connected: "Connected · Ready to share drawings",
};

function DesktopWorkspace() {
  const navigate = useNavigate();
  const canvas = useRef<DrawingCanvasHandle>(null);
  const client = useRef<MessagingClient | null>(null);
  const endOfMessages = useRef<HTMLDivElement>(null);
  const [state, setState] = useState(initialState);
  const [caption, setCaption] = useState("");
  const [error, setError] = useState("");
  const [sending, setSending] = useState(false);
  const [hasDrawing, setHasDrawing] = useState(false);
  const conversation = state.conversation;
  const recipient = conversation?.peer ?? state.selectedPeer;
  const messages = state.messages.filter(message => message.peerId === recipient?.id);
  const connected = conversation?.status === "connected";

  useEffect(() => {
    const messaging = new MessagingClient(setState);
    client.current = messaging;
    messaging.connect(localStorage.getItem("token") ?? "");
    return () => { messaging.dispose(); client.current = null; };
  }, []);

  useEffect(() => {
    endOfMessages.current?.scrollIntoView({ block: "nearest" });
  }, [state.messages, recipient?.id]);

  function run(action: () => void) {
    setError("");
    try { action(); } catch (cause) { setError(cause instanceof Error ? cause.message : "Please try again."); }
  }

  async function sendDrawing() {
    if (!canvas.current || !client.current || sending) return;
    setError("");
    setSending(true);
    try {
      await client.current.send({ id: crypto.randomUUID(), sentAt: Date.now(),
        caption: caption.trim(), drawing: JSON.parse(canvas.current.toJSON()) });
      canvas.current?.clear();
      setCaption("");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not send your drawing.");
    } finally { setSending(false); }
  }

  function signOut() {
    client.current?.dispose();
    localStorage.removeItem("token");
    navigate("/login", { replace: true });
  }

  return (
    <main className="desktop-workspace">
      <section className="drawing-page" aria-label="Drawing composer">
        <header className="page-header workspace-heading">
          <div><h1>Sketchat</h1><span>A little drawing goes a long way.</span></div>
          <button className="quiet-button" onClick={signOut}>Sign out</button>
        </header>

        <div className="presence-heading">
          <strong>{state.self ? `Hello, ${state.self.name}` : "Your drawing room"}</strong>
          <span className={`presence-status ${state.status}`} role="status">{state.status}</span>
        </div>
        <p className="workspace-help">Choose someone online and invite them to connect.</p>
        <div className="online-contacts" aria-label="Online people">
          {state.users.length === 0 && <p>{state.status === "online" ? "No one else is here yet. Ask a friend to open Sketchat." : "Waiting for the messaging server…"}</p>}
          {state.users.map(user => (
            <button key={user.id} className="contact-button" disabled={!!conversation || user.busy || state.status !== "online" || sending}
              onClick={() => run(() => client.current?.invite(user.id))}>
              <span>{user.name} <small>#{user.id.slice(-6)}</small></span>
              <small>{user.busy ? "In a conversation" : "Invite to draw"}</small>
            </button>
          ))}
        </div>

        {(error || state.notice) && <p className="workspace-notice" role="alert">{error || state.notice}</p>}
        {state.status === "offline" && (
          <button className="quiet-button reconnect-button" onClick={() => {
            if (state.authExpired) signOut();
            else run(() => client.current?.reconnect(localStorage.getItem("token") ?? ""));
          }}>{state.authExpired ? "Sign in again" : "Reconnect messaging"}</button>
        )}

        <fieldset className="drawing-composer" disabled={sending}>
          <legend>Draw your message</legend>
          <div className="drawing-area" inert={sending}>
            <DrawingCanvas ref={canvas} width={650} height={450} onChange={setHasDrawing} />
          </div>
          <form className="dm-composer" onSubmit={event => { event.preventDefault(); void sendDrawing(); }}>
            <label className="caption-label" htmlFor="drawing-caption">Add a caption (optional)
              <input id="drawing-caption" value={caption} maxLength={2000}
                onChange={event => setCaption(event.target.value)} placeholder="A few words for your sketch…" />
            </label>
            <button type="submit" className="send-button" disabled={!connected || !hasDrawing || sending}>
              {sending ? "Sending…" : "Send drawing"}
            </button>
          </form>
        </fieldset>
        <p className="workspace-help">{connected ? `Your drawing will be sent to ${conversation.peer.name}.` : "You can draw now. Connect with someone to send it."}</p>
      </section>

      <section className="dm-page" aria-label="Conversation">
        <header className="dm-header">
          <div><h2>{recipient?.name ?? "Draw together"}</h2>
            <span role="status">{conversation ? connectionLabels[conversation.status] : "Start a conversation with someone online"}</span></div>
          {conversation && <button className="quiet-button" onClick={() => run(() => {
            client.current?.leave();
          })}>{conversation.status === "inviting" ? "Cancel invitation" : "Disconnect"}</button>}
        </header>

        {conversation?.status === "incoming" && <div className="invitation-card" role="region" aria-label="Incoming invitation">
          <p><strong>{conversation.peer.name}</strong> wants to exchange drawings with you.</p>
          <button className="send-button" onClick={() => run(() => client.current?.respond(true))}>Accept invitation</button>
          <button className="quiet-button" onClick={() => run(() => {
            client.current?.respond(false);
          })}>Decline</button>
        </div>}

        <div className="message-list" role="log" aria-label="Drawing messages" aria-live="polite">
          {!messages.length && <div className="empty-messages">
            <span aria-hidden="true">✎</span><h3>Say it with a sketch</h3>
            <p>Your drawings and captions will appear here.</p>
          </div>}
          {messages.map(message => (
            <article key={message.id} className={`message ${message.outgoing ? "outgoing" : "incoming"}`}>
              <div className="message-info"><strong>{message.outgoing ? "You" : recipient?.name}</strong>
                <time dateTime={new Date(message.sentAt).toISOString()}>{new Date(message.sentAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</time></div>
              <DrawingPreview drawing={message.drawing} />
              {message.caption && <div className="text-message">{message.caption}</div>}
              {message.outgoing && <small className={`delivery-status ${message.delivery}`}>
                {message.delivery === "delivered" ? "Delivered" : message.delivery === "sending" ? "Sending…" : "Delivery unconfirmed"}
              </small>}
            </article>
          ))}
          <div ref={endOfMessages} />
        </div>
        <p className="connection-notice">Drawings travel over an encrypted peer connection. Both people must stay online. Only the latest 100 messages are kept in this tab; refreshing clears them.</p>
      </section>
    </main>
  );
}

export default DesktopWorkspace;
