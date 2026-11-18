import { signalingURL } from "../api";
import { DrawingTransport, encodeMessage, type DrawingMessage } from "./protocol";

export type Peer = { id: string; name: string; busy?: boolean };
export type Conversation = { id: string; peer: Peer; status: "inviting" | "incoming" | "connecting" | "connected" };
export type ChatMessage = DrawingMessage & { peerId: string; outgoing: boolean; delivery: "sending" | "delivered" | "unconfirmed" };
export type MessagingState = {
  status: "connecting" | "online" | "offline";
  self?: Peer;
  users: Peer[];
  conversation?: Conversation;
  selectedPeer?: Peer;
  messages: ChatMessage[];
  notice: string;
  authExpired: boolean;
};
export const initialState: MessagingState = {
  status: "connecting", users: [], messages: [], notice: "", authExpired: false,
};

export class MessagingClient {
  private state: MessagingState = { ...initialState };
  private update: (state: MessagingState) => void;
  private socket?: WebSocket;
  private peer?: RTCPeerConnection;
  private channel?: RTCDataChannel;
  private transport?: DrawingTransport;
  private iceServers: RTCIceServer[] = [];
  private candidates: RTCIceCandidateInit[] = [];
  private timer?: ReturnType<typeof setTimeout>;
  private stopped = false;

  constructor(update: (state: MessagingState) => void) { this.update = update; }

  private patch(patch: Partial<MessagingState>) {
    this.state = { ...this.state, ...patch };
    if (!this.stopped) this.update(this.state);
  }

  connect(token: string) {
    this.stopped = false;
    this.patch({ status: "connecting", users: [], conversation: undefined, notice: "", authExpired: false });
    if (!window.RTCPeerConnection || !window.isSecureContext) {
      this.patch({ status: "offline", notice: "Messaging requires a browser with WebRTC on HTTPS or localhost." });
      return;
    }
    const socket = new WebSocket(signalingURL());
    this.socket = socket;
    socket.onopen = () => socket.send(JSON.stringify({ type: "authenticate", token }));
    let queue = Promise.resolve();
    socket.onmessage = (event) => {
      queue = queue.then(async () => {
        if (!this.stopped && this.socket === socket) await this.handle(JSON.parse(event.data));
      }).catch(() => {
        if (!this.stopped && this.socket === socket) this.fail("Could not establish a peer connection. Please reconnect.");
      });
    };
    socket.onclose = (event) => {
      if (this.stopped || this.socket !== socket) return;
      this.closePeer();
      this.patch({ status: "offline", users: [], conversation: undefined, authExpired: event.code === 4001,
        notice: event.code === 4009 ? "Messaging is already open in another tab. Close it, then reconnect here." :
          event.code === 4001 ? "Your session expired. Please sign in again." : "Messaging disconnected. Reconnect to try again." });
    };
    socket.onerror = () => this.patch({ notice: "Could not reach the messaging server." });
  }

  private signal(message: object) {
    if (this.socket?.readyState !== WebSocket.OPEN) throw new Error("Messaging is offline.");
    this.socket.send(JSON.stringify(message));
  }

  private async handle(message: {
    type: string; self: Peer; users: Peer[]; iceServers: RTCIceServer[]; peer: Peer;
    session: string; initiator: boolean; description: RTCSessionDescriptionInit;
    candidate: RTCIceCandidateInit; reason: string; message: string;
  }) {
    switch (message.type) {
      case "ready":
        this.iceServers = message.iceServers;
        this.patch({ status: "online", self: message.self, notice: "" });
        break;
      case "presence":
        this.patch({ users: message.users.filter(user => user.id !== this.state.self?.id) });
        break;
      case "invited":
      case "invitation":
        this.patch({ selectedPeer: message.peer, conversation: { id: message.session, peer: message.peer,
          status: message.type === "invited" ? "inviting" : "incoming" }, notice: "" });
        break;
      case "accepted":
        this.closePeer();
        this.patch({ selectedPeer: message.peer, conversation: { id: message.session, peer: message.peer, status: "connecting" }, notice: "" });
        await this.startPeer(message.session, message.initiator);
        break;
      case "description": {
        const peer = this.peer;
        if (!peer || message.session !== this.state.conversation?.id) return;
        await peer.setRemoteDescription(message.description);
        if (peer !== this.peer) return;
        for (const candidate of this.candidates) await peer.addIceCandidate(candidate);
        this.candidates = [];
        if (message.description.type === "offer") {
          await peer.setLocalDescription(await peer.createAnswer());
          if (peer === this.peer) this.signal({ type: "description", session: message.session, description: peer.localDescription });
        }
        break;
      }
      case "ice":
        if (!this.peer || message.session !== this.state.conversation?.id) return;
        if (this.peer.remoteDescription) await this.peer.addIceCandidate(message.candidate);
        else if (this.candidates.length < 100) this.candidates.push(message.candidate);
        break;
      case "ended":
        if (message.session !== this.state.conversation?.id) return;
        this.closePeer();
        this.patch({ conversation: undefined, notice: message.reason });
        break;
      case "error": this.patch({ notice: message.message }); break;
    }
  }

  private async startPeer(session: string, initiator: boolean) {
    const peer = new RTCPeerConnection({ iceServers: this.iceServers });
    this.peer = peer;
    this.timer = setTimeout(() => this.fail("Connection timed out. Try again; this network may require a TURN relay."), 30_000);
    peer.onicecandidate = (event) => {
      if (event.candidate && this.peer === peer) {
        try { this.signal({ type: "ice", session, candidate: event.candidate.toJSON() }); }
        catch { this.fail("Messaging disconnected."); }
      }
    };
    peer.onconnectionstatechange = () => {
      if (this.peer !== peer) return;
      if (["failed", "disconnected", "closed"].includes(peer.connectionState)) this.fail("Peer disconnected. Invite them again to reconnect.");
    };
    peer.ondatachannel = (event) => {
      if (this.peer !== peer) return;
      if (this.channel || event.channel.label !== "sketchat-drawings-v1") { event.channel.close(); return; }
      this.attachChannel(event.channel, session);
    };
    if (initiator) {
      this.attachChannel(peer.createDataChannel("sketchat-drawings-v1", { ordered: true }), session);
      await peer.setLocalDescription(await peer.createOffer());
      if (this.peer === peer) this.signal({ type: "description", session, description: peer.localDescription });
    }
  }

  private attachChannel(channel: RTCDataChannel, session: string) {
    this.channel = channel;
    this.transport = new DrawingTransport(channel, message => {
      const conversation = this.state.conversation;
      if (!conversation || conversation.id !== session) return;
      this.patch({ messages: [...this.state.messages, { ...message, peerId: conversation.peer.id,
        outgoing: false, delivery: "delivered" as const }].slice(-100) });
    }, reason => this.fail(reason));
    channel.onopen = () => {
      const conversation = this.state.conversation;
      if (!conversation || conversation.id !== session) return;
      clearTimeout(this.timer);
      this.patch({ conversation: { ...conversation, status: "connected" }, notice: "" });
    };
    channel.onclose = () => { if (this.channel === channel) this.fail("Peer disconnected. Invite them again to reconnect."); };
    channel.onerror = () => { if (this.channel === channel) this.fail("Drawing transfer failed. Please reconnect."); };
  }

  invite(id: string) {
    this.signal({ type: "invite", to: id });
    this.patch({ selectedPeer: this.state.users.find(user => user.id === id), notice: "" });
  }

  reconnect(token: string) { this.dispose(); this.connect(token); }
  respond(accept: boolean) {
    if (this.state.conversation) this.signal({ type: accept ? "accept" : "reject", session: this.state.conversation.id });
  }
  leave() {
    if (this.state.conversation && this.socket?.readyState === WebSocket.OPEN) {
      this.signal({ type: "leave", session: this.state.conversation.id });
    }
    this.closePeer();
    this.patch({ conversation: undefined });
  }
  private fail(notice: string) { this.leave(); this.patch({ notice }); }

  async send(message: DrawingMessage) {
    const conversation = this.state.conversation;
    const transport = this.transport;
    if (conversation?.status !== "connected" || !transport) throw new Error("Connect with someone before sending.");
    encodeMessage(message);
    this.patch({ messages: [...this.state.messages, { ...message, peerId: conversation.peer.id, outgoing: true, delivery: "sending" as const }].slice(-100) });
    try {
      await transport.send(message);
      this.markDelivery(message.id, "delivered");
    } catch (error) {
      this.markDelivery(message.id, "unconfirmed");
      if (this.transport === transport) this.fail(error instanceof Error ? error.message : "Drawing transfer failed.");
      throw error;
    }
  }

  private markDelivery(id: string, delivery: ChatMessage["delivery"]) {
    this.patch({ messages: this.state.messages.map(message => message.id === id ? { ...message, delivery } : message) });
  }

  private closePeer() {
    clearTimeout(this.timer);
    this.transport?.close();
    this.transport = undefined;
    const channel = this.channel;
    this.channel = undefined;
    if (channel) { channel.onopen = channel.onclose = channel.onerror = null; channel.close(); }
    const peer = this.peer;
    this.peer = undefined;
    if (peer) { peer.onicecandidate = peer.onconnectionstatechange = peer.ondatachannel = null; peer.close(); }
    this.candidates = [];
  }

  dispose() {
    this.stopped = true;
    this.closePeer();
    if (this.socket) {
      this.socket.onmessage = this.socket.onclose = this.socket.onerror = null;
      const socket = this.socket;
      if (socket.readyState === WebSocket.CONNECTING) socket.onopen = () => socket.close();
      else socket.close();
    }
  }
}
