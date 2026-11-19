import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { invoke, isTauri } from '@tauri-apps/api/core';
import { Check, Copy, ExternalLink, FileVideo, Link, LoaderCircle, MonitorPlay, Play, ShieldCheck } from 'lucide-react';
import type { Media } from '../shared/models';
import type { DebridUser, TorrentInfo } from './debrid';
import { addMagnet, connectDebrid, disconnectDebrid, isVideo, selectFile, selectedFileLink, torrentInfo, unrestrictLink } from './debrid';
import { buildInfuseUrl, LANGUAGE_OPTIONS, supportsInfuseLaunch } from './players';
import type { PlaybackPreferences, PlayerChoice } from './players';
import Modal from './Modal';

const errorText = (error: unknown) => error instanceof Error ? error.message : String(error);
const rdMedia = (title: string): Media => ({ id: `rd:${title}`, title, type: 'movie', year: 0, genre: 'Your media', duration: 'Real-Debrid stream', description: 'A video resolved through your Real-Debrid account.', art: '/art/city.jpg', accent: '#baa9d0', source: 'Real-Debrid' });

export function InfuseHandoff({ media, source, position, close }: { media: Media; source: string; position: number; close: () => void }) {
  const [copied, setCopied] = useState(false);
  let url = ''; let error = '';
  try { url = buildInfuseUrl(media, source, position); } catch (e) { error = errorText(e); }
  const [copyError, setCopyError] = useState('');
  return <Modal title="Play with Infuse" close={close}><div className="account-body"><span className="account-symbol"><MonitorPlay size={28} /></span><h3>{media.title}</h3><p>Infuse is available on Apple devices. {supportsInfuseLaunch() ? 'Open the link with Infuse installed on this device.' : 'On Windows, copy this handoff link and open it on your Mac, iPhone, or iPad with Infuse installed.'}</p>{error ? <p role="alert" className="message error">{error}</p> : <><label htmlFor="infuse-link">Infuse playback link</label><textarea id="infuse-link" className="handoff-link" readOnly value={url} rows={4} /><button className="primary full-width" onClick={async () => { try { await navigator.clipboard.writeText(url); setCopied(true); setCopyError(''); } catch { setCopyError('Clipboard unavailable. Select and copy the link above.'); } }}>{copied ? <Check size={17} /> : <Copy size={17} />}{copied ? 'Link copied' : 'Copy Infuse link'}</button>{supportsInfuseLaunch() && <a className="secondary full-width external-link" href={url}><ExternalLink size={17} />Open in Infuse</a>}<p className="muted">Resume from {Math.floor(position)} seconds. {media.demo ? 'The handoff uses the public Sintel trailer URL so your Apple device can reach it.' : 'This link contains temporary access to this stream. Copy it only to your own devices; the provider may require the same network.'} External playback progress does not return to Aster yet.</p>{copyError && <p role="status" className="message">{copyError}</p>}</>}</div></Modal>;
}

export function TorrentResolver({ magnet, title, close, ready }: { magnet: string; title: string; close: () => void; ready: (url: string, filename: string) => void }) {
  const [id, setId] = useState('');
  const [info, setInfo] = useState<TorrentInfo | null>(null);
  const [selectedFile, setSelectedFile] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const check = async (torrentId: string, fileId: number | null) => {
    const result = await torrentInfo(torrentId); setInfo(result);
    if (fileId !== null && result.status === 'downloaded') { const link = selectedFileLink(result, fileId); const resolved = await unrestrictLink(link); ready(resolved.download, resolved.filename); return; }
    if (['error', 'magnet_error', 'virus', 'dead', 'magnet_conversion'].includes(result.status)) { setNotice(`Real-Debrid reported: ${result.status}. Try another source.`); return; }
    setNotice(result.files?.length ? `Status: ${result.status} · ${Math.round(result.progress || 0)}%` : 'Waiting for torrent metadata. Choose “Check readiness” in a moment.');
  };
  const start = async () => {
    setBusy(true); setError('');
    try { const torrentId = id || await addMagnet(magnet); setId(torrentId); setSubmitted(true); await check(torrentId, null); } catch (e) { setError(errorText(e)); } finally { setBusy(false); }
  };
  const prepare = async () => {
    if (selectedFile === null) return; setBusy(true); setError('');
    try {
      const fresh = await torrentInfo(id);
      if (fresh.status === 'waiting_files_selection') await selectFile(id, selectedFile);
      await check(id, selectedFile);
    } catch (e) { setError(errorText(e)); } finally { setBusy(false); }
  };
  const videos = info?.files?.filter(file => isVideo(file) && (info.status !== 'downloaded' || file.selected === 1)) ?? [];
  return <Modal title="Resolve with Real-Debrid" close={close} wide><div className="account-body"><h3>{title}</h3><p className="muted">Add this source to your Real-Debrid account, select the video file, then check readiness to get a playback link.</p>{!submitted ? <button className="primary" disabled={busy} onClick={() => void start()}>{busy ? <LoaderCircle size={17} className="spin" /> : <PlusIcon />}Add to Real-Debrid</button> : <><p className="message" role="status">{notice || 'Source added.'}</p><fieldset className="torrent-files"><legend>Choose a video file</legend>{videos.map(file => <label key={file.id}><input type="radio" name="torrent-file" checked={selectedFile === file.id} onChange={() => setSelectedFile(file.id)} /><FileVideo size={17} /><span>{file.path}<small>{(file.bytes / 1024 ** 3).toFixed(2)} GB</small></span></label>)}{!videos.length && <p className="muted">Video files will appear when metadata is ready.</p>}</fieldset><div className="detail-actions">{selectedFile !== null && <button className="primary" disabled={busy} onClick={() => void prepare()}>{busy && <LoaderCircle size={17} className="spin" />}Prepare selected file</button>}<button className="secondary" disabled={busy} onClick={async () => { setBusy(true); setError(''); try { await check(id, selectedFile); } catch (e) { setError(errorText(e)); } finally { setBusy(false); } }}>Check readiness</button></div><p className="muted">Uncached sources may take time. Closing this dialog keeps the torrent in your Real-Debrid account. Aster does not delete or manage other account torrents.</p></>}{error && <p role="alert" className="message error">{error}</p>}</div></Modal>;
}
function PlusIcon() { return <Link size={17} />; }

export function ServicesPanel({ user, onUser, player, onPlayer, play, torrent, mpvInstalled, preferences, onPreferences }: { user: DebridUser | null; onUser: (user: DebridUser | null) => void; player: PlayerChoice; onPlayer: (player: PlayerChoice) => void; play: (media: Media, url: string) => void; torrent: (magnet: string, media: Media) => void; mpvInstalled: boolean; preferences: PlaybackPreferences; onPreferences: (value: PlaybackPreferences) => void }) {
  const [token, setToken] = useState('');
  const [source, setSource] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [resolved, setResolved] = useState<{ download: string; filename: string } | null>(null);
  useEffect(() => { if (!user) { setResolved(null); setSource(''); } }, [user]);
  const connect = async (event: FormEvent) => {
    event.preventDefault(); setBusy(true); setError(''); setMessage('');
    try { const result = await connectDebrid(token); onUser(result); setToken(''); setMessage('Real-Debrid connected.'); } catch (e) { setError(errorText(e)); } finally { setBusy(false); }
  };
  const resolve = async (event: FormEvent) => {
    event.preventDefault(); setError(''); setMessage(''); setResolved(null);
    if (source.trim().startsWith('magnet:')) { torrent(source.trim(), rdMedia('Your torrent')); return; }
    setBusy(true);
    try { setResolved(await unrestrictLink(source.trim())); } catch (e) { setError(errorText(e)); } finally { setBusy(false); }
  };
  return <section className="content-page"><p className="eyebrow">YOUR CONNECTIONS. YOUR CHOICE.</p><h1>Playback & services<span>.</span></h1><p className="page-description">Connect Real-Debrid and choose where your stories play.</p><div className="service-section"><div className="service-heading"><span className="addon-icon"><ShieldCheck /></span><div><h2>Real-Debrid</h2><p>Resolve hoster links and torrent sources with your account.</p></div><span className="badge">{user ? 'CONNECTED' : 'OPTIONAL'}</span></div>{user ? <div className="connected-service"><div><strong>{user.username}</strong><p>{user.type === 'premium' ? 'Premium account' : `${user.type} account`}{user.expiration ? ` · Expires ${new Date(user.expiration).toLocaleDateString()}` : ''}</p></div><button className="secondary" disabled={busy} onClick={async () => { setBusy(true); setError(''); try { await disconnectDebrid(); onUser(null); setMessage('Real-Debrid disconnected from this device.'); } catch (e) { setError(errorText(e)); } finally { setBusy(false); } }}>Disconnect Real-Debrid</button></div> : <form onSubmit={connect}><label htmlFor="rd-token">Real-Debrid API token</label><div className="input-row"><input id="rd-token" type="password" autoComplete="off" placeholder="Paste your API token" value={token} onChange={e => setToken(e.target.value)} required /><button className="primary" disabled={busy}>{busy ? <LoaderCircle size={17} className="spin" /> : <ShieldCheck size={17} />}Connect Real-Debrid</button></div><p className="muted">Get your token at <a href="https://real-debrid.com/apitoken" target="_blank" rel="noreferrer" onClick={event => { if (isTauri()) { event.preventDefault(); void invoke("rd_open_token_page").catch(error => setError(String(error))); } }}>real-debrid.com/apitoken</a>. {isTauri() ? 'Your token is saved in Windows Credential Manager.' : 'Browser preview keeps the token only in memory until reload. The Windows app saves it in Credential Manager.'} It is never added to library saves or Supabase sync.</p></form>}{user && <form onSubmit={resolve}><label htmlFor="rd-source">Hoster URL or magnet link</label><div className="input-row"><input id="rd-source" value={source} onChange={e => setSource(e.target.value)} required placeholder="https://supported-hoster.example/video or magnet:?…" /><button className="primary" disabled={busy}>{busy ? <LoaderCircle size={17} className="spin" /> : <Link size={17} />}Resolve source</button></div><p className="muted">Hoster links generate a temporary playback URL. Magnet sources are added only after you choose “Add to Real-Debrid” in the next dialog.</p></form>}{resolved && <div className="resolved-source"><FileVideo size={22} /><span>{resolved.filename}<small>Ready to play with your preferred player</small></span><button className="primary" onClick={() => play(rdMedia(resolved.filename), resolved.download)}><Play size={15} />Play resolved video</button></div>}{message && <p className="message" role="status">{message}</p>}{error && <p className="message error" role="alert">{error}</p>}</div><div className="service-section"><div className="service-heading"><span className="addon-icon"><MonitorPlay /></span><div><h2>Your preferred player</h2><p>mpv is recommended for Windows. You can switch players anytime.</p></div></div><div className="player-options"><label className={player === "mpv" ? "chosen" : ""}><input type="radio" name="player" value="mpv" checked={player === "mpv"} disabled={!mpvInstalled} onChange={() => onPlayer("mpv")} /><MonitorPlay size={23} /><span>mpv · Recommended<small>{mpvInstalled ? "Installed · Plays inside Aster with saved progress" : "Available in the Windows app with mpv installed"}</small></span></label><label className={player === 'builtin' ? 'chosen' : ''}><input type="radio" name="player" value="builtin" checked={player === 'builtin'} onChange={() => onPlayer('builtin')} /><MonitorPlay size={23} /><span>Built-in player<small>Play directly in Aster on Windows</small></span></label><label className={player === 'infuse' ? 'chosen' : ''}><input type="radio" name="player" value="infuse" checked={player === 'infuse'} onChange={() => onPlayer('infuse')} /><ExternalLink size={23} /><span>Infuse<small>{supportsInfuseLaunch() ? 'Launch Infuse on this Apple device' : 'Copy a playback link to your Apple device'}</small></span></label></div><div className="language-settings"><h3>Voice language & subtitles</h3><p className="muted">Preferences apply when a video opens in mpv. Choose from the tracks included in the stream. During playback, use the Audio language and Subtitles buttons below the video to switch tracks.</p><div className="language-grid"><label htmlFor="audio-language">Preferred voice language<select id="audio-language" value={preferences.audioLanguage} onChange={e => onPreferences({ ...preferences, audioLanguage: e.target.value })}>{LANGUAGE_OPTIONS.map(l => <option key={l.code} value={l.code}>{l.name}</option>)}</select></label><label htmlFor="subtitle-mode">Subtitles<select id="subtitle-mode" value={preferences.subtitleMode} onChange={e => onPreferences({ ...preferences, subtitleMode: e.target.value as "auto" | "off" })}><option value="auto">On / automatically select</option><option value="off">Off</option></select></label><label htmlFor="subtitle-language">Preferred subtitle language<select id="subtitle-language" value={preferences.subtitleLanguage} onChange={e => onPreferences({ ...preferences, subtitleLanguage: e.target.value })}>{LANGUAGE_OPTIONS.map(l => <option key={l.code} value={l.code}>{l.name}</option>)}</select></label></div><p className="muted">The player lists audio and subtitle tracks included in the stream. A language preference selects an existing track; it does not translate or dub the movie.</p></div><p className="muted">Infuse runs on Apple platforms. Windows provides a transferable link; it cannot launch Infuse locally. Resume position is included, but external progress is not synced back yet. Your player preference is saved on this device.</p></div></section>;
}
