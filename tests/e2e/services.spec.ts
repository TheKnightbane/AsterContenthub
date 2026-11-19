import { test, expect } from '@playwright/test';
test.beforeEach(async({page})=>{
  await page.addInitScript(()=>{
    const root=window as any;root.isTauri=true;root.serviceCalls=[];let saved:any[]=[];let pending='';let track=false;
    root.__TAURI_INTERNALS__={invoke:async(command:string,args:any={})=>{
      root.serviceCalls.push({command,args});
      if(command==='mpv_available')return false;
      if(command==='rd_request')throw new Error('Not connected');
      if(command==='integration_connections')return saved;
      if(command==='integration_connect'){
        if(args.config.token==='bad-key')throw new Error('Service returned HTTP 401. Check credentials.');
        const c={provider:args.provider,account:'Fixture account',autoTrack:false,configured:true};saved=[...saved.filter(c=>c.provider!==args.provider),c];return c;
      }
      if(command==='integration_check')return saved.find(c=>c.provider===args.provider);
      if(command==='integration_disconnect'){saved=saved.filter(c=>c.provider!==args.provider);return;}
      if(command==='integration_auth_begin'){pending=args.provider;return{sessionId:'session-1',userCode:'TEST-CODE',verificationUrl:`https://${pending==='trakt'?'trakt.tv':'simkl.com'}/pin`,interval:5,expiresIn:900};}
      if(command==='integration_auth_poll'){const c={provider:pending,account:'Authorized fixture',autoTrack:track,configured:true};saved=[...saved.filter(c=>c.provider!==pending),c];return{connected:true,connection:c};}
      if(command==='integration_tracking'){track=args.enabled;saved=saved.map(c=>c.provider===args.provider?{...c,autoTrack:track}:c);return;}
      if(command==='integration_watched')return;
      if(command==='integration_browse'){
        const common={detail:'Fixture media',year:2020,imdbId:'',magnet:'',mediaType:'movie'};
        if(['jackett','prowlarr'].includes(args.provider))return{items:args.query?[{...common,id:'torrent-1',name:'Indexer Movie',parent:'',kind:'torrent',magnet:'magnet:?xt=urn:btih:'+'a'.repeat(40)}]:[],nextPage:null};
        if(args.provider==='iptv')return{items:[{...common,id:'channel-1',parent:'',name:'News channel',kind:'video',mediaType:'live'}],nextPage:null};
        if(!args.parent)return{items:[{...common,id:'folder-1',parent:'',name:'Movies',kind:'folder'}],nextPage:null};
        return{items:[{...common,id:'movie-1',parent:args.parent,name:'Cloud movie',kind:'video'}],nextPage:null};
      }
      if(['integration_play','integration_resolve'].includes(command))return{url:'http://127.0.0.1:1420/media/sintel-trailer.mp4'};
    }};
  });
});
const settings=async(page:import('@playwright/test').Page)=>{await page.goto('/');await page.getByRole('button',{name:'Open settings'}).click();};

test('cloud connection verifies credentials, browses files, plays and disconnects without persisting secrets',async({page})=>{
  await settings(page);
  await page.getByRole('button',{name:'Open TorBox connection'}).click();
  await page.getByLabel('TorBox API key').fill('fixture-secret-key');
  await page.getByRole('button',{name:'Connect & verify'}).click();
  await expect(page.getByRole('dialog').getByText('Fixture account',{exact:true})).toBeVisible();
  await page.getByRole('button',{name:/^Movies /}).click();
  await expect(page.getByRole('button',{name:'Play Cloud movie',exact:true})).toBeVisible();
  await page.getByRole('button',{name:'Play Cloud movie',exact:true}).click();
  await expect(page.locator('video')).toBeVisible();
  await expect.poll(()=>page.locator('video').evaluate((v:HTMLVideoElement)=>v.readyState)).toBeGreaterThan(0);
  expect(await page.evaluate(()=>JSON.stringify(localStorage))).not.toContain('fixture-secret-key');
  await page.getByRole('button',{name:'Close dialog'}).click();
  await page.getByRole('button',{name:'Services',exact:true}).click();
  await page.getByRole('button',{name:'Open TorBox connection'}).click();
  await page.getByRole('button',{name:'Disconnect',exact:true}).click();
  await expect(page.getByLabel('TorBox API key')).toBeVisible();
});

test('all server and cloud cards expose usable connection forms and rejected credentials stay disconnected',async({page})=>{
  await settings(page);
  for(const name of ['TorBox','Premiumize','AllDebrid','PikPak','WebDAV','Jellyfin','Emby','Plex','Jackett','Prowlarr','IPTV']){
    await page.getByRole('button',{name:`Open ${name} connection`,exact:true}).click();
    await expect(page.getByRole('button',{name:'Connect & verify',exact:true})).toBeVisible();
    await expect(page.getByRole('dialog')).not.toContainText('planned');
    await page.getByRole('button',{name:'Close dialog'}).click();
  }
  await page.getByRole('button',{name:'Open Premiumize connection'}).click();
  await page.getByLabel('Premiumize API key').fill('bad-key');
  await page.getByRole('button',{name:'Connect & verify'}).click();
  await expect(page.getByRole('alert')).toContainText('HTTP 401');
  await expect(page.getByRole('button',{name:'Disconnect',exact:true})).toHaveCount(0);
});

test('WebDAV connects with an app password, navigates and saves a resumable reference without credentials',async({page})=>{
  await settings(page);
  await page.getByRole('button',{name:'Open WebDAV connection'}).click();
  await page.getByLabel('WebDAV server address').fill('https://dav.fixture.test/media/');
  await page.getByLabel('WebDAV username').fill('Test user');
  await page.getByLabel('WebDAV password').fill('private-app-password');
  await page.getByRole('button',{name:'Connect & verify'}).click();
  await page.getByRole('button',{name:/^Movies /}).click();
  await page.getByRole('button',{name:'Save Cloud movie to Library'}).click();
  const state=await page.evaluate(()=>JSON.parse(localStorage.getItem('aster.state.v1')!));
  const record=Object.values(state.items)[0] as any;
  expect(record.media.service).toMatchObject({provider:'webdav',id:'movie-1',parent:'folder-1'});
  expect(JSON.stringify(state)).not.toContain('private-app-password');
  await page.getByRole('button',{name:'Play Cloud movie',exact:true}).click();
  await expect(page.locator('video')).toBeVisible();
  expect(await page.evaluate(()=>(window as any).serviceCalls.some((c:any)=>c.command==='integration_play'&&c.args.provider==='webdav'))).toBe(true);
});

test('IPTV plays live channels and does not add live viewing to Continue Watching',async({page})=>{
  await settings(page);
  await page.getByRole('button',{name:'Open IPTV connection'}).click();
  await page.getByLabel('Private M3U playlist URL').fill('https://tv.fixture.test/get.php?password=private-key');
  await page.getByRole('button',{name:'Connect & verify'}).click();
  await page.getByRole('button',{name:'Play News channel',exact:true}).click();
  await expect(page.locator('video')).toBeVisible();
  await page.locator('video').evaluate(async(v:HTMLVideoElement)=>{if(!v.readyState)await new Promise(r=>v.addEventListener('loadedmetadata',r,{once:true}));v.currentTime=5;v.pause();v.dispatchEvent(new Event('pause'));});
  await page.getByRole('button',{name:'Close dialog'}).click();
  const storage=await page.evaluate(()=>JSON.stringify(localStorage));
  expect(storage).not.toContain('private-key');
  expect(storage).not.toContain('News channel');
});

for(const tracker of ['Trakt','Simkl']) test(tracker+' device sign-in completes and auto-sync requires explicit opt-in',async({page})=>{
  await settings(page);
  await page.getByRole('navigation',{name:'Settings sections'}).getByRole('button',{name:/^Tracking/}).click();
  await page.getByRole('button',{name:'Open '+tracker+' connection'}).click();
  if(tracker==='Trakt')await page.getByText('Advanced app connection',{exact:true}).click();
  await page.getByLabel(tracker+' Client ID').fill('registered-client-id');
  await page.getByRole('button',{name:tracker==='Trakt'?'Authenticate':'Sign in with code',exact:true}).click();
  await expect(page.getByText('TEST-CODE',{exact:true})).toBeVisible();
  if(tracker==='Trakt')expect(await page.evaluate(()=>(window as any).serviceCalls.some((c:any)=>c.command==='integration_open_url'))).toBe(true);
  await expect(page.getByRole('switch',{name:'Automatically sync movies to '+tracker})).toBeVisible({timeout:9000});
  await expect(page.getByRole('switch',{name:'Automatically sync movies to '+tracker})).not.toBeChecked();
  await page.getByRole('switch',{name:'Automatically sync movies to '+tracker}).check();
  await expect.poll(()=>page.evaluate(()=>(window as any).serviceCalls.some((c:any)=>c.command==='integration_tracking'&&c.args.enabled===true))).toBe(true);
  expect(await page.evaluate(()=>JSON.stringify(localStorage))).not.toContain('registered-client-id');
});

test('indexer magnet results use the chosen cloud resolver with one Play action',async({page})=>{
  await settings(page);
  await page.getByRole('button',{name:'Open TorBox connection'}).click();await page.getByLabel('TorBox API key').fill('cloud-key');await page.getByRole('button',{name:'Connect & verify'}).click();await page.getByRole('button',{name:'Close dialog'}).click();
  await page.getByRole('button',{name:'Open Prowlarr connection'}).click();await page.getByLabel('Prowlarr server address').fill('http://127.0.0.1:9696/');await page.getByLabel('Prowlarr API key').fill('indexer-key');await page.getByRole('button',{name:'Connect & verify'}).click();
  await page.getByLabel('Search Prowlarr library').fill('Movie');await page.getByRole('dialog').getByRole('button',{name:'Search',exact:true}).click();
  await page.getByRole('button',{name:'Play Indexer Movie',exact:true}).click();
  await expect(page.locator('video')).toBeVisible();
  expect(await page.evaluate(()=>(window as any).serviceCalls.some((c:any)=>c.command==='integration_resolve'&&c.args.provider==='torbox'&&c.args.source.startsWith('magnet:?')))).toBe(true);
});

test('the entire interface follows the chosen palette, including dialogs and controls',async({page})=>{
  await settings(page);
  const mainBefore=await page.locator('main').evaluate(n=>getComputedStyle(n).backgroundColor);
  await page.getByRole('navigation',{name:'Settings sections'}).getByRole('button',{name:/^Appearance/}).click();await page.getByLabel('Accent colour').selectOption('violet');
  const colors=await page.evaluate(()=>({main:getComputedStyle(document.querySelector('main')!).backgroundColor,sidebar:getComputedStyle(document.querySelector('.sidebar')!).backgroundColor,accent:getComputedStyle(document.documentElement).getPropertyValue('--lime').trim()}));
  expect(colors.main).not.toBe(mainBefore);expect(colors.main).toBe('rgb(21, 16, 31)');expect(colors.sidebar).toBe('rgb(16, 11, 25)');expect(colors.accent).toBe('#c5afff');
  await page.getByRole('navigation',{name:'Settings sections'}).getByRole('button',{name:/^Connections/}).click();await page.getByRole('button',{name:'Open TorBox connection'}).click();
  await expect(page.getByRole('dialog')).toHaveCSS('background-color','rgb(33, 24, 47)');await expect(page.getByRole('button',{name:'Connect & verify'})).toHaveCSS('background-color','rgb(197, 175, 255)');
  await page.screenshot({path:'../aster-services-violet.png'});
});

