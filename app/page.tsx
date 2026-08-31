"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getSocket, saveIdentity, saveName, loadName, loadSeats, saveLook, loadLook } from "@/lib/socketClient";
import type { Look, LobbySummary, MySeat } from "@/lib/types";
import { L, useLocale, initLocale, getLocale, tError } from "@/lib/i18n";
import type { GameError } from "@/lib/errors";
import { LangToggle } from "@/components/LangToggle";
import { RoomList } from "@/components/RoomList";

export default function Home() {
  const router = useRouter();
  const locale = useLocale();
  const [name, setName] = useState("");
  const [look, setLook] = useState<Look | null>(null);
  const [code, setCode] = useState("");
  const [error, setError] = useState<GameError | string | null>(null);
  const [busy, setBusy] = useState(false);
  const [lobbies, setLobbies] = useState<LobbySummary[]>([]);
  const [seats, setSeats] = useState<MySeat[]>([]);
  // Room codes are an escape hatch (a private game with people you already know),
  // not the way in — so they stay folded away.
  const [manual, setManual] = useState(false);

  useEffect(() => {
    initLocale();
    setName(loadName());
    setLook(loadLook());
  }, []);

  // Re-entered on `connect`, not just on mount: a server restart drops the
  // subscription while the page stays exactly where it is.
  useEffect(() => {
    const socket = getSocket();
    const onList = (list: LobbySummary[]) => setLobbies(list);
    const enter = () =>
      socket.emit("enterHome", { seats: loadSeats() }, (res) => {
        setLobbies(res.lobbies);
        setSeats(res.seats);
      });
    socket.on("roomList", onList);
    socket.on("connect", enter);
    if (socket.connected) enter();
    return () => {
      socket.off("roomList", onList);
      socket.off("connect", enter);
      socket.emit("leaveHome");
    };
  }, []);

  const noResponse = () => setError(L(getLocale(), "Máy chủ không phản hồi, thử lại", "Server didn't respond, try again"));
  const cantJoin = () => L(getLocale(), "Không vào được phòng", "Couldn't join the room");

  // Saves as a side effect, so the name they used is the one they get next time.
  function takeName(): string | null {
    const n = name.trim();
    if (!n) {
      setError(L(getLocale(), "Nhập tên trước đã", "Enter your name first"));
      return null;
    }
    saveName(n);
    return n;
  }

  // `isPrivate` decides whether the room shows up in everyone else's browser.
  function create(isPrivate: boolean) {
    const n = takeName();
    if (!n) return;
    setBusy(true);
    setError(null);
    // .timeout() so a lost/slow connection surfaces an error instead of leaving
    // the button disabled forever. On success we navigate away (busy stays set).
    getSocket().timeout(8000).emit("createRoom", { name: n, look: look ?? undefined, private: isPrivate }, (err, res) => {
      if (err || !res) { setBusy(false); return noResponse(); }
      saveIdentity(res.code, res.playerId);
      router.push(`/room/${res.code}`);
    });
  }

  function join(target: string) {
    const n = takeName();
    if (!n) return;
    const c = target.toUpperCase().trim();
    if (c.length < 4) return setError(L(getLocale(), "Mã phòng gồm 4 ký tự", "Room code is 4 characters"));
    setBusy(true);
    setError(null);
    getSocket().timeout(8000).emit("joinRoom", { code: c, name: n, look: look ?? undefined }, (err, res) => {
      setBusy(false);
      if (err || !res) return noResponse();
      // The room filled up or started while the list was on screen. The server
      // pushes a fresh list either way, so the error is all that has to be said.
      if (!res.ok || !res.playerId) return setError(res.error ?? cantJoin());
      saveIdentity(c, res.playerId);
      router.push(`/room/${c}`);
    });
  }

  // Back into a seat this browser still owns, mid-game. Nothing else offers this:
  // a refresh during a game leaves a character at the table holding cards, and the
  // room code is the only other way back to it.
  function resume(seat: MySeat) {
    setBusy(true);
    setError(null);
    getSocket().timeout(8000).emit("rejoin", { code: seat.code, playerId: seat.playerId, look: look ?? undefined }, (err, res) => {
      setBusy(false);
      if (err || !res) return noResponse();
      if (!res.ok) {
        // The seat was taken back or the room is gone — drop the offer rather than
        // leave a button that cannot work.
        setSeats((prev) => prev.filter((s) => s.code !== seat.code));
        return setError(res.error ?? cantJoin());
      }
      saveIdentity(seat.code, seat.playerId);
      router.push(`/room/${seat.code}`);
    });
  }

  return (
    <main className="center">
      <div style={{ position: "absolute", top: 16, right: 16 }}>
        <LangToggle padding="6px 12px" />
      </div>
      <div className="moon">🤠</div>
      <h1>Bang!</h1>
      <p className="muted">{L(locale, "Game bài Viễn Tây online · 4–7 người", "Wild West card game online · 4–7 players")}</p>

      <div className="card">
        <label htmlFor="name">{L(locale, "Tên của bạn", "Your name")}</label>
        <input id="name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Django" maxLength={20} />

        <label>{L(locale, "Hình ngồi bàn", "Your figure")}</label>
        <div className="row" style={{ marginBottom: 18 }}>
          {([[null, "Tuỳ nhân vật", "By character"], ["m", "Nam", "Man"], ["f", "Nữ", "Woman"]] as const).map(([v, vi, en]) => (
            <button
              key={vi}
              className={look === v ? "" : "ghost"}
              style={{ padding: "10px 8px", fontSize: 14 }}
              onClick={() => { setLook(v); saveLook(v); }}
            >
              {L(locale, vi, en)}
            </button>
          ))}
        </div>

        <RoomList lobbies={lobbies} seats={seats} busy={busy} onJoin={join} onResume={resume} />

        <button onClick={() => create(false)} disabled={busy}>
          {L(locale, "Tạo phòng mới", "Open a new room")}
        </button>
        <p className="muted" style={{ fontSize: 12, marginTop: 8, marginBottom: 0 }}>
          {L(locale, "Ai cũng thấy và vào được", "Anyone can see it and join")}
        </p>

        {!manual ? (
          <button
            className="ghost"
            style={{ marginTop: 14, background: "none", border: "none", fontSize: 12, textDecoration: "underline", opacity: 0.7 }}
            onClick={() => setManual(true)}
          >
            {L(locale, "Phòng riêng / vào bằng mã", "Private room / join by code")}
          </button>
        ) : (
          <>
            <div style={{ height: 18 }} />

            <button className="ghost" onClick={() => create(true)} disabled={busy}>
              {L(locale, "Tạo phòng riêng", "Create a private room")}
            </button>

            <div style={{ height: 14 }} />

            <label htmlFor="code">{L(locale, "Vào phòng bằng mã", "Join a room by code")}</label>
            <div className="row">
              <input
                id="code"
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase())}
                placeholder={L(locale, "MÃ PHÒNG", "ROOM CODE")}
                maxLength={4}
                style={{ marginBottom: 0, textTransform: "uppercase", letterSpacing: 3, textAlign: "center" }}
                onKeyDown={(e) => e.key === "Enter" && join(code)}
              />
              <button className="ghost" style={{ width: 120 }} onClick={() => join(code)} disabled={busy}>
                {L(locale, "Vào", "Join")}
              </button>
            </div>
          </>
        )}

        <div className="err">{tError(locale, error)}</div>
      </div>
    </main>
  );
}
