import asyncio
import json
import time
from collections import deque
from dataclasses import dataclass, field
from typing import Annotated, Literal
from uuid import uuid4

from bson import ObjectId
from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from jose import JWTError, jwt
from pydantic import BaseModel, ConfigDict, Field, TypeAdapter, ValidationError

from config import settings
import routes_auth

router = APIRouter()
MAX_SIGNAL_BYTES = 64 * 1024
INVITE_SECONDS = 30


class StrictModel(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)


class Invite(StrictModel):
    type: Literal["invite"]
    to: str = Field(min_length=24, max_length=24)


class SessionCommand(StrictModel):
    type: Literal["accept", "reject", "leave"]
    session: str = Field(min_length=36, max_length=36)


class Description(StrictModel):
    type: Literal["offer", "answer"]
    sdp: str = Field(min_length=1, max_length=48_000)


class SdpSignal(StrictModel):
    type: Literal["description"]
    session: str = Field(min_length=36, max_length=36)
    description: Description


class Candidate(StrictModel):
    candidate: str = Field(max_length=4096)
    sdpMid: str | None = Field(default=None, max_length=256)
    sdpMLineIndex: int | None = Field(default=None, ge=0, le=65535)
    usernameFragment: str | None = Field(default=None, max_length=256)


class IceSignal(StrictModel):
    type: Literal["ice"]
    session: str = Field(min_length=36, max_length=36)
    candidate: Candidate


command_adapter = TypeAdapter(Annotated[Invite | SessionCommand | SdpSignal | IceSignal, Field(discriminator="type")])


@dataclass
class Client:
    socket: WebSocket
    id: str
    name: str
    lock: asyncio.Lock = field(default_factory=asyncio.Lock)

    async def send(self, message):
        async with self.lock:
            try:
                await asyncio.wait_for(self.socket.send_json(message), timeout=5)
            except (WebSocketDisconnect, RuntimeError, OSError, TimeoutError):
                pass

    def public(self):
        return {"id": self.id, "name": self.name}


@dataclass
class Session:
    id: str
    caller: str
    callee: str
    accepted: bool = False
    offered: bool = False
    answered: bool = False
    timer: asyncio.Task | None = None


class SignalingHub:
    def __init__(self):
        self.clients: dict[str, Client] = {}
        self.sessions: dict[str, Session] = {}
        self.memberships: dict[str, str] = {}

    async def presence(self):
        users = [{**client.public(), "busy": client.id in self.memberships}
                 for client in self.clients.values()]
        await asyncio.gather(*(client.send({"type": "presence", "users": users})
                               for client in list(self.clients.values())))

    async def end(self, session_id, reason):
        session = self.sessions.pop(session_id, None)
        if not session:
            return
        if session.timer and session.timer is not asyncio.current_task():
            session.timer.cancel()
        for user_id in (session.caller, session.callee):
            self.memberships.pop(user_id, None)
        await asyncio.gather(*(self.clients[user_id].send(
            {"type": "ended", "session": session_id, "reason": reason})
            for user_id in (session.caller, session.callee) if user_id in self.clients))
        await self.presence()

    async def expire_invite(self, session_id):
        await asyncio.sleep(INVITE_SECONDS)
        await self.end(session_id, "Invitation expired.")

    async def handle(self, client: Client, command):
        if isinstance(command, Invite):
            target = self.clients.get(command.to)
            if not target or target.id == client.id:
                await client.send({"type": "error", "message": "That person is no longer available."})
                return
            if client.id in self.memberships or target.id in self.memberships:
                await client.send({"type": "error", "message": "One of you is already in a conversation."})
                return
            session = Session(str(uuid4()), client.id, target.id)
            self.sessions[session.id] = session
            self.memberships[client.id] = self.memberships[target.id] = session.id
            session.timer = asyncio.create_task(self.expire_invite(session.id))
            await client.send({"type": "invited", "session": session.id, "peer": target.public()})
            await target.send({"type": "invitation", "session": session.id, "peer": client.public()})
            await self.presence()
            return

        session = self.sessions.get(command.session)
        if not session or self.memberships.get(client.id) != session.id:
            await client.send({"type": "error", "message": "This conversation has ended."})
            return
        if command.type in ("leave", "reject"):
            if command.type == "reject" and (session.accepted or client.id != session.callee):
                return
            await self.end(session.id, "Invitation declined." if command.type == "reject" else "Conversation disconnected.")
        elif command.type == "accept":
            if client.id != session.callee or session.accepted:
                return
            session.accepted = True
            session.timer.cancel()
            for user_id, peer_id in ((session.callee, session.caller), (session.caller, session.callee)):
                if user_id in self.clients and peer_id in self.clients:
                    await self.clients[user_id].send({"type": "accepted", "session": session.id,
                        "peer": self.clients[peer_id].public(), "initiator": user_id == session.caller})
        elif session.accepted:
            target_id = session.callee if client.id == session.caller else session.caller
            if isinstance(command, SdpSignal):
                if command.description.type == "offer":
                    if client.id != session.caller or session.offered:
                        return
                    session.offered = True
                else:
                    if client.id != session.callee or not session.offered or session.answered:
                        return
                    session.answered = True
            target = self.clients.get(target_id)
            if target:
                await target.send({**command.model_dump(), "from": client.id})


hub = SignalingHub()


async def receive_json(socket: WebSocket, timeout: float):
    raw = await asyncio.wait_for(socket.receive_text(), timeout=max(0, timeout))
    if len(raw.encode("utf-8")) > MAX_SIGNAL_BYTES:
        raise ValueError("Signal too large")
    return json.loads(raw)


@router.websocket("/ws")
async def signaling(socket: WebSocket):
    if socket.headers.get("origin") not in settings.allowed_origins:
        await socket.close(code=1008)
        return
    await socket.accept()
    client = None
    try:
        auth = await receive_json(socket, 10)
        if not isinstance(auth, dict) or auth.get("type") != "authenticate" or not isinstance(auth.get("token"), str):
            raise ValueError("Authentication required")
        payload = jwt.decode(auth["token"], settings.jwt_secret, algorithms=["HS256"],
                             options={"require_exp": True, "require_sub": True})
        user_id = payload.get("id")
        if not isinstance(user_id, str) or not ObjectId.is_valid(user_id):
            raise ValueError("Invalid identity")
        user = await asyncio.wait_for(routes_auth.user_collection.find_one({"_id": ObjectId(user_id)}), 10)
        if not user or user["email"] != payload["sub"]:
            raise ValueError("Account unavailable")
        if user_id in hub.clients:
            await socket.close(code=4009, reason="Messaging is already open in another tab.")
            return
        client = Client(socket, user_id, user["user_name"])
        hub.clients[user_id] = client
        await client.send({"type": "ready", "self": client.public(), "iceServers": settings.webrtc_ice_servers})
        await hub.presence()
        recent = deque()
        while True:
            message = await receive_json(socket, float(payload["exp"]) - time.time())
            now = time.monotonic()
            while recent and recent[0] < now - 10:
                recent.popleft()
            if len(recent) >= 120:
                await socket.close(code=1008, reason="Too many signals. Reconnect shortly.")
                break
            recent.append(now)
            try:
                command = command_adapter.validate_python(message)
            except ValidationError:
                await client.send({"type": "error", "message": "Invalid signaling message."})
                continue
            await hub.handle(client, command)
    except (JWTError, ValueError, TypeError, KeyError, TimeoutError):
        await socket.close(code=4001, reason="Session invalid or expired. Please sign in again.")
    except WebSocketDisconnect:
        pass
    finally:
        if client and hub.clients.get(client.id) is client:
            del hub.clients[client.id]
            session_id = hub.memberships.get(client.id)
            if session_id:
                await hub.end(session_id, "The other person went offline.")
            else:
                await hub.presence()
