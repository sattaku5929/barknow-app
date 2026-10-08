"use client";

import { useCallback, useEffect, useRef, useState } from "react";

// Ignore small touch jitter and clamp iOS overscroll to the document bounds.
export function useScrollNavigation(view: string) {
  const [state, setState] = useState({ view, hidden: false });
  if (state.view !== view) setState({ view, hidden: false });
  const navRef = useRef<HTMLElement>(null);
  const show = useCallback(() => setState({ view, hidden: false }), [view]);

  useEffect(() => {
    let previous = position();
    let distance = 0;
    let frame = 0;
    let hidden = false;
    function position() {
      const max = Math.max(0, document.documentElement.scrollHeight - window.innerHeight);
      return Math.min(max, Math.max(0, window.scrollY));
    }
    function update() {
      frame = 0;
      const current = position();
      const delta = current - previous;
      previous = current;
      if (current <= 12 || navRef.current?.querySelector(":focus-visible")) {
        distance = 0;
        hidden = false;
      } else if (delta !== 0) {
        distance = Math.sign(delta) === Math.sign(distance) ? distance + delta : delta;
        if (distance >= 12) hidden = true;
        if (distance <= -8) hidden = false;
      }
      setState(old => old.view === view && old.hidden === hidden ? old : { view, hidden });
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

  return { hidden: state.view === view && state.hidden, navRef, show };
}
