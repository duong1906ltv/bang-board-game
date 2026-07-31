"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getSocket, saveIdentity, saveName, loadName, loadSeats } from "@/lib/socketClient";
import { L, useLocale, initLocale, setLocale, getLocale, tError } from "@/lib/i18n";
import type { GameError } from "@/lib/errors";
import { LangToggle } from "@/components/LangToggle";

export default function Home() {
  const router = useRouter();
  const locale = useLocale();
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState<GameError | string | null>(null);
  const [busy, setBusy] = useState(false);
  // Room codes are now an escape hatch (rejoining a specific game, playing with a
  // group that already has a room), not the way in — so they stay folded away.
  const [manual, setManual] = useState(false);

  useEffect(() => {
    initLocale();
    setName(loadName());
  }, []);

  const noResponse = () => setError(L(getLocale(), "Máy chủ không phản hồi, thử lại", "Server didn't respond, try again"));

  function create() {
    if (!name.trim()) return setError(L(getLocale(), "Nhập tên trước đã", "Enter your name first"));
    setBusy(true);
    setError(null);
    saveName(name.trim());
    // .timeout() so a lost/slow connection surfaces an error instead of leaving
    // the button disabled forever. On success we navigate away (busy stays set).
    getSocket().timeout(8000).emit("createRoom", { name: name.trim() }, (err, res) => {
      if (err || !res) { setBusy(false); return noResponse(); }
      saveIdentity(res.code, res.playerId);
      router.push(`/room/${res.code}`);
    });
  }

  // The default way in: the server decides where you go (own seat > fullest open
  // lobby > new lobby), so there is nothing to type and nothing to coordinate.
  function play() {
    if (!name.trim()) return setError(L(getLocale(), "Nhập tên trước đã", "Enter your name first"));
    setBusy(true);
    setError(null);
    saveName(name.trim());
    getSocket().timeout(8000).emit("quickJoin", { name: name.trim(), seats: loadSeats() }, (err, res) => {
      if (err || !res) { setBusy(false); return noResponse(); }
      saveIdentity(res.code, res.playerId);
      router.push(`/room/${res.code}`);
    });
  }

  function join() {
    if (!name.trim()) return setError(L(getLocale(), "Nhập tên trước đã", "Enter your name first"));
    if (code.trim().length < 4) return setError(L(getLocale(), "Mã phòng gồm 4 ký tự", "Room code is 4 characters"));
    setBusy(true);
    setError(null);
    saveName(name.trim());
    const c = code.toUpperCase().trim();
    getSocket().timeout(8000).emit("joinRoom", { code: c, name: name.trim() }, (err, res) => {
      setBusy(false);
      if (err || !res) return noResponse();
      if (!res.ok || !res.playerId) return setError(res.error ?? L(getLocale(), "Không vào được phòng", "Couldn't join the room"));
      saveIdentity(c, res.playerId);
      router.push(`/room/${c}`);
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
        <input id="name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Django" maxLength={20} onKeyDown={(e) => e.key === "Enter" && play()} />

        <button onClick={play} disabled={busy}>
          {L(locale, "Vào chơi ngay", "Play now")}
        </button>
        <p className="muted" style={{ fontSize: 12, marginTop: 8, marginBottom: 0 }}>
          {L(locale, "Tự động vào sảnh chờ · không cần mã phòng", "Straight to the lobby · no room code needed")}
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

            <button className="ghost" onClick={create} disabled={busy}>
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
                onKeyDown={(e) => e.key === "Enter" && join()}
              />
              <button className="ghost" style={{ width: 120 }} onClick={join} disabled={busy}>
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
