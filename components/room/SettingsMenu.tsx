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

// Non-match state only, so the HUD outside stays down to what you read constantly:
// role, life, character, range.
//
// PORTALed to body rather than rendered in place: the trigger sits inside the HUD,
// itself a zIndex-55 stacking context, so an `absolute` child panel would be clamped
// to 55 and drawn over by later siblings (banner 56). On body at 1300 it clears the
// whole ladder — scene 40 < cam/mic 45 < HUD 55 < modal.
export function SettingsMenu({
  fx,
  onToggleFx,
  shotCam,
  onToggleShotCam,
  models,
  onToggleModels,
  sfx,
  onToggleSfx,
  canSurrender,
  onSurrender,
}: {
  fx: boolean;
  onToggleFx: () => void;
  shotCam: boolean;
  onToggleShotCam: () => void;
  models: boolean;
  onToggleModels: () => void;
  sfx: boolean;
  onToggleSfx: () => void;
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
              }}
            >
              {L(locale, "Cài đặt", "Settings")}
            </div>
            <Toggle
              on={fx}
              onToggle={onToggleFx}
              onLabel={L(locale, "✨ Hiệu ứng: BẬT", "✨ Effects: ON")}
              offLabel={L(locale, "○ Hiệu ứng: TẮT", "○ Effects: OFF")}
              hint={L(
                locale,
                "Ánh sáng loé đèn dầu + viền tối quanh bàn. Tắt đi nếu máy chạy chậm.",
                "Lamp bloom + vignette around the table. Turn off if the game runs slow."
              )}
            />
            <Toggle
              on={models}
              onToggle={onToggleModels}
              onLabel={L(locale, "🤠 Cao bồi 3D: BẬT", "🤠 3D cowboys: ON")}
              offLabel={L(locale, "○ Cao bồi 3D: TẮT (hình khối)", "○ 3D cowboys: OFF (blocks)")}
              hint={L(
                locale,
                "Nhân vật là model 3D có xương, ngồi vào ghế và cầm súng lục. Tắt đi để quay lại hình khối — nhẹ hơn cho máy yếu.",
                "Rigged 3D figures that sit at the table holding a revolver. Turn off for the block avatars — lighter on weak machines."
              )}
            />
            <Toggle
              on={sfx}
              onToggle={onToggleSfx}
              onLabel={L(locale, "🔊 Tiếng súng: BẬT", "🔊 Gunshots: ON")}
              offLabel={L(locale, "○ Tiếng súng: TẮT", "○ Gunshots: OFF")}
            />
            <Toggle
              on={shotCam}
              onToggle={onToggleShotCam}
              onLabel={L(locale, "🎬 Cắt cảnh khi bắn: BẬT", "🎬 Shot camera: ON")}
              offLabel={L(locale, "○ Cắt cảnh khi bắn: TẮT", "○ Shot camera: OFF")}
              hint={L(
                locale,
                "Mỗi phát Bang! camera lao vào cận mặt người bắn ~1,5 giây rồi lùi về. Tắt nếu thấy chóng mặt hoặc làm chậm nhịp ván.",
                "Every Bang! swoops the camera in on the shooter for ~1.5s, then pulls back. Turn off if it makes you queasy or slows the game down."
              )}
            />
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

// One on/off row. `hint` explains what turning the switch off costs you.
function Toggle({
  on,
  onToggle,
  onLabel,
  offLabel,
  hint,
}: {
  on: boolean;
  onToggle: () => void;
  onLabel: string;
  offLabel: string;
  hint?: string;
}) {
  return (
    <>
      <button
        className="ghost"
        style={{ width: "100%", padding: "8px 10px", fontSize: 13, marginTop: 8 }}
        onClick={onToggle}
      >
        {on ? onLabel : offLabel}
      </button>
      {hint && (
        <div style={{ fontSize: 11, opacity: 0.6, marginTop: 8, lineHeight: 1.45 }}>{hint}</div>
      )}
    </>
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
