import { createContext, useContext, useId, useRef, useState } from 'react';
import HoverTrailer from './HoverTrailer';
import { Bookmark, Check, ChevronLeft, ChevronRight, Heart, Info, Play, Star } from 'lucide-react';
import type { LocalState, Media } from '../shared/models';
import type { AppSettings } from './settings';
import { rowKey } from './settings';

const PreviewContext = createContext<{ active: string; activate: (key: string) => void }>({ active: '', activate: () => {} });

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
      return <article className="landscape-card" key={media.id} onPointerEnter={e => { if (e.pointerType === 'mouse' && settings.hoverTrailers && !settings.reducedMotion && !matchMedia('(prefers-reduced-motion: reduce)').matches) preview.activate(previewKey); }} onPointerLeave={() => { if (preview.active === previewKey) preview.activate(''); }}>
        <button className="landscape-art" onClick={() => open(media)} aria-label={`View ${media.title}`} style={{ backgroundImage: `linear-gradient(0deg,#000d,transparent 72%),${art(media.art)}`, backgroundColor: '#18232d' }}>
          {preview.active === previewKey && settings.hoverTrailers && !settings.reducedMotion && <HoverTrailer media={media} addons={state.addons} />}
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
  const catalog = [...new Map(media.filter(m => settings.discovery === 'all' || m.type === settings.discovery).map(m => [m.id, m])).values()];
  const featured = (catalog.length ? catalog : Object.values(state.items).map(i => i.media)).slice(0, 6);
  const selected = featured[slide % featured.length];
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
  return <PreviewContext.Provider value={{ active: activePreview, activate: setActivePreview }}><div className="cinema-home">
    {settings.showSpotlight && (selected ? <section className="cinema-hero" aria-label="Featured stories" style={{ backgroundImage: `linear-gradient(0deg,var(--theme-bg) 0%,transparent 60%),linear-gradient(90deg,#080e18b8,transparent 85%),${art(selected.art)}` }}>
      <div className="cinema-hero-copy"><p className="cinema-eyebrow">ASTER SPOTLIGHT <span> / </span> {selected.source}</p>{settings.showLogos && selected.logo ? <img className="cinema-title-logo" src={selected.logo} alt={selected.title} /> : <h1>{selected.title}</h1>}<p className="cinema-meta">{selected.type === 'series' ? 'Series' : 'Movie'} <span>·</span> {selected.genre} {selected.year > 0 && <><span>·</span> {selected.year}</>}{settings.showRatings && selected.rating && <><span>·</span><Star size={14} fill="currentColor" /> {selected.rating}</>}</p><p className="cinema-description">{selected.description}</p><div className="cinema-hero-actions">{selected.type === 'movie' && <button className="primary" onClick={() => play(selected)}><Play size={18} fill="currentColor" />{settings.resume && state.items[selected.id]?.progress && state.items[selected.id].progress!.position / state.items[selected.id].progress!.duration < settings.watchedThreshold / 100 ? 'Resume' : 'Play'}</button>}<button className="primary" onClick={() => selected.demo ? play(selected) : open(selected)}>{selected.demo ? <Play size={18} fill="currentColor" /> : <Info size={18} />}{selected.demo ? 'Watch preview' : 'View details'}</button><button className="cinema-save" onClick={() => library(selected)}>{state.items[selected.id]?.inLibrary ? <Check size={18} /> : <Bookmark size={18} />}{state.items[selected.id]?.inLibrary ? 'In your library' : 'My library'}</button></div></div>
      <div className="cinema-pagination" aria-label="Featured titles">{featured.map((m, i) => <button key={m.id} aria-label={`Feature ${m.title}`} aria-pressed={slide % featured.length === i} onClick={() => setSlide(i)} />)}</div>
    </section> : <section className="cinema-hero cinema-welcome"><div className="cinema-hero-copy"><p className="cinema-eyebrow">WELCOME TO ASTER</p><h1>Your next story starts here.</h1><p className="cinema-description">Your installed catalogs will appear here. Add a catalog to discover movies and series, and a stream provider to watch them.</p><button className="primary" onClick={addons}>Manage addons<ChevronRight size={18} /></button></div></section>)}
    <div className={`cinema-shelves ${!settings.showSpotlight ? 'without-spotlight' : ''}`}>
      {settings.showContinue && progress.length > 0 && <Shelf title="Continue Watching" source="Your collection" items={progress} state={state} open={open} favorite={favorite} play={play} settings={settings} more={continueWatching} />}
      {settings.collections.map(c => { const items = c.mediaIds.map(id => state.items[id]?.media || catalog.find(m => m.id === id)).filter((m): m is Media => !!m); return items.length ? <Shelf key={c.id} title={c.name} source="Your collection" items={items} state={state} open={open} favorite={favorite} play={play} settings={settings} /> : null; })}
      {[...groups.entries()].map(([id, group]) => <Shelf key={id} {...group} state={state} open={open} favorite={favorite} play={play} settings={settings} />)}
    </div>
  </div></PreviewContext.Provider>;
}
