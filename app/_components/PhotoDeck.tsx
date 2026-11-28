"use client";

import Image from "next/image";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { PHOTOS } from "./MediaGallery";

const REDUCED_QUERY = "(prefers-reduced-motion: reduce)";
const INTERVAL = 4800;

function useReducedMotion() {
  return useSyncExternalStore(
    (onChange) => {
      const mq = window.matchMedia(REDUCED_QUERY);
      mq.addEventListener("change", onChange);
      return () => mq.removeEventListener("change", onChange);
    },
    () => window.matchMedia(REDUCED_QUERY).matches,
    () => false
  );
}

/* Where each card sits relative to the front one. */
const SLOTS: Record<number, string> = {
  0: "translate(0%, 0%) rotate(0deg) scale(1)",
  1: "translate(16%, -4%) rotate(6deg) scale(0.9)",
  2: "translate(29%, -7%) rotate(11deg) scale(0.8)",
  [-1]: "translate(-18%, 6%) rotate(-8deg) scale(0.86)",
};

/** Auto-rotating, swipeable stack of photos with a slow zoom on the front print. */
export default function PhotoDeck() {
  const n = PHOTOS.length;
  const reduced = useReducedMotion();
  const [active, setActive] = useState(0);
  const [paused, setPaused] = useState(false);
  const [tilt, setTilt] = useState({ x: 0, y: 0 });
  const box = useRef<HTMLDivElement>(null);
  const dragStart = useRef<number | null>(null);

  const go = (d: number) => setActive((a) => (a + d + n) % n);

  useEffect(() => {
    if (paused || reduced) return;
    const id = setTimeout(() => setActive((a) => (a + 1) % n), INTERVAL);
    return () => clearTimeout(id);
  }, [active, paused, reduced, n]);

  const onMove = (e: React.PointerEvent) => {
    if (reduced || e.pointerType !== "mouse" || !box.current) return;
    const r = box.current.getBoundingClientRect();
    setTilt({ x: (e.clientX - r.left) / r.width - 0.5, y: (e.clientY - r.top) / r.height - 0.5 });
  };

  return (
    <figure className="relative mx-auto w-full max-w-[460px] select-none lg:max-w-none">
      <div className="pointer-events-none absolute left-1/2 top-1/2 h-[440px] w-[440px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-cyan-400/15 blur-3xl" />

      <div
        ref={box}
        role="region"
        aria-roledescription="carousel"
        aria-label="Photographs"
        className="relative mx-auto aspect-[4/5] w-[78%] [perspective:1200px]"
        onPointerEnter={() => setPaused(true)}
        onPointerLeave={() => {
          setPaused(false);
          setTilt({ x: 0, y: 0 });
        }}
        onPointerMove={onMove}
        onPointerDown={(e) => (dragStart.current = e.clientX)}
        onPointerUp={(e) => {
          if (dragStart.current === null) return;
          const dx = e.clientX - dragStart.current;
          dragStart.current = null;
          if (Math.abs(dx) > 40) go(dx < 0 ? 1 : -1);
        }}
        onKeyDown={(e) => {
          if (e.key === "ArrowRight") go(1);
          if (e.key === "ArrowLeft") go(-1);
        }}
        tabIndex={0}
      >
        {PHOTOS.map((photo, i) => {
          let k = (i - active + n) % n;
          if (k === n - 1) k = -1;
          const visible = k in SLOTS;
          const front = k === 0;
          const transform = visible ? SLOTS[k] : "translate(0%, 4%) rotate(0deg) scale(0.7)";
          return (
            <button
              key={photo.src}
              type="button"
              tabIndex={front ? -1 : 0}
              aria-hidden={!visible}
              aria-label={front ? photo.alt : `Show photo: ${photo.alt}`}
              onClick={() => !front && setActive(i)}
              className={`absolute inset-0 origin-bottom overflow-hidden border bg-slate-900 p-2.5 shadow-2xl transition-[transform,opacity,filter,border-color] duration-[900ms] ease-[cubic-bezier(.2,.75,.2,1)] ${
                front ? "cursor-grab border-cyan-300/40 shadow-cyan-950/60" : "cursor-pointer border-cyan-300/15 hover:border-cyan-300/60"
              }`}
              style={{
                transform: front
                  ? `${transform} rotateY(${tilt.x * 10}deg) rotateX(${-tilt.y * 10}deg)`
                  : transform,
                opacity: visible ? (front ? 1 : k === -1 ? 0.45 : 0.85 - k * 0.15) : 0,
                filter: front ? "none" : "saturate(0.7) brightness(0.75)",
                zIndex: visible ? 10 - Math.abs(k) * 2 - (k < 0 ? 1 : 0) : 0,
                pointerEvents: visible ? "auto" : "none",
              }}
            >
              <span className="relative block h-full w-full overflow-hidden">
                <Image
                  src={photo.src}
                  alt=""
                  fill
                  draggable={false}
                  priority={i < 2}
                  sizes="(min-width: 1024px) 30vw, 70vw"
                  className={`object-cover ${front && !reduced ? "animate-[kenburns_6s_ease-out_both]" : ""}`}
                />
                {front && (
                  <span className="absolute inset-0 bg-[radial-gradient(circle_at_var(--gx)_var(--gy),rgba(255,255,255,0.18),transparent_45%)]"
                    style={{ ["--gx" as string]: `${(tilt.x + 0.5) * 100}%`, ["--gy" as string]: `${(tilt.y + 0.5) * 100}%` }}
                  />
                )}
              </span>
            </button>
          );
        })}
      </div>

      <figcaption className="mt-6 flex items-center justify-between gap-4">
        <span key={active} className="text-sm font-semibold text-slate-300 motion-safe:animate-[rise_0.5s_ease_both]">
          {PHOTOS[active].caption}
        </span>
        <span className="flex items-center gap-2">
          {PHOTOS.map((p, i) => (
            <button
              key={p.src}
              type="button"
              onClick={() => setActive(i)}
              aria-label={`Photo ${i + 1}: ${p.caption}`}
              aria-current={i === active}
              className={`relative h-1.5 overflow-hidden rounded-full transition-all duration-300 ${i === active ? "w-10 bg-white/15" : "w-3 bg-white/25 hover:bg-cyan-300/60"}`}
            >
              {i === active && (
                <span
                  key={`${active}-${paused}`}
                  className="absolute inset-y-0 left-0 bg-cyan-300"
                  style={{
                    width: paused || reduced ? "100%" : undefined,
                    animation: paused || reduced ? undefined : `deckprogress ${INTERVAL}ms linear both`,
                  }}
                />
              )}
            </button>
          ))}
        </span>
      </figcaption>
    </figure>
  );
}
