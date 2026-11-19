import { test, expect } from '@playwright/test';
import { installFixture, playFixture } from './fixture';
test.beforeEach(async ({ page }) => {
  await installFixture(page);
  await page.addInitScript(() => {
    const root = window as unknown as Record<string, any>;
    root.isTauri = true;
    const callbacks = new Map<number, (event: unknown) => void>();
    const listeners = new Map<number, string>();
    let nextId = 1;
    let sessionId = '';
    let paused = false;
    let fullscreen = false;
    const tracks = [{ id: 1, type: 'audio', lang: 'en', title: '', codec: 'aac', selected: true }, { id: 2, type: 'audio', lang: 'es', title: 'Spanish dub', codec: 'aac', selected: false }, { id: 3, type: 'sub', lang: 'en', title: 'English captions', codec: 'srt', selected: false }];
    const emit = (payload: Record<string, unknown>) => { for (const [id, event] of listeners) if (event === 'mpv-playback') callbacks.get(id)?.({ event, id, payload: { sessionId, ...payload } }); };
    const state = () => emit({ kind: 'state', paused, muted: false, volume: 75, tracks });
    root.mpvCalls = [];
    root.mpvInput = (action: string) => emit({ kind: 'input', action });
    root.mpvEvent = (payload: Record<string,unknown>) => emit(payload);
    root.__TAURI_EVENT_PLUGIN_INTERNALS__ = { unregisterListener: (_event: string, id: number) => { callbacks.delete(id); listeners.delete(id); } };
    root.__TAURI_INTERNALS__ = {
      transformCallback: (callback: (event: unknown) => void) => { const id = nextId++; callbacks.set(id, callback); return id; },
      invoke: async (command: string, args: Record<string, any>) => {
        root.mpvCalls.push({ command, args });
        if (command === 'addon_get') return args.url.includes('/stream/') ? { streams: [{ name: 'Fixture source', url: 'http://127.0.0.1:1420/media/sintel-trailer.mp4' }, { name: 'Backup source', url: 'http://127.0.0.1:1420/media/sintel-trailer.mp4?backup=1' }] } : { metas: [{ id: 'fixture:sintel', name: 'Sintel', background: '/art/mountains.jpg' }] };
        if (command === 'mpv_available') return true;
        if (command === 'rd_request') throw new Error('Not connected');
        if (command === 'plugin:event|listen') { listeners.set(args.handler, args.event); return args.handler; }
        if (command === 'plugin:event|unlisten') { listeners.delete(args.eventId); return; }
        if (command === 'mpv_play') { sessionId = args.sessionId; setTimeout(() => { state(); emit({ kind: 'progress', position: 17, duration: 90 }); }, 25); return; }
        if (command === 'mpv_control') {
          if (args.action === 'pause') paused = !paused;
          if (args.action === 'audio' || args.action === 'subtitles') for (const track of tracks) if (track.type === (args.action === 'audio' ? 'audio' : 'sub')) track.selected = track.id === args.value;
          state(); return;
        }
        if (command === 'mpv_fullscreen') { fullscreen = args.enabled ?? !fullscreen; return fullscreen; }
      }
    };
  });
});

test('mpv stays in the app with live audio/subtitle buttons, progress and cleanup', async ({ page }) => {
  await page.goto('/');
  await playFixture(page);
  await expect(page.getByRole('dialog', { name: 'Playing Sintel' })).toBeVisible();
  await expect(page.getByText('0:17', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: /^Audio language/ }).click();
  await page.getByRole('group', { name: 'Audio tracks' }).getByRole('button', { name: /Spanish/ }).click();
  await expect(page.getByRole('button', { name: /^Audio language/ })).toContainText('Spanish');
  await page.getByRole('button', { name: /^Subtitles/ }).click();
  await page.getByRole('group', { name: 'Subtitle tracks' }).getByRole('button', { name: /English captions/ }).click();
  await expect(page.getByRole('button', { name: /^Subtitles/ })).toContainText('English captions');
  await page.getByRole('group', { name: 'Subtitle tracks' }).getByRole('button', { name: 'Off', exact: true }).click();
  await page.getByRole('button', { name: 'Pause video' }).click();
  await expect(page.getByRole('button', { name: 'Resume video' })).toBeVisible();
  const calls = await page.evaluate(() => (window as any).mpvCalls);
  expect(calls.filter((c: any) => c.command === 'mpv_play')).toHaveLength(1);
  expect(calls.find((c: any) => c.command === 'mpv_play').args.width).toBeGreaterThan(0);
  expect(calls.some((c: any) => c.command === 'mpv_resize')).toBe(true);
  await page.screenshot({ path: '../aster-embedded-controls.png' });
  await page.getByRole('button', { name: 'Close player' }).click();
  await expect(page.getByRole('dialog', { name: 'Playing Sintel' })).toHaveCount(0);
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('aster.state.v1')!).items['fixture:sintel'].progress.position)).toBe(17);
  expect(await page.evaluate(() => (window as any).mpvCalls.some((c: any) => c.command === 'mpv_stop'))).toBe(true);
});

test('embedded controls fit a narrow window', async ({ page }) => {
  await page.setViewportSize({ width: 640, height: 720 });
  await page.goto('/');
  await playFixture(page);
  await page.getByRole('button', { name: /^Subtitles/ }).click();
  await expect(page.getByRole('group', { name: 'Subtitle tracks' })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog', { name: 'Playing Sintel' })).toHaveCount(0);
});

test('fullscreen fills the video surface, reveals controls on movement, and Escape restores the player', async ({ page }) => {
  await page.goto('/');
  await playFixture(page);
  const player = page.getByRole('dialog', { name: 'Playing Sintel' });
  await page.getByRole('button', { name: 'Fullscreen', exact: true }).click();
  await expect(player).toHaveClass(/chrome-hidden/);
  await expect(page.locator('.embedded-header')).toBeHidden();
  const bounds = await page.getByTestId('embedded-video-surface').boundingBox();
  expect(bounds?.y).toBe(0);
  expect(bounds?.height).toBe(1050);
  await page.waitForTimeout(550);
  await page.evaluate(() => (window as any).mpvInput('activity'));
  await expect(page.getByRole('button', { name: 'Exit fullscreen', exact: true })).toBeVisible();
  await page.mouse.move(700, 300);
  await expect(player).toHaveClass(/chrome-hidden/, { timeout: 5000 });
  await page.evaluate(() => (window as any).mpvInput('escape'));
  await expect(player).not.toHaveClass(/is-fullscreen/);
  await expect(page.getByRole('button', { name: 'Fullscreen', exact: true })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(player).toHaveCount(0);
});

test('fullscreen reveals usable seek and volume controls and resizes the native surface away from them', async ({ page }) => {
  await page.goto('/'); await playFixture(page);
  await page.getByRole('button', { name: 'Fullscreen', exact: true }).click();
  await page.waitForTimeout(550);
  await page.evaluate(() => (window as any).mpvInput('activity'));
  const seek = page.getByRole('slider', { name: 'Seek video' });
  await seek.focus(); await page.keyboard.press('ArrowRight');
  const volume = page.getByRole('slider', { name: 'Video volume' });
  await volume.focus(); await page.keyboard.press('ArrowLeft');
  await expect.poll(async () => page.evaluate(() => (window as any).mpvCalls.filter((c: any) => c.command === 'mpv_control').map((c: any) => c.args.action))).toContain('volume');
  const calls = await page.evaluate(() => (window as any).mpvCalls);
  expect(calls.some((c: any) => c.command === 'mpv_control' && c.args.action === 'seek' && c.args.value > 17)).toBe(true);
  const resized = calls.filter((c: any) => c.command === 'mpv_resize').at(-1).args;
  const controls = await page.locator('.embedded-controls').boundingBox();
  expect(resized.y + resized.height).toBeLessThanOrEqual(controls!.y + 1);
  await page.locator('.embedded-controls').hover();
  await page.waitForTimeout(3500);
  await expect(page.getByRole('dialog', { name: 'Playing Sintel' })).toHaveClass(/chrome-hidden/);
  await page.mouse.move(800, 650);
  await expect(volume).toBeVisible();
  await page.locator('.embedded-header h2').click();
  await page.keyboard.press('ArrowRight'); await page.keyboard.press('ArrowDown');
  expect(await page.evaluate(() => (window as any).mpvCalls.some((c: any) => c.command === 'mpv_control' && c.args.action === 'seek' && c.args.value === 27))).toBe(true);
});


test('changes mpv source inside fullscreen and resumes the replacement at the current position', async ({page})=>{
  await page.goto('/');await playFixture(page);
  await expect(page.getByText('0:17',{exact:true})).toBeVisible();
  await page.getByRole('button',{name:'Fullscreen',exact:true}).click();
  await page.waitForTimeout(550);
  await page.evaluate(()=>(window as any).mpvInput('activity'));
  await page.keyboard.press('Tab');
  await page.getByRole('button',{name:'Change source',exact:true}).click();
  await expect(page.getByRole('region',{name:'Playback sources'})).toBeVisible();
  await page.screenshot({path:'../aster-change-source.png'});
  await page.getByRole('button',{name:/Play source: Backup source/}).click();
  await expect.poll(()=>page.evaluate(()=>(window as any).mpvCalls.filter((c:any)=>c.command==='mpv_play').length)).toBe(2);
  const calls=await page.evaluate(()=>(window as any).mpvCalls);
  const plays=calls.filter((c:any)=>c.command==='mpv_play');
  expect(plays[1].args.source).toContain('backup=1');expect(plays[1].args.position).toBe(17);
  expect(plays[1].args.sessionId).not.toBe(plays[0].args.sessionId);
  expect(calls.some((c:any)=>c.command==='mpv_stop'&&c.args.sessionId===plays[0].args.sessionId)).toBe(true);
  expect(calls.some((c:any)=>c.command==='mpv_fullscreen'&&c.args.enabled===false)).toBe(false);
  await expect(page.locator('.embedded-player')).toHaveClass(/is-fullscreen/);
  await expect(page.locator('.detail-body')).toHaveCount(0);
});



async function seriesFixture(page:import('@playwright/test').Page){
  await page.addInitScript(()=>{
    const root=window as any;localStorage.setItem('aster.state.v1',JSON.stringify({version:1,seeded:true,items:{},addons:[{url:'https://fixture.aster.test/manifest.json',manifest:{id:'fixture',name:'Series catalog',version:'1',description:'',resources:['catalog','meta','stream'],types:['series'],catalogs:[{id:'top',type:'series'}]}}]}));
    const invoke=root.__TAURI_INTERNALS__.invoke;
    root.__TAURI_INTERNALS__.invoke=(command:string,args:any)=>{
      if(command==='addon_get')return Promise.resolve(args.url.includes('/catalog/')?{metas:[{id:'tt12345',name:'Test Show',background:'/art/city.jpg'}]}:args.url.includes('/meta/')?{meta:{videos:[{id:'tt12345:1:1',season:1,episode:1,title:'Pilot'},{id:'tt12345:1:2',season:1,episode:2,title:'Second'},{id:'tt12345:2:1',season:2,episode:1,title:'New Season'}]}}:{streams:[{name:'1080p',url:'http://127.0.0.1:1420/media/sintel-trailer.mp4?episode='+encodeURIComponent(args.url)}]});
      return invoke(command,args);
    };
  });
  await page.goto('/');await page.getByRole('button',{name:'View details',exact:true}).click();await page.getByRole('button',{name:'Play episode 1: Pilot'}).click();await expect(page.getByText('0:17',{exact:true})).toBeVisible();
}

test('mpv Next episode and natural completion autoplay preserve fullscreen and start at zero',async({page})=>{
  await seriesFixture(page);await page.getByRole('button',{name:'Fullscreen',exact:true}).click();await page.waitForTimeout(550);await page.evaluate(()=>(window as any).mpvInput('activity'));
  await page.getByRole('button',{name:'Next episode',exact:true}).click();
  await expect(page.getByRole('dialog',{name:/Playing Test Show.*S1 E2/})).toBeVisible();
  await expect.poll(()=>page.evaluate(()=>(window as any).mpvCalls.filter((c:any)=>c.command==='mpv_play').length)).toBe(2);
  let plays=await page.evaluate(()=>(window as any).mpvCalls.filter((c:any)=>c.command==='mpv_play'));
  expect(plays[1].args.position).toBe(0);
  await page.screenshot({path:'../aster-next-episode.png'});
  await page.evaluate(()=>{(window as any).mpvEvent({kind:'ended',success:true,completed:true});(window as any).mpvEvent({kind:'ended',success:true,completed:true});});
  await expect(page.getByRole('dialog',{name:/Playing Test Show.*S2 E1/})).toBeVisible();
  await expect.poll(()=>page.evaluate(()=>(window as any).mpvCalls.filter((c:any)=>c.command==='mpv_play').length)).toBe(3);
  plays=await page.evaluate(()=>(window as any).mpvCalls.filter((c:any)=>c.command==='mpv_play'));
  expect(plays[2].args.position).toBe(0);await expect(page.locator('.embedded-player')).toHaveClass(/is-fullscreen/);
  expect(await page.evaluate(()=>(window as any).mpvCalls.some((c:any)=>c.command==='mpv_fullscreen'&&c.args.enabled===false))).toBe(false);
  await page.evaluate(()=>(window as any).mpvEvent({kind:'ended',success:true,completed:true}));
  await expect(page.getByRole('button',{name:'Next episode',exact:true})).toBeDisabled();
});

test('mpv manual stops and playback failures do not trigger next-episode autoplay',async({page})=>{
  await seriesFixture(page);
  await page.evaluate(()=>(window as any).mpvEvent({kind:'ended',success:true,completed:false}));
  await expect(page.getByText('Playback finished. Your progress is saved.')).toBeVisible();
  expect(await page.evaluate(()=>(window as any).mpvCalls.filter((c:any)=>c.command==='mpv_play').length)).toBe(1);
  await page.evaluate(()=>(window as any).mpvEvent({kind:'ended',success:false,completed:false}));
  await expect(page.getByRole('alert')).toContainText('could not be played');
  expect(await page.evaluate(()=>(window as any).mpvCalls.filter((c:any)=>c.command==='mpv_play').length)).toBe(1);
});

