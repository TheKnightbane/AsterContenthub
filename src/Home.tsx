import { createContext, useContext, useId, useRef, useState, useEffect, useCallback } from 'react';
import HoverTrailer from './HoverTrailer';
import { loadTrailers } from './trailers';
import { Bookmark, Check, ChevronLeft, ChevronRight, Heart, Info, Play, Star } from 'lucide-react';
import type { LocalState, Media } from '../shared/models';
import type { AppSettings } from './settings';
import { rowKey } from './settings';

const PreviewContext = createContext<{ active: string; activate: (key: string) => void; deactivate: (key: string) => void; reportPlaying: (key: string, playing: boolean) => void }>({ active: '', activate: () => {}, deactivate: () => {}, reportPlaying: () => {} });

const art = (url: string) => `url("${url.replace(/["\\\n\r]/g, '')}")`;

function Shelf({ title, source, items, state, open, favorite, more, play, settings }: { title: string; source: string; items: Media[]; state: LocalState; open: (media: Media) => void; favorite: (media: Media) => void; more?: () => void; play: (media: Media) => void; settings: AppSettings }) {
  const rail = useRef<HTMLDivElement>(null);
  const shelfId = useId();
  const preview = useContext(PreviewContext);
  return <section className="cinema-shelf" aria-label={title}>
    <div className="cinema-shelf-heading"><h2>{more ? <button onClick={more}>{title}<ChevronRight size={24} /></button> : title}</h2><span className="catalog-badge">{source}</span><div className="rail-arrows"><button aria-label={`Scroll ${title} left`} onClick={() => rail.current?.scrollBy({ left: -rail.current.clientWidth * .85, behavior: 'smooth' })}><ChevronLeft size={18} /></button><button aria-label={`Scroll ${title} right`} onClick={() => rail.current?.scrollBy({ left: rail.current.clientWidth * .85, behavior: 'smooth' })}><ChevronRight size={18} /></button></div></div>
    <div className="cinema-rail" ref={rail}>{items.map(media => {
      const saved = state.items[media.id];
      const progress = saved?.progress;
      const previewKey = `${shelfId}:${media.id}`;
      return <article className="landscape-card" key={media.id} onPointerMove={e => { if (e.pointerType !== 'touch' && settings.hoverTrailers && !settings.reducedMotion) preview.activate(previewKey); }} onPointerEnter={e => { if (e.pointerType === 'mouse' && settings.hoverTrailers && !settings.reducedMotion && !matchMedia('(prefers-reduced-motion: reduce)').matches) preview.activate(previewKey); }} onPointerLeave={() => preview.deactivate(previewKey)}>
        <button className="landscape-art" onClick={() => open(media)} aria-label={`View ${media.title}`} style={{ backgroundImage: `linear-gradient(0deg,#000d,transparent 72%),${art(media.art)}`, backgroundColor: '#18232d' }}>
          {preview.active === previewKey && settings.hoverTrailers && !settings.reducedMotion && <HoverTrailer media={media} addons={state.addons} onPlayingChange={value => preview.reportPlaying(previewKey, value)} />}
          <span className="landscape-play"><Play size={23} fill="currentColor" /></span><span className="landscape-caption"><strong>{media.title}</strong><small>{settings.showRatings && media.rating ? <><Star size={13} fill="currentColor" /> {media.rating}</> : <>{media.year || (media.type === 'series' ? 'Series' : 'Movie')} · {media.demo ? 'Demo preview' : media.genre}</>}</small></span>
          {progress && progress.duration > 0 && <span className="progress"><span style={{ width: `${Math.min(100, progress.position / progress.duration * 100)}%` }} /></span>}
        </button><button className="landscape-quickplay" aria-label={`Play ${media.title}`} onClick={() => play(media)}><Play size={22} fill="currentColor" /></button><button className={`landscape-favorite ${saved?.favorite ? 'saved' : ''}`} onClick={() => favorite(media)} aria-label={`${saved?.favorite ? 'Unfavorite' : 'Favorite'} ${media.title}`}><Heart size={16} fill={saved?.favorite ? 'currentColor' : 'none'} /></button>
      </article>;
    })}</div>
  </section>;
}

export default function Home({ media, state, open, play, favorite, library, continueWatching, addons, settings }: { media: Media[]; state: LocalState; open: (media: Media) => void; play: (media: Media) => void; favorite: (media: Media) => void; library: (media: Media) => void; continueWatching: () => void; addons: () => void; settings: AppSettings }) {
  const [slide, setSlide] = useState(0);
  const [activePreview, setActivePreview] = useState('');
  const [playingPreview, setPlayingPreview] = useState('');
  const deactivate = useCallback((key: string) => setActivePreview(current => current === key ? '' : current), []);
  const reportPlaying = useCallback((key: string, playing: boolean) => setPlayingPreview(current => playing ? key : current === key ? '' : current), []);
  useEffect(() => { const clear = () => { if (!document.hasFocus()) setActivePreview(''); }; window.addEventListener('blur', clear); return () => window.removeEventListener('blur', clear); }, []);
  const hero = useRef<HTMLElement>(null);
  const catalog = [...new Map(media.filter(m => settings.discovery === 'all' || m.type === settings.discovery).map(m => [m.id, m])).values()];
  const pool = catalog.length ? catalog : Object.values(state.items).map(i => i.media);
  const movies = pool.filter(item => item.type === 'movie');
  const featuredById = new Map<string, Media>();
  for (const item of movies.length ? movies : pool) if (!featuredById.has(item.imdbId || item.id)) featuredById.set(item.imdbId || item.id, item);
  const featured = [...featuredById.values()];
  const activeIndex = featured.length ? slide % featured.length : 0;
  const selected = featured[activeIndex];
  const indicatorStart = Math.max(0, Math.min(activeIndex - 3, featured.length - 7));
  useEffect(() => {
    if (!settings.showSpotlight || !settings.bannerTrailers || settings.reducedMotion || !featured.length || document.hidden || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    for (const offset of [1, 2]) {
      const next = featured[(activeIndex + offset) % featured.length];
      void loadTrailers(state.addons, next).catch(() => {});
    }
  }, [selected?.id, featured.length, state.addons, settings.showSpotlight, settings.bannerTrailers, settings.reducedMotion]);
  useEffect(() => {
    if (!settings.rotateSpotlight || !settings.showSpotlight || settings.reducedMotion || featured.length < 2) return;
    const timer = setInterval(() => {
      if (!document.hidden && !matchMedia('(prefers-reduced-motion: reduce)').matches && !document.querySelector('dialog[open], [role="dialog"], .embedded-player') && (hero.current?.getBoundingClientRect().bottom ?? 0) > 100) setSlide(value => (value + 1) % featured.length);
    }, 8000);
    return () => clearInterval(timer);
  }, [slide, featured.length, settings.rotateSpotlight, settings.showSpotlight, settings.reducedMotion]);
  const progress = Object.values(state.items).filter(i => i.progress && i.progress.position > 0 && i.progress.position / i.progress.duration < settings.watchedThreshold / 100).map(i => i.media);
  const groups = new Map<string, { title: string; source: string; items: Media[] }>();
  for (const item of media.filter(m => settings.discovery === 'all' || m.type === settings.discovery)) {
    if (settings.hiddenRows.includes(rowKey(item))) continue;
    const key = `${item.source}:${item.type}:${item.catalogId ?? 'all'}`;
    const catalogTitle = item.catalogName || 'Popular';
    const title = /movie|series|show|film|tv/i.test(catalogTitle) ? catalogTitle : `${catalogTitle} ${item.type === 'series' ? 'Series' : 'Movies'}`;
    if (!groups.has(key)) groups.set(key, { title, source: item.source, items: [] });
    const group = groups.get(key)!;
    if (!group.items.some(m => m.id === item.id)) group.items.push(item);
  }
  return <PreviewContext.Provider value={{ active: activePreview, activate: setActivePreview, deactivate, reportPlaying }}><div className="cinema-home">
    {settings.showSpotlight && (selected ? <section ref={hero} className="cinema-hero" aria-label="Featured stories" style={{ backgroundImage: `linear-gradient(0deg,var(--theme-bg) 0%,transparent 60%),linear-gradient(90deg,#080e18b8,transparent 85%),${art(selected.art)}` }}>
      {settings.bannerTrailers && !settings.reducedMotion && !playingPreview && <HoverTrailer key={selected.id} media={selected} addons={state.addons} mode="banner" />}
      <div className="cinema-hero-copy"><p className="cinema-eyebrow">ASTER SPOTLIGHT <span> / </span> {selected.source}</p>{settings.showLogos && selected.logo ? <img className="cinema-title-logo" src={selected.logo} alt={selected.title} /> : <h1>{selected.title}</h1>}<p className="cinema-meta">{selected.type === 'series' ? 'Series' : 'Movie'} <span>·</span> {selected.genre} {selected.year > 0 && <><span>·</span> {selected.year}</>}{settings.showRatings && selected.rating && <><span>·</span><Star size={14} fill="currentColor" /> {selected.rating}</>}</p><p className="cinema-description">{selected.description}</p><div className="cinema-hero-actions">{selected.type === 'movie' && <button className="primary" onClick={() => play(selected)}><Play size={18} fill="currentColor" />{settings.resume && state.items[selected.id]?.progress && state.items[selected.id].progress!.position / state.items[selected.id].progress!.duration < settings.watchedThreshold / 100 ? 'Resume' : 'Play'}</button>}<button className="primary" onClick={() => selected.demo ? play(selected) : open(selected)}>{selected.demo ? <Play size={18} fill="currentColor" /> : <Info size={18} />}{selected.demo ? 'Watch preview' : 'View details'}</button><button className="cinema-save" onClick={() => library(selected)}>{state.items[selected.id]?.inLibrary ? <Check size={18} /> : <Bookmark size={18} />}{state.items[selected.id]?.inLibrary ? 'In your library' : 'My library'}</button></div></div>
      <div className="cinema-pagination" aria-label="Featured titles"><button className="carousel-arrow" aria-label="Previous featured title" onClick={() => setSlide(value => (value - 1 + featured.length) % featured.length)}><ChevronLeft size={15} /></button>{featured.slice(indicatorStart, indicatorStart + 7).map((m, i) => <button key={m.id} aria-label={`Feature ${m.title}`} aria-pressed={activeIndex === indicatorStart + i} onClick={() => setSlide(indicatorStart + i)} />)}<span className="carousel-count" aria-label="Featured title position">{activeIndex + 1} / {featured.length}</span><button className="carousel-arrow" aria-label="Next featured title" onClick={() => setSlide(value => (value + 1) % featured.length)}><ChevronRight size={15} /></button></div>
    </section> : <section className="cinema-hero cinema-welcome"><div className="cinema-hero-copy"><p className="cinema-eyebrow">WELCOME TO ASTER</p><h1>Your next story starts here.</h1><p className="cinema-description">Your installed catalogs will appear here. Add a catalog to discover movies and series, and a stream provider to watch them.</p><button className="primary" onClick={addons}>Manage addons<ChevronRight size={18} /></button></div></section>)}
    <div className={`cinema-shelves ${!settings.showSpotlight ? 'without-spotlight' : ''}`}>
      {settings.showContinue && progress.length > 0 && <Shelf title="Continue Watching" source="Your collection" items={progress} state={state} open={open} favorite={favorite} play={play} settings={settings} more={continueWatching} />}
      {settings.collections.map(c => { const items = c.mediaIds.map(id => state.items[id]?.media || catalog.find(m => m.id === id)).filter((m): m is Media => !!m); return items.length ? <Shelf key={c.id} title={c.name} source="Your collection" items={items} state={state} open={open} favorite={favorite} play={play} settings={settings} /> : null; })}
      {[...groups.entries()].map(([id, group]) => <Shelf key={id} {...group} state={state} open={open} favorite={favorite} play={play} settings={settings} />)}
    </div>
  </div></PreviewContext.Provider>;
}
