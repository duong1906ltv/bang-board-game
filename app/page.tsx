"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getSocket, saveIdentity, saveName, loadName } from "@/lib/socketClient";
import { L, useLocale, initLocale, setLocale, getLocale } from "@/lib/i18n";

// Small language switcher.
function LangToggle() {
  const locale = useLocale();
  return (
    <button
      className="ghost"
      style={{ width: "auto", padding: "6px 12px" }}
      onClick={() => setLocale(locale === "vi" ? "en" : "vi")}
      title="Đổi ngôn ngữ / Switch language"
    >
      {locale === "vi" ? "🇻🇳 VI" : "🇬🇧 EN"}
    </button>
  );
}

export default function Home() {
  const router = useRouter();
  const locale = useLocale();
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    initLocale();
    setName(loadName());
  }, []);

  function create() {
    if (!name.trim()) return setError(L(getLocale(), "Nhập tên trước đã", "Enter your name first"));
    setBusy(true);
    setError("");
    saveName(name.trim());
    getSocket().emit("createRoom", { name: name.trim() }, ({ code, playerId }) => {
      saveIdentity(code, playerId);
      router.push(`/room/${code}`);
    });
  }

  function join() {
    if (!name.trim()) return setError(L(getLocale(), "Nhập tên trước đã", "Enter your name first"));
    if (code.trim().length < 4) return setError(L(getLocale(), "Mã phòng gồm 4 ký tự", "Room code is 4 characters"));
    setBusy(true);
    setError("");
    saveName(name.trim());
    const c = code.toUpperCase().trim();
    getSocket().emit("joinRoom", { code: c, name: name.trim() }, (res) => {
      setBusy(false);
      if (!res.ok || !res.playerId) return setError(res.error || L(getLocale(), "Không vào được phòng", "Couldn't join the room"));
      saveIdentity(c, res.playerId);
      router.push(`/room/${c}`);
    });
  }

  return (
    <main className="center">
      <div style={{ position: "absolute", top: 16, right: 16 }}>
        <LangToggle />
      </div>
      <div className="moon">🤠</div>
      <h1>Bang!</h1>
      <p className="muted">{L(locale, "Game bài Viễn Tây online · 4–7 người", "Wild West card game online · 4–7 players")}</p>

      <div className="card">
        <label>{L(locale, "Tên của bạn", "Your name")}</label>
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Django" maxLength={20} />

        <button onClick={create} disabled={busy}>
          {L(locale, "Tạo phòng mới", "Create a room")}
        </button>

        <div style={{ height: 18 }} />

        <label>{L(locale, "Hoặc vào phòng có sẵn", "Or join a room")}</label>
        <div className="row">
          <input
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

        <div className="err">{error}</div>
      </div>
    </main>
  );
}
