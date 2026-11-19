import { useEffect, useRef, useState } from 'react';
import { invoke, isTauri } from '@tauri-apps/api/core';
import { ArrowLeft, ArrowRight, Check, ExternalLink, LoaderCircle, Play, Plus, Puzzle, ShieldCheck, Sparkles } from 'lucide-react';
import { hasResource, installAddon } from './addons';
import { connectDebrid, getDebridUser } from './debrid';
import type { DebridUser } from './debrid';
import { activeProfile } from './profiles';
import { loadState, saveState } from './storage';
import { saveSetup, setupState } from './setup';
import { loadSettings } from './settings';
import { applyTheme } from './theme';
import './setup.css';

const steps = ['Welcome', 'Addons', 'Real-Debrid', 'Ready'];
const CINEMETA = 'https://v3-cinemeta.strem.io/manifest.json';
export default function SetupWizard({ done }: { done: () => void }) {
  const [step, setStep] = useState(() => setupState()?.status === 'in-progress' ? setupState()!.step : 0);
  const profileId = useRef(activeProfile().id).current;
  const [state, setState] = useState(() => loadState(profileId));
  const [url, setUrl] = useState(''); const [token, setToken] = useState('');
  const [user, setUser] = useState<DebridUser | null>(null);
  const [busy, setBusy] = useState(false); const [error, setError] = useState(''); const [notice, setNotice] = useState('');
  const live = useRef(true);
  useEffect(() => { live.current = true; applyTheme(loadSettings(profileId).accent); void getDebridUser().then(value => { if (live.current) setUser(value); }).catch(() => {}); return () => { live.current = false; }; }, [profileId]);
  useEffect(() => { saveSetup('in-progress', step); setError(''); setNotice(''); }, [step]);
  const finish = () => { setToken(''); saveSetup('complete', 3); done(); };
  const add = async (input: string) => {
    setBusy(true); setError(''); setNotice('');
    try {
      const addon = await installAddon(input);
      if (!live.current) return;
      const latest = loadState(profileId);
      const next = { ...latest, addons: [...latest.addons.filter(item => item.manifest.id !== addon.manifest.id), addon] };
      if (!saveState(next, profileId)) throw new Error('storage');
      setState(next); setUrl(''); setNotice(`${addon.manifest.name} added.`);
    } catch { if (live.current) setError('Could not add that addon. Check its full manifest URL and connection, then try again.'); }
    finally { if (live.current) setBusy(false); }
  };
  const connect = async () => {
    setBusy(true); setError(''); setNotice('');
    try { const account = await connectDebrid(token); if (live.current) { setUser(account); setToken(''); setNotice('Real-Debrid connected.'); } }
    catch { if (live.current) setError('Could not connect Real-Debrid. Check your API token and account, then try again.'); }
    finally { if (live.current) setBusy(false); }
  };
  const cinemetaInstalled = state.addons.some(addon => addon.manifest.id === 'com.linvo.cinemeta' || addon.url === CINEMETA);
  const streams = state.addons.filter(addon => hasResource(addon, 'stream'));
  const catalogs = state.addons.filter(addon => hasResource(addon, 'catalog'));
  return <main className="setup-shell cinema-shell" aria-label="Aster first-time setup"><div className="setup-top"><span className="setup-brand"><Sparkles size={30}/> aster<span>CONTENT HUB</span></span><button className="text-button" disabled={busy} onClick={finish}>Skip setup</button></div><div className="setup-layout"><aside className="setup-intro"><p className="eyebrow">MAKE IT YOURS</p><h1>A great night in<br/>starts here<span>.</span></h1><p>Your addons. Your accounts. Everything together in Aster.</p><ol aria-label="Setup steps">{steps.map((name, index) => <li key={name} aria-current={step === index ? 'step' : undefined} className={index < step ? 'complete' : ''}><span>{index < step ? <Check size={16}/> : String(index + 1).padStart(2, '0')}</span>{name}</li>)}</ol><p className="setup-private"><ShieldCheck size={17}/> Your connections stay on this device.</p></aside><section className="setup-card" aria-labelledby="setup-heading">
    {step === 0 && <><span className="setup-symbol"><Play size={30}/></span><p className="eyebrow">WELCOME TO ASTER</p><h2 id="setup-heading">Your next story, one click away.</h2><p>Let’s connect the things you use to watch. No Aster account is needed, and you can change everything later in Settings.</p><div className="setup-benefits"><div><Puzzle/><span><strong>Add your addons</strong><small>Find movies, series and playback sources.</small></span></div><div><ShieldCheck/><span><strong>Connect Real-Debrid</strong><small>Optional, for sources that use your account.</small></span></div><div><Play/><span><strong>Press Play</strong><small>The included player handles playback.</small></span></div></div></>}
    {step === 1 && <><p className="eyebrow">BUILD YOUR CONTENT HUB</p><h2 id="setup-heading">Bring your addons.</h2><p>Catalogs find titles. Stream addons provide the links you can play.</p><div className="setup-cinemeta"><span><strong>Cinemeta</strong><small>Movie and series discovery · Catalog only</small></span><button className="secondary" disabled={busy || cinemetaInstalled} onClick={() => void add(CINEMETA)}>{cinemetaInstalled ? <><Check size={16}/>Added</> : <><Plus size={16}/>Add Cinemeta</>}</button></div><form onSubmit={event => { event.preventDefault(); void add(url); }}><label htmlFor="setup-addon">Addon manifest URL</label><div className="setup-input-row"><input id="setup-addon" type="url" required autoComplete="off" placeholder="https://your-addon.example/manifest.json" value={url} onChange={event => setUrl(event.target.value)}/><button className="primary" disabled={busy}>{busy ? <LoaderCircle size={17} className="spin"/> : <Plus size={17}/>}Add addon</button></div><p className="setup-hint">Paste a configured stream-provider addon here too. Cinemeta alone does not provide playback links.</p></form>{state.addons.length > 0 && <ul className="setup-addon-list" aria-label="Installed addons">{state.addons.map(addon => <li key={addon.manifest.id}><Puzzle size={18}/><strong>{addon.manifest.name}</strong><span>{hasResource(addon, 'stream') ? 'Playback sources' : 'Catalog & details'}</span><Check size={16}/></li>)}</ul>}</>}
    {step === 2 && <><span className="setup-symbol"><ShieldCheck size={30}/></span><p className="eyebrow">OPTIONAL CONNECTION</p><h2 id="setup-heading">Connect Real-Debrid.</h2><p>Use your own account to open supported links and torrent sources. You can skip this if your addons provide direct video links.</p>{user ? <div className="setup-connected"><Check size={23}/><span><strong>Connected as {user.username}</strong><small>Your token is saved securely on this device.</small></span></div> : <form onSubmit={event => { event.preventDefault(); void connect(); }}><label htmlFor="setup-token">Real-Debrid API token</label><input id="setup-token" type="password" required value={token} autoComplete="off" placeholder="Paste your API token" onChange={event => setToken(event.target.value)}/><div className="setup-token-actions"><a href="https://real-debrid.com/apitoken" target="_blank" rel="noreferrer" onClick={event => { if (isTauri()) { event.preventDefault(); void invoke('rd_open_token_page').catch(() => setError('Open real-debrid.com/apitoken in your browser to get your token.')); } }}>Get my API token <ExternalLink size={14}/></a><button className="primary" disabled={busy}>{busy ? <LoaderCircle size={17} className="spin"/> : <ShieldCheck size={17}/>}Connect Real-Debrid</button></div></form>}<p className="setup-hint">Real-Debrid resolves sources from your stream addons. It does not supply a movie catalog or playback links by itself. {isTauri() ? 'Your token is stored in Windows Credential Manager and is excluded from sync and backups.' : 'Browser preview holds the token only until this page reloads.'}</p></>}
    {step === 3 && <><span className="setup-symbol"><Check size={30}/></span><p className="eyebrow">YOUR ASTER IS READY</p><h2 id="setup-heading">Make yourself comfortable.</h2><p>Your setup is saved. Find a title, press Play, and Aster will choose a source and open the player.</p><div className="setup-summary"><div><span>Catalog addons</span><strong>{catalogs.length}</strong></div><div><span>Stream addons</span><strong>{streams.length}</strong></div><div><span>Real-Debrid</span><strong>{user ? 'Connected' : 'Not connected · Optional'}</strong></div><div><span>Video player</span><strong>Included with Aster</strong></div></div>{!streams.length && <p className="setup-advice">Add a stream-provider addon in Addons before watching movies or episodes. You can start exploring now.</p>}</>}
    {error && <p className="message error" role="alert">{error}</p>}{notice && <p className="message" role="status">{notice}</p>}<div className="setup-navigation">{step > 0 && <button className="secondary" disabled={busy} onClick={() => { setToken(''); setStep(value => value - 1); }}><ArrowLeft size={16}/>Back</button>}<button className="primary" disabled={busy} onClick={() => step === 3 ? finish() : (setToken(''), setStep(value => value + 1))}>{step === 0 ? 'Get started' : step === 3 ? 'Start exploring' : step === 2 && !user ? 'Skip for now' : 'Continue'}<ArrowRight size={17}/></button></div></section></div><footer className="setup-footer">Built for your collection. Ready for your next story.</footer></main>;
}
