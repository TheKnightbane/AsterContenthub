import { useEffect, useRef, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { Check, ChevronDown, Languages, LoaderCircle, Maximize, Minimize, Pause, Play, SkipBack, SkipForward, Settings2, Subtitles, Volume2, VolumeX, X } from 'lucide-react';
import type { AppSettings } from './settings';
import type { Media } from '../shared/models';
import type { PlaybackPreferences } from './players';
import { launchMpv } from './players';
import PlayerSources from './PlayerSources';
import useEpisodeQueue from './useEpisodeQueue';
import EpisodeControls from './EpisodeControls';

interface Track { id: number; type: 'audio' | 'sub'; lang?: string; title?: string; codec?: string; selected?: boolean }
interface PlayerEvent { sessionId: string; kind: string; action?: string; position?: number; duration?: number; paused?: boolean; volume?: number; muted?: boolean; tracks?: Track[]; success?: boolean; completed?: boolean }
export function formatTime(seconds: number) { if (!Number.isFinite(seconds) || seconds < 0) return '0:00'; const whole = Math.floor(seconds); const hours = Math.floor(whole / 3600); const minutes = Math.floor(whole % 3600 / 60); return `${hours ? `${hours}:` : ''}${hours ? String(minutes).padStart(2, '0') : minutes}:${String(whole % 60).padStart(2, '0')}`; }
export function trackLabel(track: Track) {
  let language = track.lang || '';
  try { if (language && language !== 'und') language = new Intl.DisplayNames(['en'], { type: 'language' }).of(language) || language; } catch { /* Keep the provider's language code. */ }
  return [language === 'und' ? '' : language, track.title].filter(Boolean).join(' · ') || `${track.type === 'audio' ? 'Audio' : 'Subtitle'} track ${track.id}`;
}

export default function EmbeddedPlayer({ media: initialMedia, source, position: resumePosition, preferences, settings, save, close, addons, changeAuto }: { changeAuto: (value: boolean) => void; addons: import('../shared/models').InstalledAddon[]; media: Media; source: string; position: number; preferences: PlaybackPreferences; settings: AppSettings; save: (media: Media, position: number, duration: number) => void; close: () => void }) {
  const surface = useRef<HTMLDivElement>(null);
  const [media, setMedia] = useState(initialMedia);
  const live = useRef(true);
  useEffect(() => {live.current=true;return()=>{live.current=false;};}, []);
  const [sessionId, setSessionId] = useState(() => crypto.randomUUID());
  const currentSession = useRef(sessionId); currentSession.current=sessionId;
  const [activeSource, setActiveSource] = useState(source);
  const playbackPosition = useRef(resumePosition);
  const switchSource = async (url: string) => { await invoke('mpv_stop', { sessionId }).catch(() => {}); if(!live.current)return; setActiveSource(url); setSessionId(crypto.randomUUID()); setPanel(null); setError(''); };
  useEffect(() => () => { if (fullscreenRef.current) void invoke('mpv_fullscreen', { enabled: false }).catch(() => {}); }, []);
  const queue = useEpisodeQueue(media, addons, settings, async (nextMedia, url, signal) => { await invoke('mpv_stop', { sessionId }).catch(() => {}); if(signal.aborted||!live.current)return; playbackPosition.current=0;setPosition(0);setMedia(nextMedia);setActiveSource(url);setSessionId(crypto.randomUUID());setPanel(null);setError(''); });
  const callbacks = useRef({ save, close, ended: queue.ended, media }); callbacks.current = { save, close, ended: queue.ended, media };
  const [position, setPosition] = useState(resumePosition);
  const [duration, setDuration] = useState(0);
  const [paused, setPaused] = useState(false);
  const [volume, setVolume] = useState(100);
  const [muted, setMuted] = useState(false);
  const [tracks, setTracks] = useState<Track[]>([]);
  const [panel, setPanel] = useState<'audio' | 'sub' | 'source' | null>(null);
  const [status, setStatus] = useState<'loading' | 'playing' | 'ended' | 'error'>('loading');
  const [error, setError] = useState('');
  const [fullscreen, setFullscreen] = useState(false);
  const fullscreenRef = useRef(false);
  const ignoreMotionUntil = useRef(0);
  const [chromeVisible, setChromeVisible] = useState(true);
  const [activity, setActivity] = useState(0);
  const [controlsHovered, setControlsHovered] = useState(false);
  const revealControls = () => { if (fullscreenRef.current && Date.now() < ignoreMotionUntil.current) return; setChromeVisible(true); setActivity(v => v + 1); };
  useEffect(() => {
    if (!fullscreen || !chromeVisible || controlsHovered || panel || error || status === 'error' || status === 'ended') return;
    const timer = setTimeout(() => {
      if (document.activeElement instanceof HTMLElement && document.activeElement.closest('.embedded-player')) document.activeElement.blur();
      ignoreMotionUntil.current = Date.now() + 500;
      setChromeVisible(false);
    }, settings.controlsDelay * 1000);
    return () => clearTimeout(timer);
  }, [fullscreen, chromeVisible, activity, controlsHovered, panel, error, status, settings.controlsDelay]);
  const [seeking, setSeeking] = useState<number | null>(null);

  useEffect(() => {
    const priorOverflow = document.body.style.overflow; document.body.style.overflow = 'hidden';
    setStatus('loading'); setTracks([]); setDuration(0);
    let cancelled = false; let started = false; let subscription: (() => void) | undefined;
    const bounds = () => { const rect = surface.current!.getBoundingClientRect(); return { x: rect.x, y: rect.y, width: Math.max(1, rect.width), height: Math.max(1, rect.height) }; };
    const resize = () => { if (started && !cancelled && surface.current) void invoke('mpv_resize', { sessionId, ...bounds() }).catch(() => {}); };
    const observer = new ResizeObserver(resize); observer.observe(surface.current!);
    window.addEventListener('resize', resize);
    const timer = setTimeout(() => {
      void (async () => {
        try {
          subscription = await listen<PlayerEvent>('mpv-playback', event => {
            if (cancelled || event.payload.sessionId !== sessionId || currentSession.current !== sessionId) return;
            const data = event.payload;
            if (data.kind === 'input') {
              if (data.action === 'activity' && Date.now() >= ignoreMotionUntil.current) keyboardRef.current.revealControls();
              if (data.action === 'fullscreen') void keyboardRef.current.toggleFullscreen();
              if (data.action === 'escape') void keyboardRef.current.escape();
            }
            if (data.kind === 'progress' && Number.isFinite(data.position) && Number.isFinite(data.duration) && data.duration! > 0 && data.position! >= 0) { playbackPosition.current = data.position!; setPosition(data.position!); setDuration(data.duration!); setStatus('playing'); callbacks.current.save(media, data.position!, data.duration!); }
            if (data.kind === 'state') { setPaused(!!data.paused); if (Number.isFinite(data.volume)) setVolume(data.volume!); setMuted(!!data.muted); if (Array.isArray(data.tracks)) setTracks(data.tracks.filter(t => Number.isInteger(t.id) && ['audio', 'sub'].includes(t.type))); }
            if (data.kind === 'ended') { started = false; setStatus(data.success ? 'ended' : 'error'); if (data.completed && data.success) callbacks.current.ended(); if (!data.success) setError('This source could not be played. Use Change source to try another link.'); }
          });
          if (cancelled) { subscription(); return; }
          await launchMpv(media, activeSource, playbackPosition.current, sessionId, preferences, bounds());
          started = true;
          if (cancelled) { await invoke('mpv_stop', { sessionId }); subscription?.(); return; }
          resize();
        } catch (e) { if (!cancelled) { setStatus('error'); setError(e instanceof Error ? e.message : String(e)); } }
      })();
    }, 0);
    return () => {
      cancelled = true; clearTimeout(timer); observer.disconnect(); window.removeEventListener('resize', resize); document.body.style.overflow = priorOverflow;
      if (started) void invoke('mpv_stop', { sessionId }).catch(() => {});
      subscription?.();
    };
  }, [sessionId]);

  const control = async (action: string, value: number | string | null = null) => { try { await invoke('mpv_control', { sessionId, action, value }); setError(''); } catch (e) { setError(e instanceof Error ? e.message : String(e)); } };
  const toggleFullscreen = async () => { try { const next = await invoke<boolean>('mpv_fullscreen', { enabled: null }); fullscreenRef.current = next; setFullscreen(next); setPanel(null); setControlsHovered(false); ignoreMotionUntil.current = Date.now() + 500; setChromeVisible(!next); } catch (e) { setError(String(e)); } };
  const dismiss = async () => { await invoke('mpv_stop', { sessionId }).catch(() => {}); callbacks.current.close(); };
  const escape = () => fullscreenRef.current ? toggleFullscreen() : dismiss();
  const keyboardRef = useRef({ escape, control, toggleFullscreen, revealControls }); keyboardRef.current = { escape, control, toggleFullscreen, revealControls };
  useEffect(() => { const handler = (event: KeyboardEvent) => { if (['INPUT', 'SELECT', 'TEXTAREA'].includes((event.target as HTMLElement)?.tagName)) return; if (event.key === 'Escape') { event.preventDefault(); void keyboardRef.current.escape(); } else if (event.key === ' ') { event.preventDefault(); void keyboardRef.current.control('pause'); } else if (event.key.toLowerCase() === 'f') { event.preventDefault(); void keyboardRef.current.toggleFullscreen(); } else if (event.key === 'Tab') keyboardRef.current.revealControls(); }; window.addEventListener('keydown', handler); return () => window.removeEventListener('keydown', handler); }, []);
  const activeAudio = tracks.find(t => t.type === 'audio' && t.selected);
  const activeSubtitle = tracks.find(t => t.type === 'sub' && t.selected);
  const active = status === 'playing' || status === 'loading';
  return <section className={`embedded-player ${fullscreen ? 'is-fullscreen' : ''} ${fullscreen && !chromeVisible && !error && status !== 'ended' && status !== 'error' ? 'chrome-hidden' : ''}`} role="dialog" aria-modal="true" aria-label={`Playing ${media.title}`} onPointerMove={revealControls}>
    <header className="embedded-header"><div><span className="eyebrow">ASTER CINEMA · MPV</span><h2>{media.title}</h2></div><button className="icon-button" autoFocus onClick={() => void dismiss()} aria-label="Close player"><X size={23} /></button></header>
    <div className="embedded-video" ref={surface} data-testid="embedded-video-surface">{status === 'loading' && <div className="embedded-placeholder"><LoaderCircle className="spin" size={30} /><p>Opening your stream…</p></div>}{status === 'ended' && <div className="embedded-placeholder"><Check size={35} /><p>Playback finished. Your progress is saved.</p></div>}{status === 'error' && <div className="embedded-placeholder"><p>Playback unavailable</p></div>}</div>
    <div className="embedded-controls" onPointerEnter={() => setControlsHovered(true)} onPointerLeave={() => { setControlsHovered(false); revealControls(); }}>
      {error && <p className="embedded-error" role="alert">{error}</p>}
      <div className="embedded-seek"><span>{formatTime(seeking ?? position)}</span><input aria-label="Seek video" type="range" min="0" max={duration || 1} step="1" value={seeking ?? Math.min(position, duration || 1)} disabled={!duration || !active} onChange={e => setSeeking(Number(e.target.value))} onPointerUp={e => { void control('seek', Number(e.currentTarget.value)); setSeeking(null); }} onKeyUp={e => { if (['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) { void control('seek', Number(e.currentTarget.value)); setSeeking(null); } }} /><span>{formatTime(duration)}</span></div>
      <div className="embedded-toolbar"><div className="transport-controls"><button className="icon-button" aria-label={`Back ${settings.seekSeconds} seconds`} disabled={!active} onClick={() => void control('seek', Math.max(0, position - settings.seekSeconds))}><SkipBack size={20} /></button><button className="play-toggle" aria-label={paused ? 'Resume video' : 'Pause video'} disabled={!active} onClick={() => void control('pause')}>{paused ? <Play size={21} fill="currentColor" /> : <Pause size={21} fill="currentColor" />}</button><button className="icon-button" aria-label={`Forward ${settings.seekSeconds} seconds`} disabled={!active} onClick={() => void control('seek', Math.min(duration || position + settings.seekSeconds, position + settings.seekSeconds))}><SkipForward size={20} /></button><button className="icon-button" aria-label={muted ? 'Unmute video' : 'Mute video'} onClick={() => void control('mute')} disabled={!active}>{muted ? <VolumeX size={20} /> : <Volume2 size={20} />}</button><input className="volume-slider" aria-label="Video volume" type="range" min="0" max="100" value={volume} disabled={!active} onChange={e => { setVolume(Number(e.target.value)); }} onPointerUp={e => void control('volume', Number(e.currentTarget.value))} onKeyUp={e => void control('volume', Number(e.currentTarget.value))} /></div><div className="track-controls">{!media.demo && !media.service && <button className={`track-button ${panel === 'source' ? 'selected' : ''}`} aria-expanded={panel === 'source'} onClick={() => setPanel(panel === 'source' ? null : 'source')}><Settings2 size={19}/><span>Change source</span><ChevronDown size={15}/></button>}<button className={`track-button ${panel === 'audio' ? 'selected' : ''}`} aria-expanded={panel === 'audio'} onClick={() => setPanel(panel === 'audio' ? null : 'audio')}><Languages size={19} /><span>Audio language<small>{activeAudio ? trackLabel(activeAudio) : 'Stream default'}</small></span><ChevronDown size={15} /></button><button className={`track-button ${panel === 'sub' ? 'selected' : ''}`} aria-expanded={panel === 'sub'} onClick={() => setPanel(panel === 'sub' ? null : 'sub')}><Subtitles size={19} /><span>Subtitles<small>{activeSubtitle ? trackLabel(activeSubtitle) : 'Off'}</small></span><ChevronDown size={15} /></button><button className="icon-button" aria-label={fullscreen ? 'Exit fullscreen' : 'Fullscreen'} onClick={() => void toggleFullscreen()}>{fullscreen ? <Minimize size={21} /> : <Maximize size={21} />}</button></div></div>
      {media.episode && <EpisodeControls queue={queue} autoNext={settings.autoNext} changeAuto={changeAuto} />}
      {panel === 'source' && <PlayerSources media={media} addons={addons} settings={settings} currentSource={activeSource} select={switchSource} />}{(panel === 'audio' || panel === 'sub') && <div className="embedded-track-panel" role="group" aria-label={panel === 'audio' ? 'Audio tracks' : 'Subtitle tracks'}><h3>{panel === 'audio' ? 'Choose audio language' : 'Choose subtitles'}</h3><div className="track-choices">{panel === 'sub' && <button className={!activeSubtitle ? 'chosen' : ''} onClick={() => void control('subtitles', 'no')}>Off{!activeSubtitle && <Check size={16} />}</button>}{tracks.filter(t => t.type === panel).map(track => <button key={track.id} className={track.selected ? 'chosen' : ''} onClick={() => void control(panel === 'audio' ? 'audio' : 'subtitles', track.id)}><span>{trackLabel(track)}<small>{track.codec?.toUpperCase()}</small></span>{track.selected && <Check size={16} />}</button>)}{!tracks.some(t => t.type === panel) && <p>{status === 'loading' ? 'Tracks will appear when the stream loads.' : panel === 'audio' ? 'No audio tracks were reported by this stream.' : 'This stream does not include subtitle tracks. Try another source with subtitles.'}</p>}</div></div>}
      <p className="embedded-credit">{media.demo ? 'Demo preview · Sintel trailer © Blender Foundation · CC BY 3.0' : 'Your progress saves automatically · Audio and subtitles depend on the selected stream.'}</p>
    </div>
  </section>;
}



