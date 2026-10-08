"use client";

import { useCallback, useEffect, useRef, useState } from "react";

// Follow scroll distance rather than toggling visibility at a direction threshold.
const FADE_DISTANCE = 160;

export function useScrollNavigation(view: string) {
  const [state, setState] = useState({ view, progress: 0 });
  if (state.view !== view) setState({ view, progress: 0 });
  const progressRef = useRef(0);
  const navRef = useRef<HTMLElement>(null);
  const show = useCallback(() => {
    progressRef.current = 0;
    setState({ view, progress: 0 });
  }, [view]);

  useEffect(() => {
    progressRef.current = 0;
    let previous = position();
    let frame = 0;
    function position() {
      const max = Math.max(0, document.documentElement.scrollHeight - window.innerHeight);
      return Math.min(max, Math.max(0, window.scrollY));
    }
    function update() {
      frame = 0;
      const current = position();
      const delta = current - previous;
      previous = current;
      const progress = current <= 12 || navRef.current?.querySelector(":focus-visible")
        ? 0
        : Math.min(1, Math.max(0, progressRef.current + delta / FADE_DISTANCE));
      progressRef.current = progress;
      setState(old => old.view === view && old.progress === progress ? old : { view, progress });
    }
    function scroll() {
      if (!frame) frame = window.requestAnimationFrame(update);
    }
    window.addEventListener("scroll", scroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", scroll);
      if (frame) window.cancelAnimationFrame(frame);
    };
  }, [view]);

  const progress = state.view === view ? state.progress : 0;
  return { progress, hidden: progress >= 1, navRef, show };
}
