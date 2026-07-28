"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getSocket, saveIdentity, saveName, loadName } from "@/lib/socketClient";
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
        <input id="name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Django" maxLength={20} onKeyDown={(e) => e.key === "Enter" && create()} />

        <button onClick={create} disabled={busy}>
          {L(locale, "Tạo phòng mới", "Create a room")}
        </button>

        <div style={{ height: 18 }} />

        <label htmlFor="code">{L(locale, "Hoặc vào phòng có sẵn", "Or join a room")}</label>
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

        <div className="err">{tError(locale, error)}</div>
      </div>
    </main>
  );
}
