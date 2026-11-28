/*
 * YouTube support for the music lounge and Watch Together. Playback happens in each browser through YouTube's own
 * embedded player (visible, as YouTube's terms require); the server only stores the video id and title and keeps
 * everyone's position in sync. Titles come from YouTube's public oEmbed endpoint, which needs no API key and refuses
 * private or non-embeddable videos.
 */

const ID = /^[A-Za-z0-9_-]{11}$/;

/** Accepts a bare id or any common YouTube URL (watch, youtu.be, shorts, embed, live, music.youtube.com). */
export function parseYoutubeId(input: string): string | null {
  const raw = input.trim();
  if (ID.test(raw)) return raw;
  let url: URL;
  try {
    url = new URL(raw.startsWith("http") ? raw : `https://${raw}`);
  } catch {
    return null;
  }
  const host = url.hostname.replace(/^(www|m|music)\./, "");
  let id: string | null = null;
  if (host === "youtu.be") id = url.pathname.slice(1).split("/")[0] ?? null;
  else if (host === "youtube.com" || host === "youtube-nocookie.com") {
    if (url.pathname === "/watch") id = url.searchParams.get("v");
    else {
      const m = /^\/(shorts|embed|live|v)\/([^/?#]+)/.exec(url.pathname);
      id = m?.[2] ?? null;
    }
  }
  return id && ID.test(id) ? id : null;
}

export type YoutubeLookup = (id: string) => Promise<{ title: string } | null>;

export const oembedLookup: YoutubeLookup = async (id) => {
  try {
    const res = await fetch(
      `https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(`https://www.youtube.com/watch?v=${id}`)}`,
      { signal: AbortSignal.timeout(8000) }
    );
    if (!res.ok) return null;
    const body = (await res.json()) as { title?: unknown };
    return typeof body.title === "string" ? { title: body.title.slice(0, 200) } : null;
  } catch {
    return null;
  }
};
