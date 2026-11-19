import { useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { ArrowDownToLine, ArrowRight, Bookmark, Check, ChevronRight, Clock3, Cloud, Compass, Heart, Home, Info, Library, LoaderCircle, MonitorPlay, Play, Plus, Puzzle, Search, Settings2, Sparkles, UserRound, X } from 'lucide-react';
import type { LocalState, Media, Stream } from '../shared/models';
import { isOpenCinema, loadState, saveState, updateItem } from './storage';
import { addonCatalog, hasResource, installAddon, resolveStreams, safeUrl, searchAddon, searchableCatalogs, supports } from './addons';
import type { LocalProfile } from './profiles';
import { updateProfile } from './profiles';
import ProfilePanel from './ProfilePanel';
import useProfileAutoSync from './useProfileAutoSync';
import Modal from './Modal';
import PlayerSources from './PlayerSources';
import EpisodePicker from './EpisodePicker';
import { episodeFile } from './episodes';
import { clearSeriesProgress, rememberEpisode } from './series-progress';
import useEpisodeQueue from './useEpisodeQueue';
import EpisodeControls from './EpisodeControls';
import EmbeddedPlayer from './EmbeddedPlayer';
import CinemaHome from './Home';
import SettingsHub from './SettingsHub';
import { applyTheme } from './theme';
import { invoke, isTauri } from '@tauri-apps/api/core';
import { loadSettings, saveSettings, mergeBackup, rankedSources, sourceLabel, sourceQuality } from './settings';
import type { AppSettings, Backup } from './settings';
import ServiceConnections from './ServiceConnections';
import { connections, chooseResolver, playService, resolveService } from './integrations';
import type { ConnectionSummary } from './integrations';
import { queueCompletion, flushTracking } from './tracking';
import { InfuseHandoff, ServicesPanel, TorrentResolver } from './Playback';
import { getDebridUser, streamMagnet, unrestrictLink, addMagnet, torrentInfo, selectFile, selectedFileLink, isVideo } from './debrid';
import type { DebridUser } from './debrid';
import { loadPlaybackPreferences, loadPlayer, mpvAvailable, savePlaybackPreferences, savePlayer } from './players';
import type { PlaybackPreferences, PlayerChoice } from './players';

type Page = 'Home' | 'Search' | 'Library' | 'Favorites' | 'Continue Watching' | 'Addons' | 'Playback & services' | 'Services';
const navigation = [{ name: 'Home', icon: Home }, { name: 'Search', icon: Search }, { name: 'Library', icon: Library }, { name: 'Favorites', icon: Heart }, { name: 'Continue Watching', icon: Clock3 }, { name: 'Services', icon: Cloud }] as const;
const genres = ['All stories', 'Fantasy', 'Adventure', 'Sci-Fi', 'Animation'];

function Player({ media: initialMedia, source, position, save, close, infuse, mpv, addons, settings, changeAuto }: { media: Media; source: string; position: number; addons: LocalState['addons']; settings: AppSettings; changeAuto: (value: boolean) => void; save: (media: Media, position: number, duration: number) => void; close: () => void; infuse: (media: Media, source: string) => void; mpv: (media: Media, source: string) => void }) {
  const ref = useRef<HTMLVideoElement>(null);
  const [media, setMedia] = useState(initialMedia);
  const [activeSource, setActiveSource] = useState(source);
  const [showSources, setShowSources] = useState(false);
  const resumeAt = useRef(position);
  const switchSource = (url: string) => { const video = ref.current; resumeAt.current = video?.currentTime ?? 0; if (url === activeSource) { video?.load(); void video?.play().catch(() => {}); } else setActiveSource(url); setError(''); setShowSources(false); };
  const lastSave = useRef(0);
  const [error, setError] = useState('');
  const persist = () => { const v = ref.current; if (v && Number.isFinite(v.duration)) save(media, v.currentTime, v.duration); };
  const queue = useEpisodeQueue(media, addons, settings, (nextMedia, url, signal) => { if(signal.aborted)return; persist(); resumeAt.current = 0; setMedia(nextMedia); setError(''); setShowSources(false); if(url===activeSource){ref.current?.load();void ref.current?.play().catch(()=>{});}else setActiveSource(url); });
  return <Modal title={media.demo ? `${media.title} · Demo preview` : media.title} wide close={() => { persist(); close(); }}>
    <video ref={ref} controls autoPlay playsInline src={activeSource} onLoadedMetadata={() => { const v = ref.current!; if (resumeAt.current < v.duration - 2) v.currentTime = resumeAt.current; }} onTimeUpdate={() => { const v = ref.current!; if (Math.abs(v.currentTime - lastSave.current) > 3) { persist(); lastSave.current = v.currentTime; } }} onPause={persist} onEnded={() => { persist(); queue.ended(); }} onError={() => setError('This source could not be played. Try another direct MP4 or WebM stream.')} />
    {error && <p role="alert" className="message error">{error}</p>}
    <div className="player-footer"><p className="player-note">{media.demo ? 'Demo playback uses the bundled Sintel trailer by the Blender Foundation, shared under CC BY 3.0. Your position is saved on this device.' : 'Direct video playback · Progress saves on this device.'}</p><div className="player-external-actions">{!media.demo && !media.service && <button className="secondary" aria-expanded={showSources} onClick={() => setShowSources(value => !value)}><Settings2 size={16} />Change source</button>}<button className="secondary" onClick={() => { persist(); mpv(media, activeSource); }}>Play with mpv</button><button className="secondary" onClick={() => { persist(); infuse(media, activeSource); }}>Play with Infuse</button></div></div>
    {media.episode && <EpisodeControls queue={queue} autoNext={settings.autoNext} changeAuto={changeAuto} />}
    {showSources && <PlayerSources media={media} addons={addons} settings={settings} currentSource={activeSource} select={switchSource} />}
  </Modal>;
}

export default function App({ profile, switchProfile }: { profile: LocalProfile; switchProfile: (id: string) => void }) {
  const [settings, setSettings] = useState<AppSettings>(() => ({...loadSettings(profile.id),profileName:profile.name}));
  const [serviceConnections, setServiceConnections] = useState<ConnectionSummary[]>([]);
  const [quickBusy, setQuickBusy] = useState(false);
  const [sourceChoicesOpen, setSourceChoicesOpen] = useState(false);
  const sourceChoices = useRef<HTMLDetailsElement>(null);
  const [quickMessage, setQuickMessage] = useState('');
  const playRequest = useRef(0);
  const [state, setState] = useState<LocalState>(() => loadState(profile.id));
  const stateRef = useRef(state);
  stateRef.current = state;
  const [page, setPage] = useState<Page>('Home');
  const [query, setQuery] = useState('');
  const [genre, setGenre] = useState('All stories');
  const [selected, setSelected] = useState<Media | null>(null);
  const [playing, setPlaying] = useState<{ media: Media; source: string } | null>(null);
  const [account, setAccount] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [addonUrl, setAddonUrl] = useState('');
  const [addonMedia, setAddonMedia] = useState<Media[]>([]);
  const [addonError, setAddonError] = useState('');
  const [streams, setStreams] = useState<Stream[] | null>(null);
  const [streamBusy, setStreamBusy] = useState(false);
  const [streamError, setStreamError] = useState('');
  const [toast, setToast] = useState('');
  const [debridUser, setDebridUser] = useState<DebridUser | null>(null);
  const [preferredPlayer, setPreferredPlayer] = useState<PlayerChoice>(loadPlayer);
  const [handoff, setHandoff] = useState<{ media: Media; source: string } | null>(null);
  const [torrent, setTorrent] = useState<{ media: Media; magnet: string } | null>(null);
  const [debridBusy, setDebridBusy] = useState(false);
  const [remoteSearch, setRemoteSearch] = useState<{ query: string; items: Media[]; busy: boolean; error: string }>({ query: '', items: [], busy: false, error: '' });
  const [searchAttempt, setSearchAttempt] = useState(0);
  const [playbackPreferences, setPlaybackPreferences] = useState<PlaybackPreferences>(loadPlaybackPreferences);
  const [mpvInstalled, setMpvInstalled] = useState(false);
  const [embeddedPlaying, setEmbeddedPlaying] = useState<{ media: Media; source: string } | null>(null);
  const searchTerm = query.trim();
  const searchProviders = settings.onlineSearch ? state.addons.filter(a => searchableCatalogs(a).length > 0) : [];
  const searching = page === 'Search' && searchTerm.length >= 2 && searchProviders.length > 0 && (remoteSearch.query !== searchTerm || remoteSearch.busy);
  const remoteItems = page === 'Search' && remoteSearch.query === searchTerm ? remoteSearch.items : [];

  useEffect(() => { const refresh = () => { void connections().then(items => { setServiceConnections(items); void flushTracking(items); }).catch(() => {}); }; refresh(); window.addEventListener('aster:integrations-changed', refresh); const retry=setInterval(refresh,60000); return () => { window.removeEventListener('aster:integrations-changed', refresh); clearInterval(retry); }; }, []);
  useEffect(() => { applyTheme(settings.accent); if (isTauri()) void invoke('app_set_theme', { accent: settings.accent }).catch(() => {}); }, [settings.accent]);
  useEffect(() => { setSettings(current => current.profileName === profile.name ? current : {...current,profileName:profile.name}); }, [profile.name]);
  useEffect(() => { if(settings.profileName!==profile.name)updateProfile(profile.id,{name:settings.profileName}); if (!saveSettings(settings, profile.id)) setToast('Preferences could not be saved on this device.'); }, [settings]);
  useEffect(() => { if (!saveState(state, profile.id)) setToast('Device storage is unavailable. Changes will only last for this session.'); }, [state]);
  useEffect(() => { if (!toast) return; const timer = setTimeout(() => setToast(''), 4500); return () => clearTimeout(timer); }, [toast]);
  useEffect(() => { void getDebridUser().then(setDebridUser).catch(() => {}); }, []);
  useEffect(() => {
    let cancelled = false;
    void mpvAvailable().then(available => {
      if (cancelled) return; setMpvInstalled(available);
      if (available) {
        try { if (localStorage.getItem('aster.mpv-default.v1') !== 'true') { setPreferredPlayer('mpv'); savePlayer('mpv'); localStorage.setItem('aster.mpv-default.v1', 'true'); } } catch { setPreferredPlayer('mpv'); }
      }
    }).catch(() => {});
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    let cancelled = false;
    if (!state.addons.length) { setAddonMedia([]); setAddonError(''); return; }
    void Promise.allSettled(state.addons.map(addonCatalog)).then(results => {
      if (cancelled) return;
      setAddonMedia(results.flatMap(r => r.status === 'fulfilled' ? r.value : []));
      setAddonError(results.some(r => r.status === 'rejected') ? 'Some addon catalogs could not load. In browser preview, addons must allow CORS. The desktop app uses native requests.' : '');
    });
    return () => { cancelled = true; };
  }, [state.addons]);
  useEffect(() => {
    if (page !== 'Search' || searchTerm.length < 2 || !settings.onlineSearch) { setRemoteSearch({ query: '', items: [], busy: false, error: '' }); return; }
    let cancelled = false;
    setRemoteSearch({ query: searchTerm, items: [], busy: true, error: '' });
    const timer = setTimeout(() => {
      const providers = state.addons.filter(a => searchableCatalogs(a).length > 0);
      void Promise.allSettled(providers.map(a => searchAddon(a, searchTerm))).then(results => {
        if (cancelled) return;
        const failed = results.flatMap((r, index) => r.status === 'rejected' || r.value.failedCatalogs ? [providers[index].manifest.name] : []);
        setRemoteSearch({ query: searchTerm, items: results.flatMap(r => r.status === 'fulfilled' ? r.value.items : []), busy: false, error: failed.length ? `Search could not reach all catalogs from ${failed.join(', ')}. Results from other catalogs are still shown.` : '' });
      });
    }, settings.searchDelay);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [page, searchTerm, state.addons, searchAttempt, settings.onlineSearch, settings.searchDelay]);
  useEffect(() => {
    setStreams(null); setStreamError('');
    if (!selected || selected.demo || selected.service || (selected.type === 'series' && !selected.episode)) { setStreamBusy(false); return; }
    let cancelled = false;
    setStreamBusy(true);
    void resolveStreams(state.addons, selected).then(result => { if (!cancelled) setStreams(result); }).catch(error => { if (!cancelled) setStreamError(String(error.message ?? error)); }).finally(() => { if (!cancelled) setStreamBusy(false); });
    return () => { cancelled = true; };
  }, [selected, state.addons]);

  const mergeProfileItems = (items: import('../shared/models').SavedMedia[]) => setState(current => { let changed=false; const merged={...current.items}; for(const item of items){if(!merged[item.media.id]||item.updatedAt>merged[item.media.id].updatedAt){merged[item.media.id]=item;changed=true;}}return changed?{...current,items:merged}:current; });
  useProfileAutoSync(profile,state,mergeProfileItems);
  const patch = (media: Media, data: Parameters<typeof updateItem>[2]) => setState(previous => updateItem(previous, media, data));
  const favorite = (media: Media) => { const next = !state.items[media.id]?.favorite; patch(media, { favorite: next }); setToast(next ? 'Added to your favorites' : 'Removed from favorites'); };
  const library = (media: Media) => { const next = !state.items[media.id]?.inLibrary; patch(media, { inLibrary: next }); setToast(next ? 'Added to your library' : 'Removed from library'); };
  const open = (media: Media) => { playRequest.current++; setQuickBusy(false); setQuickMessage(''); setSourceChoicesOpen(false); setSelected(media); setStreams(null); };
  const closeDetails = () => { playRequest.current++; setQuickBusy(false); setSelected(null); };
  const saveProgress = (media: Media, position: number, duration: number) => { if (settings.saveHistory && !media.live) { rememberEpisode(media); patch(media, { progress: { position, duration, updatedAt: new Date().toISOString() } }); queueCompletion(media, position, duration, serviceConnections, settings.watchedThreshold); void flushTracking(serviceConnections); } };
  const restoreBackup = (backup: Backup, includeSettings: boolean) => { setState(current => mergeBackup(current, backup)); if (includeSettings) setSettings(backup.settings); };
  const clearProgress = () => { clearSeriesProgress(); setState(current => ({ ...current, items: Object.fromEntries(Object.entries(current.items).map(([id, item]) => [id, { ...item, progress: undefined, updatedAt: new Date().toISOString() }])) })); };
  const openInfuse = (media: Media, url = '/media/sintel-trailer.mp4') => { setSelected(null); setPlaying(null); setHandoff({ media, source: url }); };
  const startMpv = (media: Media, url = '/media/sintel-trailer.mp4') => { setSelected(null); setPlaying(null); setEmbeddedPlaying({ media, source: url }); };
  const play = (media: Media, url = '/media/sintel-trailer.mp4') => { if (preferredPlayer === 'mpv') { void startMpv(media, url); return; } setSelected(null); if (preferredPlayer === 'infuse') openInfuse(media, url); else setPlaying({ media, source: url }); };
  const choosePlaybackPreferences = (preferences: PlaybackPreferences) => { setPlaybackPreferences(preferences); if (!savePlaybackPreferences(preferences)) setToast('Playback preferences could not be saved.'); };
  const choosePlayer = (player: PlayerChoice) => { setPreferredPlayer(player); if (!savePlayer(player)) setToast('Player preference could not be saved to this device.'); };
  const resolveDebrid = async (media: Media, stream: Stream) => {
    if (!debridUser) { setSelected(null); setPage('Playback & services'); setToast('Connect Real-Debrid to resolve this source.'); return; }
    setStreamError('');
    if (stream.infoHash) { try { const magnet = streamMagnet(stream); setSelected(null); setTorrent({ media, magnet }); } catch (error) { setStreamError(String(error)); } return; }
    if (!stream.url) return; setDebridBusy(true);
    try { const resolved = await unrestrictLink(stream.url); play(media, resolved.download); } catch (error) { setStreamError(error instanceof Error ? error.message : String(error)); } finally { setDebridBusy(false); }
  };
  const go = (name: Page) => { setPage(name); setGenre('All stories'); setQuery(''); };
  const allMedia = [...new Map([...addonMedia, ...Object.values(state.items).map(i => i.media), ...remoteItems].map(m => [m.id, m])).values()];
  const progressItems = Object.values(state.items).filter(i => i.progress && i.progress.position > 0 && i.progress.position / i.progress.duration < settings.watchedThreshold / 100);
  const visible = allMedia.filter(m => {
    const item = state.items[m.id];
    if (page === 'Favorites' && !item?.favorite) return false;
    if (page === 'Library' && !item?.inLibrary) return false;
    if (page === 'Continue Watching' && !progressItems.some(i => i.media.id === m.id)) return false;
    return (genre === 'All stories' || m.genre === genre) && (remoteItems.some(item => item.id === m.id) || `${m.title} ${m.genre} ${m.description}`.toLowerCase().includes(searchTerm.toLowerCase()));
  });

  if (settings.searchSort === 'title') visible.sort((a, b) => a.title.localeCompare(b.title));
  if (settings.searchSort === 'year') visible.sort((a, b) => b.year - a.year);

  const quickPlay = async (media: Media) => {
    if (media.service && !media.service.infoHash) { const request=++playRequest.current; setSelected(media);setQuickBusy(true);setQuickMessage('Opening your service video…'); try { const result=await playService(media); if (request===playRequest.current) play(media,result.url); } catch(e) { if(request===playRequest.current) setQuickMessage(e instanceof Error?e.message:'This service source could not be opened.'); } finally { if(request===playRequest.current)setQuickBusy(false); } return; }
    if (media.type === 'series' && !media.episode) { open(media); return; }
    if (media.demo) { play(media); return; }
    const request = ++playRequest.current; setSelected(media); setQuickBusy(true); setQuickMessage('Finding the best source…');
    try {
      const found: Stream[] = media.service?.infoHash ? [{ infoHash: media.service.infoHash, name: media.source }] : selected?.id === media.id && streams ? streams : await resolveStreams(state.addons, media);
      if (playRequest.current !== request) return;
      setStreams(found);
      const direct = rankedSources(found, settings.quality);
      if (direct.length) { setQuickBusy(false); play(media, direct[0].url!); return; }
      const torrentSource = rankedSources(found.filter(s => s.infoHash), settings.quality, true)[0];
      if (!torrentSource) throw new Error('No playable sources were returned. Try another title or check your stream addons in Settings.');
      let rdConnected=!!debridUser; if (!rdConnected && ['auto','real-debrid'].includes(settings.debridService)) { try { const account=await getDebridUser(); setDebridUser(account); rdConnected=true; } catch {} }
      const available=serviceConnections.length?serviceConnections:await connections();
      const resolver=chooseResolver(settings.debridService,rdConnected,available);
      if(!resolver) throw new Error('Connect your selected torrent service in Settings. Automatic can use Real-Debrid, TorBox, Premiumize or AllDebrid.');
      if(resolver!=='real-debrid'){if(media.episode) throw new Error('For episode torrents, use Real-Debrid or choose the exact episode file in your connected cloud library.');setQuickMessage('Preparing your video with your cloud service…');const result=await resolveService(resolver,streamMagnet(torrentSource));if(playRequest.current===request){setQuickBusy(false);play(media,result.url);}return;}
      setQuickMessage('Preparing your video with Real-Debrid…');
      const id = await addMagnet(streamMagnet(torrentSource));
      if (playRequest.current !== request) return;
      let info = await torrentInfo(id);
      const file = episodeFile((info.files || []).filter(isVideo), media);
      if (!file) throw new Error('No movie file is ready in this source. Choose another source.');
      if (playRequest.current !== request) return;
      if (info.status === 'waiting_files_selection') await selectFile(id, file.id);
      for (let attempt = 0; attempt < 8; attempt++) {
        if (playRequest.current !== request) return;
        info = await torrentInfo(id);
        if (info.status === 'downloaded') { const link = await unrestrictLink(selectedFileLink(info, file.id)); if (playRequest.current === request) { setQuickBusy(false); play(media, link.download); } return; }
        if (['error','magnet_error','virus','dead','magnet_conversion'].includes(info.status)) throw new Error('This source is unavailable. Choose another source.');
        setQuickMessage(`Real-Debrid is preparing this source (${Math.round(info.progress || 0)}%).`);
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
      throw new Error('This source is still preparing in Real-Debrid. Try a ready source or return later.');
    } catch (error) { if (playRequest.current === request) setQuickMessage(error instanceof Error ? error.message : 'Could not open this source. Try another.'); }
    finally { if (playRequest.current === request) setQuickBusy(false); }
  };

  const addAddon = async (event: FormEvent) => {
    event.preventDefault(); setBusy(true); setMessage('');
    try {
      const addon = await installAddon(addonUrl);
      setState(current => ({ ...current, addons: [...current.addons.filter(a => a.manifest.id !== addon.manifest.id), addon] }));
      setAddonUrl(''); setMessage(`${addon.manifest.name} installed.`);
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Could not install addon.'); } finally { setBusy(false); }
  };

  function Card({ media, compact = false }: { media: Media; compact?: boolean }) {
    const item = state.items[media.id];
    return <article className={`card ${compact ? 'continue-card' : ''}`}>
      <button className="card-art" style={{ backgroundImage: `linear-gradient(180deg, transparent 20%, #0009 100%), url("${media.art.replace(/["\\\n\r]/g, '')}")`, backgroundColor: media.accent }} onClick={() => open(media)} aria-label={`View ${media.title}`}>
        <span className="card-tag">{compact ? 'PICK UP WHERE YOU LEFT OFF' : media.genre}</span>
        <span className="art-title">{media.title}</span><span className="card-play"><Play size={19} fill="currentColor" /></span>
        {compact && <span className="progress"><span style={{ width: `${Math.min(100, (item?.progress?.position ?? 0) / (item?.progress?.duration || 1) * 100)}%` }} /></span>}
      </button>
      <div className="card-caption"><div><button className="text-button card-title" onClick={() => open(media)}>{media.title}</button><p>{compact ? `${Math.round((item?.progress?.position ?? 0) / (item?.progress?.duration || 1) * 100)}% watched · Demo preview` : `${media.year || 'Discover'} · ${media.duration}`}</p></div><button className={`icon-button small ${item?.favorite ? 'is-favorite' : ''}`} onClick={() => favorite(media)} aria-label={`${item?.favorite ? 'Unfavorite' : 'Favorite'} ${media.title}`}><Heart size={17} fill={item?.favorite ? 'currentColor' : 'none'} /></button></div>
    </article>;
  }

  function SourceRow({ source, media }: { source: Stream; media: Media }) {
    const label = sourceLabel(source); const quality = sourceQuality(source);
    let playable = false; try { playable = !!source.url && !!safeUrl(source.url); } catch {}
    return <div className="source-row clean-source"><button className="stream-button" disabled={quickBusy || (!playable && !source.infoHash)} onClick={() => playable ? play(media, source.url!) : void resolveDebrid(media, source)}><Play size={18} /><span>{label.name}<small>{label.detail}</small></span>{settings.showBadges && quality > 0 && <b className="source-quality">{quality === 2160 ? '4K' : quality + 'p'}</b>}</button></div>;
  }

  function StreamNotice({ media }: { media: Media }) {
    if (media.service || (media.type === 'series' && !media.episode)) return null;
    if (streamBusy || streamError || streams === null || streams.length) return null;
    const providers = state.addons.filter(a => supports(a, 'stream', media.type, media.id));
    const anyStreams = state.addons.some(a => hasResource(a, 'stream'));
    return <div className="message stream-guidance"><strong>{providers.length ? 'No playback sources returned' : anyStreams ? 'No compatible stream provider for this title' : 'A stream-provider addon is needed'}</strong><p>{providers.length ? `${providers.map(a => a.manifest.name).join(', ')} returned no sources for this title. Try another source provider or title.` : 'Catalog addons such as Cinemeta find movies and show their details. A separate addon that provides streams is needed to supply playback links.'}</p><p>{debridUser ? 'Real-Debrid is connected. It can resolve a link or torrent supplied by a stream provider; connecting it does not supply movie sources automatically.' : 'Real-Debrid can resolve links and torrents once connected, but a stream-provider addon must supply those sources first.'}</p><button className="secondary" onClick={() => { setSelected(null); go('Addons'); }}>Manage stream addons</button></div>;
  }

  return <div data-accent={settings.accent} data-density={settings.density} data-text-size={settings.textSize} data-reduced-motion={settings.reducedMotion} data-pinned-sidebar={settings.pinnedSidebar} className={`app-shell cinema-shell ${page === 'Home' ? 'cinema-home-page' : ''}`}>
    <aside className="sidebar" inert={!!embeddedPlaying}>
      <button className="brand" onClick={() => go('Home')} aria-label="Aster home"><span className="brand-mark">✳</span><span>aster<span className="brand-dot">.</span><small>CONTENT HUB</small></span></button>
      <p className="nav-label">YOUR UNIVERSE</p>
      <nav>{navigation.map(({ name, icon: Icon }) => <button key={name} aria-label={name} title={name} className={`nav-item ${page === name ? 'active' : ''}`} onClick={() => go(name)}><Icon size={19} /><span>{name}</span>{name === 'Favorites' && <span className="nav-count">{Object.values(state.items).filter(i => i.favorite).length}</span>}</button>)}</nav>
      <div className="sidebar-divider" /><p className="nav-label">MAKE IT YOURS</p>
      <button aria-label="Addons" title="Addons" className={`nav-item ${page === 'Addons' ? 'active' : ''}`} onClick={() => { go('Addons'); setMessage(''); }}><Puzzle size={19} /><span>Addons</span><span className="connection-dot" /></button>
      <button aria-label="Profiles & sync" title="Profiles & sync" className="nav-item" onClick={() => { setAccount(true); setMessage(''); }}><UserRound size={19} /><span>Profiles & sync</span></button>
      <button aria-label="Settings" title="Settings" className={`nav-item ${page === 'Playback & services' ? 'active' : ''}`} onClick={() => go('Playback & services')}><Settings2 size={19} /><span>Settings</span></button>
      <div className="sidebar-bottom"><div className="local-status"><span className="connection-dot" /><span>Made for your world<small>Local mode · Saved on this device</small></span></div><button className="profile" onClick={() => { setAccount(true); setMessage(''); }}><span className="avatar">{settings.profileName.slice(0,1).toUpperCase() || 'A'}</span><span>{settings.profileName}<small>{profile.cloudId ? 'Sync enabled' : 'Local profile'}</small></span><ChevronRight size={16} /></button></div>
    </aside>

    <main inert={!!embeddedPlaying}>
      <header className="topbar"><div className="breadcrumb">Your universe <ChevronRight size={13} /><span>{page === 'Home' ? 'Discover' : page === 'Playback & services' ? 'Settings' : page}</span></div><div className="topbar-actions"><span className="demo-pill"><span />LOCAL DEMO</span><button className="icon-button" onClick={() => go('Search')} aria-label="Open search"><Search size={20} /></button><button className="icon-button" onClick={() => go('Playback & services')} aria-label="Open settings"><MonitorPlay size={20} /></button><button className="avatar top-avatar" onClick={() => setAccount(true)} aria-label="Open account">A</button></div></header>

      {page === 'Home' ? <CinemaHome media={addonMedia} state={state} open={open} play={quickPlay} settings={settings} favorite={favorite} library={library} continueWatching={() => go('Continue Watching')} addons={() => go('Addons')} /> : page === 'Playback & services' ? <SettingsHub settings={settings} change={setSettings} state={state} media={addonMedia} account={() => setAccount(true)} addons={() => go('Addons')} restore={restoreBackup} clearProgress={clearProgress} mpvInstalled={mpvInstalled} serviceActions={{ play: (media, url) => url ? play(media, url) : void quickPlay(media), save: media => { patch(media, { inLibrary: true }); setToast('Saved to Library'); } }} services={<ServicesPanel mpvInstalled={mpvInstalled} preferences={playbackPreferences} onPreferences={choosePlaybackPreferences} user={debridUser} onUser={setDebridUser} player={preferredPlayer} onPlayer={choosePlayer} play={play} torrent={(magnet, media) => setTorrent({ magnet, media })} />} /> : page === 'Services' ? <section className="content-page"><p className="eyebrow">YOUR CONNECTED WORLD</p><h1>Your services<span>.</span></h1><p className="page-description">Browse your cloud files, media servers, watchlists and live channels.</p><ServiceConnections group="all" connectedOnly state={state} settings={settings} setup={() => go('Playback & services')} actions={{ play: (media, url) => url ? play(media, url) : void quickPlay(media), save: media => { patch(media, { inLibrary: true }); setToast('Saved to Library'); } }} /></section> : page === 'Addons' ? <section className="content-page"><p className="eyebrow">EXPAND YOUR UNIVERSE</p><h1>A world of possibilities<span>.</span></h1><p className="page-description">Connect your favorite Stremio-compatible catalogs and stream providers.</p><div className="addon-banner"><Puzzle size={38} /><div><h2>Your content. Your connections.</h2><p>Add a catalog or stream-provider manifest URL to build your content hub.</p></div><span className="badge">OPEN PROTOCOL</span></div><form onSubmit={addAddon} className="addon-form"><label htmlFor="addon-url">Addon manifest URL</label><div className="input-row"><input id="addon-url" type="url" required placeholder="https://your-addon.example/manifest.json" value={addonUrl} onChange={e => setAddonUrl(e.target.value)} /><button className="primary" disabled={busy}>{busy ? <LoaderCircle className="spin" size={17} /> : <Plus size={17} />}Install addon</button></div><p className="muted">Catalog and direct video sources are supported. Resolve torrent sources with Real-Debrid, or send playable URLs to Infuse on your Apple device.</p></form>{message && <p role="status" className="message">{message}</p>}{addonError && <p className="message error">{addonError}</p>}<div className="message addon-readiness"><strong>Catalogs find titles. Stream providers supply playback links.</strong><p>{state.addons.filter(a => hasResource(a, "stream")).length ? `Stream providers installed: ${state.addons.filter(a => hasResource(a, "stream")).map(a => a.manifest.name).join(", ")}. Source availability depends on each provider.` : "No stream-provider addon is installed. Cinemeta supplies catalog listings and search, but no playback links. Paste a stream-provider manifest above to add sources."}</p><p>Real-Debrid resolves the supplied sources; it does not replace a stream provider.</p></div><h2 className="list-title">Your connections</h2>{state.addons.map(a => <div className="addon-item" key={a.manifest.id}><span className="addon-icon"><Puzzle /></span><div><h3>{a.manifest.name} <small>v{a.manifest.version}</small></h3><p>{a.manifest.description}</p><div className="capability-tags">{hasResource(a, "catalog") && <span>Catalog</span>}{searchableCatalogs(a).length > 0 && <span>Search</span>}{hasResource(a, "meta") && <span>Details</span>}{hasResource(a, "stream") ? <span className="stream-capability">Playback sources</span> : <span>No playback sources</span>}</div></div><button className="secondary" onClick={() => setState(s => ({ ...s, addons: s.addons.filter(item => item.manifest.id !== a.manifest.id) }))}>Remove</button></div>)}</section> : <section className="content-page"><p className="eyebrow">{page === 'Search' ? 'FOLLOW YOUR CURIOSITY' : 'A COLLECTION THAT’S UNIQUELY YOU'}</p><h1>{page === 'Search' ? 'Find your next obsession' : page}<span>.</span></h1><p className="page-description">{page === 'Search' ? 'A title, a genre, a whole new world. Start exploring.' : page === 'Library' ? 'The stories you’ve saved for a good night in.' : page === 'Favorites' ? 'Some stories stay with you. Keep them close.' : 'Good stories deserve to be finished.'}</p><div className="search-field"><Search size={21} /><input aria-label="Search content" placeholder="Search titles, genres, and stories…" value={query} onChange={e => setQuery(e.target.value)} autoFocus={page === 'Search'} />{query && <button className="icon-button" aria-label="Clear search" onClick={() => setQuery('')}><X size={18} /></button>}<kbd>SEARCH</kbd></div><div className="genre-tabs">{genres.map(g => <button key={g} className={genre === g ? 'selected' : ''} onClick={() => setGenre(g)}>{g}</button>)}</div><div className="search-feedback">{page === "Search" && searching && <p role="status"><LoaderCircle size={14} className="spin" />Searching installed addon catalogs…</p>}{page === "Search" && searchTerm.length >= 2 && remoteSearch.query === searchTerm && remoteSearch.error && <div className="message error" role="status">{remoteSearch.error}<button className="secondary" onClick={() => setSearchAttempt(n => n + 1)}>Retry search</button></div>}{page === "Search" && state.addons.length > 0 && !searchProviders.length && <p>Installed addons do not advertise online search. Results below are filtered from loaded titles.</p>}{page === "Search" && !searchTerm && addonError && <p className="message error">{addonError}</p>}{page === "Search" && searchTerm.length === 1 && searchProviders.length > 0 && <p>Type at least 2 characters to search your installed catalogs.</p>}</div><div className="results-heading"><span>{visible.length} {visible.length === 1 ? 'story' : 'stories'} to explore</span><span>YOUR UNIVERSE, IN FOCUS</span></div>{visible.length ? <div className="media-grid">{visible.map(m => <Card key={m.id} media={m} compact={page === 'Continue Watching'} />)}</div> : searching ? <div className="empty"><LoaderCircle className="spin" size={32} /><p>Searching your installed catalogs…</p></div> : <div className="empty"><Compass size={44} /><h2>A little space for something great.</h2><p>{query ? 'Try another title or genre.' : 'Discover a story and add it to your collection.'}</p><button className="primary" onClick={() => go('Home')}>Explore stories <ArrowRight size={16} /></button></div>}</section>}
      <footer><span><span className="footer-star">✳</span> A place for every story.</span><span>ASTER CONTENT HUB <i /> PROTOTYPE 0.1</span></footer>
    </main>

    {selected && <Modal title={selected.title} close={closeDetails} wide><div className="detail-art" style={{ backgroundImage: `linear-gradient(0deg,#181b17,transparent),url("${selected.art.replace(/["\\\n\r]/g, '')}")` }}><span>{selected.genre}</span><h2>{selected.title}</h2></div><div className="detail-body"><p className="detail-meta">{selected.year || 'Discover'} · {selected.duration} · {selected.source}</p><p>{selected.description}</p><div className="detail-actions">{selected.episode && <button className="secondary" onClick={() => { const episode = selected.episode!; open(allMedia.find(m => m.id === episode.seriesId) || { ...selected, id: episode.seriesId, title: episode.seriesTitle, episode: undefined }); }}>Back to seasons</button>}{!selected.demo && (selected.type === 'movie' || selected.service || selected.episode) && <button className="primary detail-play" disabled={quickBusy || streamBusy} onClick={() => void quickPlay(selected)}>{quickBusy ? <LoaderCircle size={18} className="spin" /> : <Play size={18} fill="currentColor" />}{quickBusy ? 'Getting ready…' : settings.resume && state.items[selected.id]?.progress && state.items[selected.id].progress!.position / state.items[selected.id].progress!.duration < settings.watchedThreshold / 100 ? 'Resume' : 'Play'}</button>}{!selected.demo && !selected.service && (selected.type === 'movie' || selected.episode) && <button className="secondary" aria-expanded={sourceChoicesOpen} aria-controls="source-options" disabled={quickBusy || streamBusy || !streams?.length} onClick={() => { setSourceChoicesOpen(value => !value); requestAnimationFrame(() => sourceChoices.current?.scrollIntoView({ behavior: settings.reducedMotion ? 'instant' : 'smooth', block: 'nearest' })); }}><Settings2 size={17} />Choose source</button>}{selected.demo && <button className="primary" onClick={() => play(selected)}><Play size={17} fill="currentColor" />Watch demo preview</button>}{selected.demo && <button className="secondary" onClick={() => void startMpv(selected)}>Play with mpv</button>}{selected.demo && <button className="secondary" onClick={() => openInfuse(selected)}>Play with Infuse</button>}<button className="secondary" onClick={() => library(selected)}>{state.items[selected.id]?.inLibrary ? <Check size={17} /> : <Bookmark size={17} />}{state.items[selected.id]?.inLibrary ? 'Saved to library' : 'Add to library'}</button><button className="secondary" onClick={() => favorite(selected)}><Heart size={17} fill={state.items[selected.id]?.favorite ? 'currentColor' : 'none'} />{state.items[selected.id]?.favorite ? 'Favorited' : 'Favorite'}</button></div>{selected.type === 'series' && !selected.episode && !selected.service && <EpisodePicker media={selected} addons={state.addons} items={state.items} settings={settings} play={media => void quickPlay(media)} choose={media => { open(media); setSourceChoicesOpen(true); }} />}{selected.demo ? <p className="muted">Demonstration catalog. All demo titles play the bundled Sintel trailer; full films are not bundled. Landscape artwork is illustrative.</p> : <div className="streams">{quickMessage && <p className="quick-play-status" role="status">{quickMessage}</p>}{streamBusy && <p>Finding sources…</p>}{streamError && <p role="alert">{streamError}</p>}<StreamNotice media={selected} />{!!streams?.length && <details key={selected.id} id="source-options" ref={sourceChoices} className="source-chooser" open={sourceChoicesOpen} onToggle={event => setSourceChoicesOpen(event.currentTarget.open)}><summary>Available sources <small>{streams.length} available</small></summary>{streams.map((source, index) => <SourceRow key={index} source={source} media={selected} />)}</details>}</div>}</div></Modal>}

    {playing && <Player addons={state.addons} settings={settings} changeAuto={value => setSettings(current => ({...current, autoNext: value}))} media={playing.media} source={playing.source} position={settings.resume ? state.items[playing.media.id]?.progress?.position ?? 0 : 0} save={saveProgress} close={() => setPlaying(null)} infuse={(media, url) => openInfuse(media, url)} mpv={(media, url) => void startMpv(media, url)} />}

    {embeddedPlaying && <EmbeddedPlayer changeAuto={value => setSettings(current => ({...current, autoNext: value}))} addons={state.addons} media={embeddedPlaying.media} source={embeddedPlaying.source} position={(() => { const p = state.items[embeddedPlaying.media.id]?.progress; return settings.resume && p && p.position / p.duration < settings.watchedThreshold / 100 ? p.position : 0; })()} preferences={playbackPreferences} settings={settings} save={saveProgress} close={() => setEmbeddedPlaying(null)} />}
    {handoff && <InfuseHandoff media={handoff.media} source={handoff.source} position={state.items[handoff.media.id]?.progress?.position ?? 0} close={() => setHandoff(null)} />}
    {torrent && <TorrentResolver magnet={torrent.magnet} title={torrent.media.title} close={() => setTorrent(null)} ready={(url, filename) => { const media = torrent.media.title === "Your torrent" ? { ...torrent.media, id: `rd:${filename}`, title: filename } : torrent.media; setTorrent(null); play(media, url); }} />}
    {account && <Modal title="Profiles & sync" close={() => setAccount(false)}><ProfilePanel profile={profile} state={state} switchProfile={switchProfile} merge={mergeProfileItems} /></Modal>}
    {toast && <div className="toast" role="status"><Check size={17} />{toast}</div>}
  </div>;
}








