
import { useState } from "react";
import {DrawingCanvas} from "../components/DrawingCanvas";
import "./DesktopWorkspace.css";

type Message = {
  id: number;
  sender: string;
  text?: string;
  drawing?: boolean;
  time: string;
};

const contacts = ["Kayla", "Will", "Alex", "Jordan"];

function DesktopWorkspace() {
  const [recipient, setRecipient] = useState("Kayla");
  const [showContacts, setShowContacts] = useState(false);
  const [messageText, setMessageText] = useState("");
  const [attachDrawing, setAttachDrawing] = useState(false);
  const [messages, setMessages] = useState<Message[]>([
    { id: 1, sender: "Will", text: "Hi!", time: "09:29" },
    { id: 2, sender: "Kayla", drawing: true, text: "What's up?", time: "09:32" },
  ]);

  function sendMessage() {
    if (!messageText.trim() && !attachDrawing) return;

    const newMessage: Message = {
      id: Date.now(),
      sender: "You",
      text: messageText.trim() || undefined,
      drawing: attachDrawing,
      time: new Date().toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
      }),
    };

    setMessages((current) => [...current, newMessage]);
    setMessageText("");
    setAttachDrawing(false);
  }

  function changeRecipient(name: string) {
    setRecipient(name);
    setShowContacts(false);
    setMessageText("");
    setAttachDrawing(false);
  }

  return (
    <div className="desktop-workspace">
      {/* LEFT: Drawing page */}
      <section className="drawing-page">
        <header className="page-header">
          <h1>Sketchat</h1>
          <span>Draw something to share!</span>
        </header>

        <div className="drawing-message-bar">
          <button onClick={() => setShowContacts(!showContacts)}>
            Contacts
          </button>

          <input
            value={messageText}
            onChange={(e) => setMessageText(e.target.value)}
            placeholder="Message..."
            onKeyDown={(e) => {
              if (e.key === "Enter") sendMessage();
            }}
          />

          <button
            className={attachDrawing ? "attachment selected" : "attachment"}
            title="Attach drawing"
            onClick={() => setAttachDrawing(!attachDrawing)}
          >
            ✎
          </button>

          <button className="send-button" onClick={sendMessage}>
            Send
          </button>
        </div>

        {showContacts && (
          <div className="contact-menu">
            <strong>Start a conversation</strong>
            {contacts.map((name) => (
              <button key={name} onClick={() => changeRecipient(name)}>
                {name}
              </button>
            ))}
          </div>
        )}

        <div className="drawing-area">
          <DrawingCanvas width={650} height={550} />
        </div>

        {attachDrawing && (
          <p className="attachment-hint">
            Drawing selected. Press Send to include it in your message.
          </p>
        )}
      </section>

      {/* RIGHT: Personal DM page */}
      <section className="dm-page">
        {recipient ? (
          <>
            <header className="dm-header">
              <div>
                <h2>{recipient}</h2>
                <span>Direct messages</span>
              </div>

              <div className="dm-header-buttons">
                <button
                  onClick={() => setShowContacts(!showContacts)}
                  title="Change recipient"
                >
                  Change
                </button>

                <button
                  onClick={() => setRecipient("")}
                  title="Close conversation"
                >
                  ✕
                </button>
              </div>
            </header>

            <div className="message-list">
              <p className="connection-notice">
                You connected with {recipient}!
              </p>

              {messages.map((message) => (
                <article
                  key={message.id}
                  className={
                    message.sender === "You"
                      ? "message outgoing"
                      : "message incoming"
                  }
                >
                  <div className="message-info">
                    <strong>{message.sender}</strong>
                    <span>{message.time}</span>
                  </div>

                  {message.drawing && (
                    <div className="drawing-message">
                      <span>✎</span>
                      <p>Drawing attached</p>
                    </div>
                  )}

                  {message.text && (
                    <div className="text-message">{message.text}</div>
                  )}
                </article>
              ))}
            </div>

            <form
              className="dm-composer"
              onSubmit={(e) => {
                e.preventDefault();
                sendMessage();
              }}
            >
              <input
                value={messageText}
                onChange={(e) => setMessageText(e.target.value)}
                placeholder={`Message ${recipient}...`}
              />

              <button
                type="button"
                className={attachDrawing ? "attachment selected" : "attachment"}
                onClick={() => setAttachDrawing(!attachDrawing)}
                title="Attach drawing"
              >
                ✎
              </button>

              <button type="submit" className="send-button">
                Send
              </button>
            </form>
          </>
        ) : (
          <div className="closed-conversation">
            <h2>No conversation selected</h2>
            <p>Choose someone to start drawing and chatting.</p>
            <button
              className="send-button"
              onClick={() => setShowContacts(true)}
            >
              Choose contact
            </button>
          </div>
        )}
      </section>
    </div>
  );
}

export default DesktopWorkspace;
