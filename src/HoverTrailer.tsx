import { useEffect, useRef, useState } from 'react';
import type { InstalledAddon, Media } from '../shared/models';
import { loadTrailer, type Trailer } from './trailers';

/** Mounted for only the currently hovered card; leaving unmounts and stops playback. */
export default function HoverTrailer({ media, addons }: { media: Media; addons: InstalledAddon[] }) {
  const host = useRef<HTMLSpanElement>(null);
  const frame = useRef<HTMLIFrameElement>(null);
  const [trailer, setTrailer] = useState<Trailer>();
  const [playing, setPlaying] = useState(false);
  const [stopped, setStopped] = useState(false);
  useEffect(() => {
    let alive = true;
    const blocked = () => document.hidden || !!document.querySelector('dialog[open], .embedded-player');
    const stopIfBlocked = () => { if (blocked()) setStopped(true); };
    const timer = window.setTimeout(async () => {
      if (blocked()) return;
      const next = await loadTrailer(addons, media);
      if (alive && !blocked() && (next?.kind !== 'youtube' || (host.current && host.current.clientWidth >= 200 && host.current.clientHeight >= 200))) setTrailer(next);
    }, 900);
    const observer = new IntersectionObserver(entries => {
      if (!entries[0]?.isIntersecting) setStopped(true);
    }, { threshold: .6 });
    if (host.current) observer.observe(host.current);
    const dialogs = new MutationObserver(stopIfBlocked);
    dialogs.observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ['open'] });
    document.addEventListener('visibilitychange', stopIfBlocked);
    const onScroll = () => setStopped(true);
    window.addEventListener('scroll', onScroll, true);
    return () => { alive = false; clearTimeout(timer); observer.disconnect(); dialogs.disconnect(); document.removeEventListener('visibilitychange', stopIfBlocked); window.removeEventListener('scroll', onScroll, true); };
  }, [addons, media]);
  useEffect(() => {
    if (trailer?.kind !== 'youtube' || stopped) return;
    const receive = (event: MessageEvent) => {
      if (event.source !== frame.current?.contentWindow || event.origin !== 'https://www.youtube-nocookie.com') return;
      try {
        const data = typeof event.data === 'string' ? JSON.parse(event.data) : event.data;
        if (data.event === 'onError') setStopped(true);
        if (data.event === 'onStateChange') {
          if (data.info === 1) setPlaying(true);
          if (data.info === 0) setStopped(true);
        }
        if (data.event === 'infoDelivery' && data.info?.playerState === 1) setPlaying(true);
      } catch { /* Ignore unrelated messages. */ }
    };
    window.addEventListener('message', receive);
    // Unavailable, blocked or non-embeddable videos fall back to the artwork.
    const timeout = setTimeout(() => setStopped(true), 45000);
    return () => { window.removeEventListener('message', receive); clearTimeout(timeout); };
  }, [trailer, stopped]);
  const subscribe = () => {
    const send = (value: object) => frame.current?.contentWindow?.postMessage(JSON.stringify(value), 'https://www.youtube-nocookie.com');
    send({ event: 'listening', id: media.id });
    for (const name of ['onStateChange', 'onError']) send({ event: 'command', func: 'addEventListener', args: [name] });
  };
  return <span ref={host} className={`hover-trailer ${playing && !stopped ? 'is-playing' : ''}`} aria-hidden="true">
    {!stopped && trailer?.kind === 'video' && <video src={trailer.url} autoPlay muted playsInline onPlaying={() => setPlaying(true)} onEnded={() => setStopped(true)} onError={() => setStopped(true)} />}
    {!stopped && trailer?.kind === 'youtube' && <iframe ref={frame} title={`${media.title} trailer`} tabIndex={-1} referrerPolicy="strict-origin-when-cross-origin" allow="autoplay; encrypted-media" onLoad={subscribe} src={`https://www.youtube-nocookie.com/embed/${trailer.id}?autoplay=1&mute=1&controls=0&playsinline=1&rel=0&enablejsapi=1&origin=${encodeURIComponent(location.origin)}`} />}
    {playing && !stopped && trailer?.kind === 'video' && <span className="trailer-label">Trailer · Muted</span>}
  </span>;
}
