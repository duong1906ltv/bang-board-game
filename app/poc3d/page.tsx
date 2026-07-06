"use client";

// Standalone proof-of-concept for a first-person 3D table (react-three-fiber).
// Uses MOCK data shaped exactly like the real PlayerView, so nothing here
// touches the game engine. Visit /poc3d to preview. The <Canvas> is loaded with
// ssr:false because Three.js needs the browser (WebGL / window).
import dynamic from "next/dynamic";
import type { Card } from "@/lib/cards";
import type { PlayerView, PlayerPublic, Character } from "@/lib/types";
import { CHARACTERS } from "@/lib/types";

const TableScene = dynamic(() => import("@/components/three/TableScene"), { ssr: false });

const card = (id: string, defId: string, name: string, suit: Card["suit"], rank: number): Card => ({
  id,
  defId,
  name,
  suit,
  rank,
});

const char = (id: string): Character | null => CHARACTERS.find((c) => c.id === id) ?? null;

const players: PlayerPublic[] = [
  { id: "you", name: "Bạn", seat: 0, isHost: true, isBot: false, connected: true, alive: true, hp: 4, maxHp: 4, handCount: 5, character: char("bart-cassidy"), hasPicked: true, role: null, isTurn: true, distance: null, equipment: [] },
  { id: "p1", name: "Marshal Joe", seat: 1, isHost: false, isBot: false, connected: true, alive: true, hp: 5, maxHp: 5, handCount: 3, character: char("slab-the-killer"), hasPicked: true, role: "sheriff", isTurn: false, distance: 1, equipment: [] },
  { id: "p2", name: "Kid", seat: 2, isHost: false, isBot: false, connected: true, alive: true, hp: 2, maxHp: 4, handCount: 4, character: char("willy-the-kid"), hasPicked: true, role: null, isTurn: false, distance: 2, equipment: [] },
  { id: "p3", name: "Rose", seat: 3, isHost: false, isBot: false, connected: true, alive: true, hp: 4, maxHp: 4, handCount: 2, character: char("rose-doolan"), hasPicked: true, role: null, isTurn: false, distance: 2, equipment: [] },
  { id: "p4", name: "Lucky", seat: 4, isHost: false, isBot: false, connected: true, alive: true, hp: 3, maxHp: 4, handCount: 6, character: char("lucky-duke"), hasPicked: true, role: null, isTurn: false, distance: 1, equipment: [] },
];

const view: PlayerView = {
  code: "POC3D",
  phase: "playing",
  hostId: "you",
  you: {
    id: "you",
    name: "Bạn",
    seat: 0,
    isHost: true,
    role: "outlaw",
    character: char("bart-cassidy"),
    hp: 4,
    maxHp: 4,
    hand: [
      card("h1", "bang", "Bang!", "hearts", 10),
      card("h2", "missed", "Missed!", "spades", 8),
      card("h3", "beer", "Beer", "hearts", 6),
      card("h4", "dynamite", "Dynamite", "clubs", 2),
      card("h5", "barrel", "Barrel", "diamonds", 12),
    ],
    equipment: [],
    alive: true,
    turnPhase: "play",
    range: 1,
    canBang: true,
  },
  players,
  turnSeat: 0,
  roleSetup: [],
  draft: null,
  pending: null,
  winner: null,
  checks: [],
  deckCount: 40,
  discardCount: 5,
  topDiscard: card("d1", "bang", "Bang!", "clubs", 7),
};

export default function Poc3DPage() {
  return (
    <div style={{ position: "fixed", inset: 0 }}>
      <div
        style={{
          position: "absolute",
          top: 12,
          left: 12,
          zIndex: 10,
          color: "#f2d29b",
          fontFamily: "system-ui, sans-serif",
          fontSize: 13,
          background: "rgba(0,0,0,0.5)",
          padding: "8px 12px",
          borderRadius: 8,
          maxWidth: 260,
        }}
      >
        <b>PoC 3D — góc nhìn thứ nhất</b>
        <br />
        Kéo chuột để xoay/nhìn quanh bàn · lăn để zoom · click lá bài (xem console).
      </div>
      <TableScene view={view} />
    </div>
  );
}
