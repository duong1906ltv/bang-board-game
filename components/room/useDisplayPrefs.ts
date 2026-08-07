"use client";

import { useCallback, useEffect, useState } from "react";
import {
  getFx, setFx,
  getShotCam, setShotCam,
  getModels, setModels,
  getSfx, setSfx,
  getLowSpec, setLowSpec,
} from "@/lib/prefs";

// One stored on/off switch. Read AFTER mount, never during render: localStorage does
// not exist while Next renders on the server, so seeding useState from it would
// hydrate different markup on each side.
//
// `initial` has to match the stored default. It used to be hardcoded true, which was
// right while every switch defaulted on — but a switch that defaults OFF would then
// render on for one frame and flip, and low-spec mode remounts the canvas when it
// changes, so that one frame costs a whole scene teardown on every page load.
function usePref(read: () => boolean, write: (v: boolean) => void, initial = true) {
  const [on, setOn] = useState(initial);
  useEffect(() => setOn(read()), [read]);
  const toggle = useCallback(
    () =>
      setOn((cur) => {
        write(!cur);
        return !cur;
      }),
    [write]
  );
  return [on, toggle] as const;
}

// The switches the table offers.
export function useDisplayPrefs() {
  const [fx, toggleFx] = usePref(getFx, setFx);
  const [shotCam, toggleShotCam] = usePref(getShotCam, setShotCam);
  const [models, toggleModels] = usePref(getModels, setModels);
  const [sfx, toggleSfx] = usePref(getSfx, setSfx);
  const [lowSpec, toggleLowSpec] = usePref(getLowSpec, setLowSpec, false);
  return { fx, toggleFx, shotCam, toggleShotCam, models, toggleModels, sfx, toggleSfx, lowSpec, toggleLowSpec };
}
