"use client";

import Image from "next/image";
import { useCallback, useEffect, useRef, useState } from "react";

export const PHOTOS = [
  { src: "/nahid-lighthouse.jpg", alt: "In front of Split Rock Lighthouse", caption: "Split Rock Lighthouse, Lake Superior" },
  { src: "/nahid-shore.jpg", alt: "On the rocky shore below Split Rock Lighthouse", caption: "The shore below the lighthouse" },
  { src: "/nahid-overlook.jpg", alt: "At an overlook above Lake Superior in autumn", caption: "Autumn on the North Shore" },
];

/** Photo grid with a keyboard-navigable lightbox. */
export function PhotoGallery() {
  const [open, setOpen] = useState<number | null>(null);

  const close = useCallback(() => setOpen(null), []);
  const step = useCallback(
    (d: number) => setOpen((i) => (i === null ? i : (i + d + PHOTOS.length) % PHOTOS.length)),
    []
  );

  useEffect(() => {
    if (open === null) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
      if (e.key === "ArrowRight") step(1);
      if (e.key === "ArrowLeft") step(-1);
    };
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open, close, step]);

  return (
    <>
      <div className="grid gap-5 sm:grid-cols-3">
        {PHOTOS.map((photo, i) => (
          <button
            key={photo.src}
            type="button"
            onClick={() => setOpen(i)}
            className="group relative overflow-hidden rounded-[1.5rem] border border-cyan-300/15 bg-slate-900 text-left shadow-xl transition duration-500 hover:-translate-y-1 hover:border-cyan-300/60 hover:shadow-cyan-950/40"
          >
            <Image
              src={photo.src}
              alt={photo.alt}
              width={600}
              height={800}
              sizes="(min-width: 640px) 33vw, 100vw"
              className="aspect-[3/4] w-full object-cover transition duration-700 group-hover:scale-105"
            />
            <div className="absolute inset-x-0 bottom-0 translate-y-2 bg-gradient-to-t from-slate-950/95 to-transparent p-5 pt-16 transition duration-500 group-hover:translate-y-0">
              <p className="font-bold text-white">{photo.caption}</p>
              <p className="mt-1 text-xs font-semibold text-cyan-300 opacity-0 transition group-hover:opacity-100">View full size</p>
            </div>
          </button>
        ))}
      </div>

      {open !== null && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={PHOTOS[open].caption}
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/85 p-4 backdrop-blur-md"
        >
          <button className="absolute inset-0 cursor-default" onClick={close} aria-label="Close photo" />
          <figure key={open} className="relative max-h-full motion-safe:animate-[fadeIn_0.35s_ease]">
            <Image
              src={PHOTOS[open].src}
              alt={PHOTOS[open].alt}
              width={1400}
              height={1867}
              className="max-h-[82vh] w-auto rounded-2xl border border-cyan-300/20 object-contain shadow-2xl"
            />
            <figcaption className="mt-3 text-center text-sm font-semibold text-slate-200">
              {PHOTOS[open].caption} <span className="text-slate-500">({open + 1} of {PHOTOS.length})</span>
            </figcaption>
          </figure>
          <button
            type="button"
            onClick={() => step(-1)}
            aria-label="Previous photo"
            className="absolute left-3 top-1/2 flex h-12 w-12 -translate-y-1/2 items-center justify-center rounded-full border border-white/15 bg-slate-950/70 text-2xl text-white transition hover:border-cyan-300 hover:text-cyan-300 md:left-8"
          >
            ‹
          </button>
          <button
            type="button"
            onClick={() => step(1)}
            aria-label="Next photo"
            className="absolute right-3 top-1/2 flex h-12 w-12 -translate-y-1/2 items-center justify-center rounded-full border border-white/15 bg-slate-950/70 text-2xl text-white transition hover:border-cyan-300 hover:text-cyan-300 md:right-8"
          >
            ›
          </button>
          <button
            type="button"
            onClick={close}
            aria-label="Close"
            className="absolute right-4 top-4 flex h-10 w-10 items-center justify-center rounded-full border border-white/15 bg-slate-950/70 text-white transition hover:border-cyan-300 hover:text-cyan-300"
          >
            ✕
          </button>
        </div>
      )}
    </>
  );
}

/** The waterfall clip with play/pause and a live progress bar. */
export function WaterfallStory() {
  const ref = useRef<HTMLVideoElement>(null);
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0);

  const toggle = () => {
    const v = ref.current;
    if (!v) return;
    if (v.paused) v.play();
    else v.pause();
  };

  return (
    <div className="grid items-center gap-6 lg:grid-cols-[1.4fr_0.6fr]">
      <div className="group relative overflow-hidden rounded-[1.5rem] border border-cyan-300/20 bg-slate-900 shadow-2xl shadow-cyan-950/30">
        <video
          ref={ref}
          src="/waterfall.mp4"
          poster="/waterfall-poster.jpg"
          muted
          loop
          playsInline
          preload="metadata"
          onPlay={() => setPlaying(true)}
          onPause={() => setPlaying(false)}
          onTimeUpdate={(e) => {
            const v = e.currentTarget;
            setProgress(v.duration ? v.currentTime / v.duration : 0);
          }}
          className="aspect-video w-full object-cover"
          aria-label="Waterfall in an autumn forest"
        />
        <button
          type="button"
          onClick={toggle}
          aria-label={playing ? "Pause video" : "Play video"}
          className={`absolute inset-0 flex items-center justify-center transition ${playing ? "opacity-0 group-hover:opacity-100" : "bg-slate-950/30"}`}
        >
          <span className="flex h-20 w-20 items-center justify-center rounded-full border border-cyan-300/60 bg-slate-950/60 text-3xl text-cyan-200 shadow-[0_0_40px_rgba(34,211,238,0.35)] backdrop-blur transition group-hover:scale-110">
            {playing ? "❚❚" : "▶"}
          </span>
        </button>
        <div className="absolute inset-x-0 bottom-0 h-1 bg-white/10">
          <div className="h-full bg-cyan-300 shadow-[0_0_10px_rgba(103,232,249,0.9)]" style={{ width: `${progress * 100}%` }} />
        </div>
      </div>
      <div>
        <p className="text-xs font-black uppercase tracking-[0.3em] text-cyan-300">Video story</p>
        <h3 className="mt-3 text-3xl font-black text-white">Falling water, autumn forest</h3>
        <p className="mt-4 leading-7 text-slate-300">
          A short clip from the North Shore of Lake Superior in October. Places like this are where my curiosity about the
          living world started.
        </p>
        <button
          type="button"
          onClick={toggle}
          className="mt-6 rounded-xl border border-cyan-300/25 bg-cyan-300 px-5 py-3 text-sm font-black text-slate-950 transition hover:-translate-y-1 hover:bg-white"
        >
          {playing ? "Pause" : "Play the clip"}
        </button>
      </div>
    </div>
  );
}
