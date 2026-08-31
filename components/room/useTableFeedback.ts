"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { EventView, PlayerView, PredictReveal } from "@/lib/types";
import { rankLabel, SUIT_SYMBOL } from "@/lib/cards";
import { useLocale, checkText } from "@/lib/i18n";
import { CHECK_ICON } from "./constants";

// Split out of Table because none of it touches the game: each of these owns its
// state end to end, reacting only to the incoming view. Table reads the results.
export function useTableFeedback(view: PlayerView) {
  const locale = useLocale();

  // Keyed on the drawn card so the same reveal is never announced twice, and a
  // repeat of the same check (two Barrel flips in a row) still re-triggers.
  const [marquee, setMarquee] = useState<string | null>(null);
  const lastCheck = useRef<string | null>(null);
  useEffect(() => {
    const c = view.checks[view.checks.length - 1];
    if (!c) return;
    const key = c.card?.id ?? `${c.name}-${c.kind}-${c.outcome}`;
    if (key === lastCheck.current) return;
    lastCheck.current = key;
    const t = checkText(locale, c.kind, c.outcome);
    const cardLabel = c.card ? ` (${rankLabel(c.card.rank)}${SUIT_SYMBOL[c.card.suit]})` : "";
    setMarquee(`${CHECK_ICON[c.kind] ?? "🎴"} ${c.name} — ${t.kind}${cardLabel}: ${t.outcome}`);
  }, [view.checks, locale]);

  // The batch a new round just drew. A whole round's events arrive in one view
  // update, so "everything above the seq watermark" IS the batch — and the
  // watermark means a view landing mid-banner never re-announces it.
  const [eventBatch, setEventBatch] = useState<EventView[]>([]);
  const seenSeq = useRef(0);
  useEffect(() => {
    const fresh = view.eventFeed.filter((e) => e.seq > seenSeq.current);
    if (fresh.length === 0) return;
    seenSeq.current = fresh[fresh.length - 1].seq;
    setEventBatch(fresh);
  }, [view.eventFeed]);

  // The verdict on the turn that just ended, but ONLY for somebody who staked a guess on
  // it. A prediction opens every single turn, so popping this for the whole table would be
  // 40-60 modals a game at people who chose not to play along — and choosing not to play
  // along is supposed to cost nothing, including attention.
  // A QUEUE, oldest first, not just the newest: one action can judge a turn and then void
  // the skipped seat after it, and the judged verdict — the one that moved cards — is the
  // older of the two. Showing the newest would drop exactly the one worth seeing.
  const [revealQueue, setRevealQueue] = useState<PredictReveal[]>([]);
  const seenPredictSeq = useRef(0);
  useEffect(() => {
    const fresh = view.predictFeed.filter(
      (r) => r.seq > seenPredictSeq.current && r.results.some((x) => x.byId === view.you.id)
    );
    const highest = view.predictFeed.at(-1)?.seq;
    if (highest !== undefined) seenPredictSeq.current = Math.max(seenPredictSeq.current, highest);
    if (fresh.length) setRevealQueue((q) => [...q, ...fresh]);
  }, [view.predictFeed, view.you.id]);
  const reveal = revealQueue[0] ?? null;
  const dismissReveal = useCallback(() => setRevealQueue((q) => q.slice(1)), []);

  const [justDrew, setJustDrew] = useState<Set<string>>(new Set());
  const prevHand = useRef<string[]>([]);
  useEffect(() => {
    const cur = view.you.hand.map((c) => c.id);
    const added = cur.filter((id) => !prevHand.current.includes(id));
    prevHand.current = cur;
    if (added.length === 0) return;
    setJustDrew(new Set(added));
    const t = window.setTimeout(() => setJustDrew(new Set()), 650);
    return () => window.clearTimeout(t);
  }, [view.you.hand]);

  // Stable identity: Table lists it in the deps of its Escape-key effect, and a new
  // function each render would re-bind the listener every render.
  const dismissEvents = useCallback(() => setEventBatch([]), []);

  const [notice, setNotice] = useState("");
  const noticeTimer = useRef<ReturnType<typeof setTimeout>>();
  const flash = (msg: string) => {
    setNotice(msg);
    clearTimeout(noticeTimer.current); // keep only the latest countdown
    noticeTimer.current = setTimeout(() => setNotice((cur) => (cur === msg ? "" : cur)), 1800);
  };
  // Clear the pending timer if the table unmounts mid-countdown.
  useEffect(() => () => clearTimeout(noticeTimer.current), []);

  return {
    reveal,
    dismissReveal,
    marquee,
    clearMarquee: () => setMarquee(null),
    eventBatch,
    dismissEvents,
    justDrew,
    notice,
    flash,
  };
}
