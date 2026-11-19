import { createContext, useContext, useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { invoke, isTauri } from '@tauri-apps/api/core';
import { check } from '@tauri-apps/plugin-updater';
import type { Update } from '@tauri-apps/plugin-updater';
import { relaunch } from '@tauri-apps/plugin-process';
import { Download, RefreshCw } from 'lucide-react';

const AUTO_KEY = 'aster.auto-updates.v1';
const IDLE_MS = 60_000;
type Status = 'idle' | 'checking' | 'current' | 'downloading' | 'ready' | 'installing' | 'error';
interface Updates { status: Status; version: string; progress: number | null; error: string; automatic: boolean; supported: boolean; busy: boolean; seconds: number; deferred: boolean; checkNow: () => void; install: () => void; later: () => void; setAutomatic: (enabled: boolean) => void }
const Context = createContext<Updates | null>(null);
export const useUpdates = () => useContext(Context);
const blocked = () => !!document.querySelector('.setup-shell, .embedded-player, dialog[open], [role="dialog"], video:not([data-update-ignore])') || ['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName || '');

export default function UpdateProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<Status>('idle');
  const [version, setVersion] = useState('');
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState('');
  const [automatic, setAuto] = useState(() => { try { return localStorage.getItem(AUTO_KEY) !== 'false'; } catch { return true; } });
  const [supported, setSupported] = useState(false);
  const [busy, setBusy] = useState(false);
  const [seconds, setSeconds] = useState(60);
  const [deferred, setDeferred] = useState(false);
  const update = useRef<Update | null>(null);
  const running = useRef(false);
  const installing = useRef(false);
  const lastActivity = useRef(Date.now());
  const live = useRef(false);
  const download = async (candidate: Update) => {
    setStatus('downloading'); setProgress(null); let total = 0; let received = 0;
    await candidate.download(event => {
      if (!live.current) return;
      if (event.event === 'Started') total = event.data.contentLength || 0;
      if (event.event === 'Progress') { received += event.data.chunkLength; setProgress(total ? Math.min(100, Math.round(received / total * 100)) : null); }
    }, { timeout: 120_000 });
    if (live.current) { lastActivity.current = Date.now(); setSeconds(60); setDeferred(false); setStatus('ready'); }
  };
  const checkNow = async () => {
    if (!isTauri() || running.current || installing.current || status === 'ready') return;
    running.current = true; setError(''); setStatus('checking');
    try {
      const candidate = await check({ timeout: 15_000 });
      if (!live.current) { await candidate?.close(); return; }
      await update.current?.close().catch(() => {}); update.current = candidate;
      if (!candidate) { setVersion(''); setStatus('current'); return; }
      setVersion(candidate.version);
      const installable = await invoke<boolean>('app_update_supported');
      if (!live.current) { await candidate.close(); return; }
      setSupported(!!installable);
      if (installable) await download(candidate);
      else { setStatus('ready'); setDeferred(true); }
    } catch { if (live.current) { setError('Updates could not be checked or verified. Your current app is unchanged. Please try again.'); setStatus('error'); await update.current?.close().catch(() => {}); update.current = null; } }
    finally { running.current = false; }
  };
  const install = async () => {
    if (!supported || !update.current || installing.current || blocked()) return;
    installing.current = true; setStatus('installing'); setError('');
    try {
      await invoke('app_prepare_update');
      await update.current.install({ restartAfterInstall: true });
      await relaunch();
    } catch { if (live.current) { setStatus('ready'); setDeferred(true); setError('The update could not be installed. Close other Aster windows and try Restart to update again.'); } }
    finally { installing.current = false; }
  };
  const actions = useRef({ checkNow, install }); actions.current = { checkNow, install };
  useEffect(() => {
    live.current = true;
    if (isTauri()) void invoke<boolean>('app_update_supported').then(value => { if (live.current) setSupported(!!value); }).catch(() => {});
    const activity = () => { lastActivity.current = Date.now(); };
    for (const event of ['pointermove', 'pointerdown', 'keydown', 'wheel']) window.addEventListener(event, activity, { passive: true });
    return () => { live.current = false; for (const event of ['pointermove', 'pointerdown', 'keydown', 'wheel']) window.removeEventListener(event, activity); void update.current?.close().catch(() => {}); update.current = null; };
  }, []);
  useEffect(() => {
    if (!isTauri() || !automatic) return;
    const startup = setTimeout(() => void actions.current.checkNow(), 4000);
    const interval = setInterval(() => void actions.current.checkNow(), 6 * 60 * 60 * 1000);
    const online = () => void actions.current.checkNow(); window.addEventListener('online', online);
    return () => { clearTimeout(startup); clearInterval(interval); window.removeEventListener('online', online); };
  }, [automatic]);
  useEffect(() => {
    if (status !== 'ready' || !supported) return;
    const timer = setInterval(() => {
      const occupied = blocked(); setBusy(occupied);
      if (occupied) lastActivity.current = Date.now();
      const remaining = Math.max(0, Math.ceil((IDLE_MS - (Date.now() - lastActivity.current)) / 1000)); setSeconds(remaining);
      if (automatic && !deferred && !occupied && remaining === 0) void actions.current.install();
    }, 1000);
    return () => clearInterval(timer);
  }, [status, supported, automatic, deferred]);
  const setAutomatic = (enabled: boolean) => { setAuto(enabled); lastActivity.current = Date.now(); try { localStorage.setItem(AUTO_KEY, String(enabled)); } catch { /* Applies to this session. */ } };
  const later = () => { setDeferred(true); setError(''); };
  const value: Updates = { status, version, progress, error, automatic, supported, busy, seconds, deferred, checkNow: () => void checkNow(), install: () => void install(), later, setAutomatic };
  return <Context.Provider value={value}>{children}{supported && ['downloading', 'ready', 'installing'].includes(status) && !document.querySelector('.setup-shell, .embedded-player, dialog[open]') && <aside className="update-banner" aria-label="App update" role="status"><Download size={21}/><div><strong>{status === 'downloading' ? `Downloading Aster ${version}${progress === null ? '…' : ` · ${progress}%`}` : status === 'installing' ? 'Installing update…' : `Aster ${version} is ready`}</strong><p>{error || (status === 'ready' ? busy ? 'Your update will wait until you finish watching or editing.' : automatic && !deferred ? `Updates when idle · ${seconds}s until restart` : 'Restart when you are ready to apply this update.' : 'Signed updates keep your library and settings.')}</p></div>{status === 'ready' && <><button className="secondary" onClick={later}>Later</button><button className="primary" disabled={busy} onClick={() => void install()}>Restart to update</button></>}</aside>}</Context.Provider>;
}

export function UpdateSettings() {
  const updates = useUpdates();
  if (!updates) return null;
  const { status, automatic, supported, checkNow, install, setAutomatic, error, version, busy } = updates;
  return <section className="settings-group"><h3>App updates</h3><p>New GitHub releases download automatically and install after a minute of inactivity. Playback and open dialogs postpone the restart.</p><div className="settings-group-body"><label className="setting-row"><span><strong>Automatic updates</strong><small>{supported ? 'Check at launch and every six hours. You can postpone any restart.' : 'Install the Windows setup build to enable automatic installation.'}</small></span><input role="switch" aria-label="Automatic updates" type="checkbox" checked={automatic} onChange={event => setAutomatic(event.target.checked)}/></label><div className="settings-button-row"><button className="secondary" disabled={!isTauri() || ['checking','downloading','installing'].includes(status)} onClick={checkNow}><RefreshCw size={16}/>{status === 'checking' ? 'Checking…' : 'Check for updates'}</button>{status === 'ready' && supported && <button className="primary" disabled={busy} onClick={install}>Restart to update</button>}</div><p className="settings-note" role="status">{error || (status === 'current' ? 'You are using the latest version.' : status === 'ready' ? supported ? `Version ${version} is ready to install.` : `Version ${version} is available from GitHub Releases. Install the Windows setup build to continue with automatic updates.` : !isTauri() ? 'Update checks are available in the Windows app.' : supported ? 'Only updates with Aster’s trusted signature can be installed.' : 'This is a portable or development preview. Use the setup installer for automatic updates.')}</p></div></section>;
}
