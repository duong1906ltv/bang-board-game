"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getSocket, saveIdentity, saveName, loadName } from "@/lib/socketClient";

export default function Home() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setName(loadName());
  }, []);

  function create() {
    if (!name.trim()) return setError("Nhập tên trước đã");
    setBusy(true);
    setError("");
    saveName(name.trim());
    getSocket().emit("createRoom", { name: name.trim() }, ({ code, playerId }) => {
      saveIdentity(code, playerId);
      router.push(`/room/${code}`);
    });
  }

  function join() {
    if (!name.trim()) return setError("Nhập tên trước đã");
    if (code.trim().length < 4) return setError("Mã phòng gồm 4 ký tự");
    setBusy(true);
    setError("");
    saveName(name.trim());
    const c = code.toUpperCase().trim();
    getSocket().emit("joinRoom", { code: c, name: name.trim() }, (res) => {
      setBusy(false);
      if (!res.ok || !res.playerId) return setError(res.error || "Không vào được phòng");
      saveIdentity(c, res.playerId);
      router.push(`/room/${c}`);
    });
  }

  return (
    <main className="center">
      <div className="moon">🤠</div>
      <h1>Bang!</h1>
      <p className="muted">Game bài Viễn Tây online · 4–7 người</p>

      <div className="card">
        <label>Tên của bạn</label>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Ví dụ: Django"
          maxLength={20}
        />

        <button onClick={create} disabled={busy}>
          Tạo phòng mới
        </button>

        <div style={{ height: 18 }} />

        <label>Hoặc vào phòng có sẵn</label>
        <div className="row">
          <input
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            placeholder="MÃ PHÒNG"
            maxLength={4}
            style={{ marginBottom: 0, textTransform: "uppercase", letterSpacing: 3, textAlign: "center" }}
            onKeyDown={(e) => e.key === "Enter" && join()}
          />
          <button className="ghost" style={{ width: 120 }} onClick={join} disabled={busy}>
            Vào
          </button>
        </div>

        <div className="err">{error}</div>
      </div>
    </main>
  );
}
