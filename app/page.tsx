"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { getSocket, saveIdentity, saveName, loadName, loadSeats } from "@/lib/socketClient";
import type { LobbySummary, MySeat } from "@/lib/types";
import { L, useLocale, initLocale, getLocale, tError } from "@/lib/i18n";
import type { GameError } from "@/lib/errors";
import { RoomList } from "@/components/RoomList";
import { SaloonBackdrop } from "@/components/home/SaloonBackdrop";
import { BrandMark } from "@/components/home/BrandMark";
import { NameField } from "@/components/home/NameField";
import { randomOutlawName } from "@/lib/outlaw-names";

export default function Home() {
  const router = useRouter();
  const locale = useLocale();
  const [name, setName] = useState("");
  const [error, setError] = useState<GameError | string | null>(null);
  const [busy, setBusy] = useState(false);
  const [lobbies, setLobbies] = useState<LobbySummary[]>([]);
  const [seats, setSeats] = useState<MySeat[]>([]);

  useEffect(() => {
    initLocale();
    // Chưa từng đặt tên thì được phát một biệt danh, không phải một ô trống kèm lời
    // nhắc. Điền sẵn giá trị THẬT chứ không để ở placeholder: cái tên hiện ra phải đúng
    // là cái tên sẽ ngồi vào bàn, không có bất ngờ nào ở bước sau.
    setName(loadName() || randomOutlawName(getLocale()));
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
  const cantJoin = () => L(getLocale(), "Không vào được bàn", "Couldn't join the room");

  // Saves as a side effect, so the name they used is the one they get next time.
  // Xoá trắng ô tên không còn là lỗi: ai không muốn tự đặt thì được phát một biệt danh.
  function takeName(): string {
    const n = name.trim() || randomOutlawName(getLocale());
    saveName(n);
    return n;
  }

  function create() {
    const n = takeName();
    setBusy(true);
    setError(null);
    // .timeout() so a lost/slow connection surfaces an error instead of leaving
    // the button disabled forever. On success we navigate away (busy stays set).
    getSocket().timeout(8000).emit("createRoom", { name: n, private: false }, (err, res) => {
      if (err || !res) { setBusy(false); return noResponse(); }
      saveIdentity(res.code, res.playerId);
      router.push(`/room/${res.code}`);
    });
  }

  function join(target: string) {
    const n = takeName();
    const c = target.toUpperCase().trim();
    if (c.length < 4) return setError(L(getLocale(), "Mã bàn gồm 4 ký tự", "Room code is 4 characters"));
    setBusy(true);
    setError(null);
    getSocket().timeout(8000).emit("joinRoom", { code: c, name: n }, (err, res) => {
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
    getSocket().timeout(8000).emit("rejoin", { code: seat.code, playerId: seat.playerId }, (err, res) => {
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
    <>
      <SaloonBackdrop />
      <main className="center">
        <BrandMark />
        <h1 className="brand">Bang!</h1>
        <p className="muted tagline">{L(locale, "Sheriff lộ mặt. Còn lại thì không. · 4–8 người", "The Sheriff shows his star. Nobody else does. · 4–8 players")}</p>

        <div className="card">
          <NameField value={name} onChange={setName} />

          <div style={{ height: 18 }} />

          <RoomList lobbies={lobbies} seats={seats} busy={busy} onJoin={join} onResume={resume} />

          <button onClick={create} disabled={busy}>
            {L(locale, "Mở bàn mới", "Open a new table")}
          </button>

          <div className="err">{tError(locale, error)}</div>

          <Link href="/luat" className="quiet-link">
            {L(locale, "Xem toàn bộ lá bài và nhân vật", "Browse every card and character")}
          </Link>
        </div>
      </main>
    </>
  );
}
