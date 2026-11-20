import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { InstalledAddon, Media } from '../shared/models';
import { loadTrailers, type Trailer } from './trailers';

/** Shared preview player; card hover and the Home banner use the same lifecycle. */
export default function HoverTrailer({ media, addons, mode = 'hover' }: { media: Media; addons: InstalledAddon[]; mode?: 'hover' | 'banner' }) {
  const host = useRef<HTMLSpanElement>(null);
  const frame = useRef<HTMLIFrameElement>(null);
  const [eligible, setEligible] = useState(false);
  const [trailers, setTrailers] = useState<Trailer[]>();
  const [index, setIndex] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [finished, setFinished] = useState(false);
  const [floating, setFloating] = useState<{ left: number; top: number; width: number; height: number }>();
  const [started, setStarted] = useState(false);
  const trailer = trailers?.[index];
  const failed = () => { setPlaying(false); setIndex(value => value + 1); };

  useEffect(() => {
    let alive = true, scrolling = false;
    let settle: ReturnType<typeof setTimeout>;
    const motion = matchMedia('(prefers-reduced-motion: reduce)');
    const refresh = () => {
      const rect = host.current?.getBoundingClientRect();
      const visible = rect && rect.width > 0 && Math.min(rect.bottom, innerHeight) - Math.max(rect.top, 0) > Math.min(100, rect.height * .4);
      setEligible(!!visible && !scrolling && !document.hidden && !motion.matches && !document.querySelector('dialog[open], [role="dialog"], .embedded-player'));
    };
    const observer = new IntersectionObserver(refresh, { threshold: [0, .2, .4, .6, 1] });
    if (host.current) observer.observe(host.current);
    const dialogs = new MutationObserver(refresh);
    dialogs.observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ['open'] });
    const scroll = () => { scrolling = true; setEligible(false); clearTimeout(settle); settle = setTimeout(() => { if (alive) { scrolling = false; refresh(); } }, 350); };
    window.addEventListener('scroll', scroll, true);
    window.addEventListener('resize', scroll);
    document.addEventListener('visibilitychange', refresh);
    motion.addEventListener('change', refresh);
    refresh();
    return () => { alive = false; clearTimeout(settle); observer.disconnect(); dialogs.disconnect(); window.removeEventListener('scroll', scroll, true); window.removeEventListener('resize', scroll); document.removeEventListener('visibilitychange', refresh); motion.removeEventListener('change', refresh); };
  }, []);

  useEffect(() => {
    setPlaying(false);
    setStarted(false);
    if (!eligible || finished) return;
    let alive = true;
    const timer = setTimeout(async () => {
      setStarted(true);
      const next = await loadTrailers(addons, media);
      if (!alive) return;
      const rect = host.current?.getBoundingClientRect();
      if (rect && mode === 'hover' && (rect.width < 200 || rect.height < 200)) {
        const width = Math.min(Math.max(356, rect.width), innerWidth - 16), height = Math.max(200, width * 9 / 16);
        if (width < 200 || innerHeight < height + 16) return;
        setFloating({ width, height, left: Math.max(8, Math.min(innerWidth - width - 8, rect.left + (rect.width - width) / 2)), top: Math.max(8, Math.min(innerHeight - height - 8, rect.top + (rect.height - height) / 2)) });
      } else setFloating(undefined);
      setTrailers(next);
    }, mode === 'banner' ? 1800 : 900);
    return () => { alive = false; clearTimeout(timer); };
  }, [eligible, addons, media, mode, finished]);

  useEffect(() => {
    if (!eligible || finished || !trailer || !started) return;
    // Retry alternate trailers when a provider video is removed, blocked, or fails to start.
    if (!playing) { const timer = setTimeout(failed, 12000); return () => clearTimeout(timer); }
    const timer = setTimeout(() => setFinished(true), 45000);
    return () => clearTimeout(timer);
  }, [eligible, finished, trailer, started, playing]);

  useEffect(() => {
    if (trailer?.kind !== 'youtube' || !eligible || finished) return;
    const receive = (event: MessageEvent) => {
      if (event.source !== frame.current?.contentWindow || event.origin !== 'https://www.youtube-nocookie.com') return;
      try {
        const data = typeof event.data === 'string' ? JSON.parse(event.data) : event.data;
        if (data.event === 'onError' || data.event === 'onAutoplayBlocked') failed();
        if (data.event === 'onStateChange') {
          if (data.info === 1) setPlaying(true);
          if (data.info === 0) setFinished(true);
        }
        if (data.event === 'infoDelivery' && data.info?.playerState === 1) setPlaying(true);
      } catch { /* Ignore unrelated messages. */ }
    };
    window.addEventListener('message', receive);
    return () => window.removeEventListener('message', receive);
  }, [trailer, eligible, finished]);

  const subscribe = () => {
    const send = (value: object) => frame.current?.contentWindow?.postMessage(JSON.stringify(value), 'https://www.youtube-nocookie.com');
    send({ event: 'listening', id: media.id });
    for (const name of ['onStateChange', 'onError', 'onAutoplayBlocked']) send({ event: 'command', func: 'addEventListener', args: [name] });
  };
  const active = eligible && started && !finished;
  const visible = playing && active ? 'is-playing' : '';
  const content = <span className="trailer-picture">
    {active && trailer?.kind === 'video' && <video key={index} data-update-ignore src={trailer.url} autoPlay muted playsInline onPlaying={() => setPlaying(true)} onEnded={() => setFinished(true)} onError={failed} />}
    {active && trailer?.kind === 'youtube' && <iframe key={index} ref={frame} title={`${media.title} trailer`} tabIndex={-1} referrerPolicy="strict-origin-when-cross-origin" allow="autoplay; encrypted-media" onLoad={subscribe} src={`https://www.youtube-nocookie.com/embed/${trailer.id}?autoplay=1&mute=1&controls=0&playsinline=1&rel=0&enablejsapi=1&origin=${encodeURIComponent(location.origin)}`} />}
  </span>;
  return <span ref={host} className={`hover-trailer ${visible} ${floating ? 'has-floating' : ''} ${mode === 'banner' ? 'banner-trailer' : ''}`} aria-hidden="true">
    {floating && active ? createPortal(<span className={`hover-trailer hover-trailer-floating ${visible}`} style={floating} aria-hidden="true">{content}</span>, document.body) : content}
    {active && !playing && mode === 'hover' && <span className="trailer-status">{trailers && !trailer ? 'Trailer unavailable' : 'Loading trailer…'}</span>}
  </span>;
}
