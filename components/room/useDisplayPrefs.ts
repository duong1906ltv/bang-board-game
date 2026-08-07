"use client";

import { useCallback, useEffect, useState } from "react";
import {
  getFx, setFx,
  getShotCam, setShotCam,
  getModels, setModels,
  getSfx, setSfx,
} from "@/lib/prefs";

// One stored on/off switch. Read AFTER mount, never during render: localStorage does
// not exist while Next renders on the server, so seeding useState from it would
// hydrate different markup on each side.
function usePref(read: () => boolean, write: (v: boolean) => void) {
  const [on, setOn] = useState(true);
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

// The four switches the table offers.
export function useDisplayPrefs() {
  const [fx, toggleFx] = usePref(getFx, setFx);
  const [shotCam, toggleShotCam] = usePref(getShotCam, setShotCam);
  const [models, toggleModels] = usePref(getModels, setModels);
  const [sfx, toggleSfx] = usePref(getSfx, setSfx);
  return { fx, toggleFx, shotCam, toggleShotCam, models, toggleModels, sfx, toggleSfx };
}
