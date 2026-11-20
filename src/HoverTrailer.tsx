import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { InstalledAddon, Media } from '../shared/models';
import { loadTrailers, type Trailer } from './trailers';
import YouTubePreview from './YouTubePreview';

/** Shared preview player; card hover and the Home banner use the same lifecycle. */
export default function HoverTrailer({ media, addons, mode = 'hover', onPlayingChange }: { media: Media; addons: InstalledAddon[]; mode?: 'hover' | 'banner'; onPlayingChange?: (playing: boolean) => void }) {
  const host = useRef<HTMLSpanElement>(null);
  const [eligible, setEligible] = useState(false);
  const [trailers, setTrailers] = useState<Trailer[]>();
  const [index, setIndex] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [floating, setFloating] = useState<{ left: number; top: number; width: number; height: number }>();
  const [started, setStarted] = useState(false);
  const notify = useRef(onPlayingChange); notify.current = onPlayingChange;
  useEffect(() => { notify.current?.(playing && eligible && started); return () => notify.current?.(false); }, [playing, eligible, started]);
  const trailer = trailers?.[index];
  const currentAttempt = useRef(index); currentAttempt.current = index;
  const failed = () => { if (currentAttempt.current !== index) return; currentAttempt.current = index + 1; setPlaying(false); setIndex(index + 1); };

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
    if (!eligible) return;
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
    }, mode === 'banner' ? 0 : 900);
    return () => { alive = false; clearTimeout(timer); };
  }, [eligible, addons, media, mode]);

  useEffect(() => {
    if (!eligible || !trailer || !started || playing) return;
    const timer = setTimeout(failed, 25000);
    return () => clearTimeout(timer);
  }, [eligible, trailer, started, playing]);

  const active = eligible && started;
  const visible = playing && active ? 'is-playing' : '';
  const content = <span className="trailer-picture">
    {active && trailer?.kind === 'video' && <video key={index} data-update-ignore src={trailer.url} autoPlay muted playsInline loop onPlaying={() => setPlaying(true)} onError={failed} />}
    {active && trailer?.kind === 'youtube' && <YouTubePreview key={index} id={trailer.id} title={media.title} playing={() => setPlaying(true)} failed={failed} />}
  </span>;
  return <span ref={host} className={`hover-trailer ${visible} ${floating ? 'has-floating' : ''} ${mode === 'banner' ? 'banner-trailer' : ''}`} aria-hidden="true">
    {floating && active ? createPortal(<span className={`hover-trailer hover-trailer-floating ${visible}`} style={floating} aria-hidden="true">{content}</span>, document.body) : content}
    {active && !playing && mode === 'hover' && <span className="trailer-status">{trailers && !trailer ? 'Trailer unavailable' : 'Loading trailer…'}</span>}
  </span>;
}
