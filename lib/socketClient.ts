"use client";

import { io, Socket } from "socket.io-client";
import { ClientToServerEvents, ServerToClientEvents } from "./types";

let socket: Socket<ServerToClientEvents, ClientToServerEvents> | null = null;

export function getSocket() {
  if (!socket) {
    socket = io({ autoConnect: true });
  }
  return socket;
}

// localStorage helpers to remember the player's identity per room.
const KEY = (code: string) => `bang:${code.toUpperCase()}`;

export function saveIdentity(code: string, playerId: string) {
  try {
    localStorage.setItem(KEY(code), playerId);
  } catch {}
}

export function loadIdentity(code: string): string | null {
  try {
    return localStorage.getItem(KEY(code));
  } catch {
    return null;
  }
}

export function saveName(name: string) {
  try {
    localStorage.setItem("bang:name", name);
  } catch {}
}

export function loadName(): string {
  try {
    return localStorage.getItem("bang:name") || "";
  } catch {
    return "";
  }
}
