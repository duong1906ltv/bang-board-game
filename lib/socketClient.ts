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

// Most-recent-first list of room codes this browser has an identity for. Needed
// because quick-join has no code to go on: it asks the server "is any of these
// seats still mine?" before matchmaking. Server restarts wipe every room but not
// localStorage, so this is capped — otherwise it grows forever and we'd offer the
// server a pile of codes for rooms that stopped existing weeks ago.
const RECENT = "bang:recent";
const RECENT_MAX = 8;

function recentCodes(): string[] {
  try {
    const raw = JSON.parse(localStorage.getItem(RECENT) || "[]");
    return Array.isArray(raw) ? raw.filter((c): c is string => typeof c === "string") : [];
  } catch {
    return [];
  }
}

function noteRecent(code: string) {
  const c = code.toUpperCase();
  const next = [c, ...recentCodes().filter((x) => x !== c)].slice(0, RECENT_MAX);
  try {
    localStorage.setItem(RECENT, JSON.stringify(next));
  } catch {}
}

// The seats to offer quick-join, newest first. A code with no stored playerId is
// dropped rather than sent as an empty id, which would match nothing anyway.
export function loadSeats(): { code: string; playerId: string }[] {
  return recentCodes()
    .map((code) => ({ code, playerId: loadIdentity(code) || "" }))
    .filter((s) => s.playerId);
}

export function saveIdentity(code: string, playerId: string) {
  try {
    localStorage.setItem(KEY(code), playerId);
  } catch {}
  noteRecent(code);
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
