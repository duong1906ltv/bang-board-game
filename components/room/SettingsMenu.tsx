"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { toggleMusic, setMusicVolume, getMusicVolume } from "@/lib/music";
import { AlertToggle } from "@/components/TurnAlert";
import { LangToggle } from "@/components/LangToggle";
import { L, useLocale } from "@/lib/i18n";

// Toggle + volume for the procedural wild-west background music (starts on this
// user gesture).
function MusicToggle() {
  const locale = useLocale();
  const [on, setOn] = useState(false);
  const [vol, setVol] = useState(getMusicVolume());
  return (
    <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
      <button
        className="ghost"
        style={{ width: "auto", padding: "4px 10px", fontSize: "0.9rem" }}
        onClick={() => setOn(toggleMusic())}
        title={L(locale, "Nhạc nền miền Tây", "Wild-west background music")}
      >
        {on ? "🎵" : "🔇"}
      </button>
      {on && (
        <input
          type="range"
          min={0}
          max={0.8}
          step={0.05}
          value={vol}
          onChange={(e) => {
            const v = Number(e.target.value);
            setVol(v);
            setMusicVolume(v);
          }}
          title={L(locale, "Âm lượng nhạc", "Music volume")}
          style={{ width: 72, accentColor: "#e0a955", cursor: "pointer" }}
        />
      )}
    </span>
  );
}

// Everything that is NOT match state lives in here (graphics, music, language, turn
// alerts, surrender), so the HUD outside can stay down to what you read constantly
// while playing: role, life, character, range.
//
// The button sits inside the HUD (`position:fixed; zIndex:55`), which is its own
// stacking context: an `absolute` child panel would be CLAMPED to level 55 and drawn
// over by later HUD siblings (banner 56, card row 55). Hence the panel is PORTALed to
// body, where zIndex 1300 really does sit above the shared ladder
// (scene 40 < cam/mic 45 < HUD 55 < modal).
export function SettingsMenu({
  fx,
  onToggleFx,
  canSurrender,
  onSurrender,
}: {
  fx: boolean;
  onToggleFx: () => void;
  canSurrender?: boolean;
  onSurrender?: () => void;
}) {
  const locale = useLocale();
  const [open, setOpen] = useState(false);
  // Portals need a document, so nothing renders until after mount.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  return (
    <span>
      <button
        className="ghost"
        style={{ width: "auto", padding: "4px 10px", fontSize: "0.9rem" }}
        onClick={() => setOpen((o) => !o)}
        title={L(locale, "Cài đặt hiển thị", "Display settings")}
      >
        ⚙️
      </button>
      {open && mounted && createPortal(
        <>
          <div style={{ position: "fixed", inset: 0, zIndex: 1300 }} onClick={() => setOpen(false)} />
          <div
            style={{
              // Anchored under the HUD by hand (top:12 + ~40px tall): the portal left the button behind.
              position: "fixed",
              top: 62,
              left: 12,
              zIndex: 1301,
              minWidth: 240,
              maxWidth: "calc(100vw - 24px)",
              padding: 12,
              background: "rgba(16,13,10,0.98)",
              border: "1px solid var(--border)",
              borderRadius: 12,
              boxShadow: "0 10px 30px rgba(0,0,0,0.5)",
              textAlign: "left",
            }}
          >
            <div
              style={{
                fontSize: 12,
                fontWeight: 700,
                textTransform: "uppercase",
                letterSpacing: 1,
                opacity: 0.6,
                marginBottom: 8,
              }}
            >
              {L(locale, "Cài đặt", "Settings")}
            </div>
            <button
              className="ghost"
              style={{ width: "100%", padding: "8px 10px", fontSize: 13 }}
              onClick={onToggleFx}
            >
              {fx
                ? L(locale, "✨ Hiệu ứng: BẬT", "✨ Effects: ON")
                : L(locale, "○ Hiệu ứng: TẮT", "○ Effects: OFF")}
            </button>
            <div style={{ fontSize: 11, opacity: 0.6, marginTop: 8, lineHeight: 1.45 }}>
              {L(
                locale,
                "Ánh sáng loé đèn dầu + viền tối quanh bàn. Tắt đi nếu máy chạy chậm.",
                "Lamp bloom + vignette around the table. Turn off if the game runs slow."
              )}
            </div>
            <AlertToggle />

            <Divider />
            {/* Set once and forget — not worth HUD space. */}
            <Row label={L(locale, "Nhạc nền", "Music")}>
              <MusicToggle />
            </Row>
            <Row label={L(locale, "Ngôn ngữ", "Language")}>
              <LangToggle padding="6px 10px" />
            </Row>

            {canSurrender && onSurrender && (
              <>
                <Divider />
                <button
                  style={{
                    width: "100%", padding: "8px 10px", fontSize: 13,
                    background: "transparent", border: "1px solid #c0392b", color: "#ffb3a7",
                  }}
                  onClick={() => { setOpen(false); onSurrender(); }}
                >
                  {L(locale, "🏳️ Đầu hàng", "🏳️ Surrender")}
                </button>
                <div style={{ fontSize: 11, opacity: 0.6, marginTop: 6, lineHeight: 1.45 }}>
                  {L(
                    locale,
                    "Rời khỏi ván: lộ vai, bỏ hết bài. Có bước xác nhận.",
                    "Leave the game: role revealed, cards discarded. You'll be asked to confirm."
                  )}
                </div>
              </>
            )}
          </div>
        </>,
        document.body
      )}
    </span>
  );
}

function Divider() {
  return <div style={{ height: 1, background: "var(--border)", margin: "12px 0 10px" }} />;
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, minHeight: 32 }}>
      <span style={{ fontSize: 13, opacity: 0.85 }}>{label}</span>
      {children}
    </div>
  );
}
