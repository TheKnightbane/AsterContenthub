import { test, expect } from '@playwright/test';
import { mockYouTubeApi } from './youtube-fixture';

async function catalog(page: import('@playwright/test').Page, trailer: unknown = { url: 'https://trailers.aster.test/trailer.mp4' }, banner = false, metadata?: (url: string) => unknown) {
  await page.setViewportSize({ width: 1920, height: 1080 });
  let requests = 0;
  await page.route('https://trailers.aster.test/**', route => {
    if (route.request().url().includes('/meta/')) {
      requests++;
      return route.fulfill({ json: { meta: metadata ? metadata(route.request().url()) : { trailers: [trailer] } } });
    }
    if (route.request().url().endsWith('.mp4')) return route.fulfill({ path: 'public/media/sintel-trailer.mp4', contentType: 'video/mp4' });
    return route.fulfill({ json: { metas: [0, 1].map(i => ({ id: `trailer:${i}`, name: `Trailer movie ${i}`, background: '/art/forest.jpg' })) } });
  });
  await page.addInitScript(() => localStorage.setItem('aster.state.v1', JSON.stringify({ version: 1, seeded: true, items: {}, addons: [{ url: 'https://trailers.aster.test/manifest.json', manifest: { id: 'trailers', name: 'Trailers', version: '1', description: 'Fixture', resources: ['catalog', 'meta'], types: ['movie'], catalogs: [{ id: 'all', type: 'movie' }] } }] })));
  await page.addInitScript(enabled => localStorage.setItem('aster.settings.v1', JSON.stringify({bannerTrailers:enabled,...JSON.parse(localStorage.getItem('aster.settings.v1')||'{}')})), banner);
  await page.goto('/');
  await expect(page.locator('.landscape-card')).toHaveCount(2);
  return () => requests;
}

test('hover waits, plays a muted trailer, stops on leave and reuses cached metadata', async ({ page }) => {
  const requests = await catalog(page);
  const card = page.locator('.landscape-card').first();
  await card.hover();
  await page.waitForTimeout(300);
  expect(requests()).toBe(0);
  await page.mouse.move(1800, 20);
  await page.waitForTimeout(800);
  expect(requests()).toBe(0);
  await card.hover();
  const video = card.locator('video');
  await expect(video).toBeAttached();
  await expect.poll(() => video.evaluate(v => !v.paused && v.currentTime > 0)).toBe(true);
  expect(await video.evaluate(v => v.muted)).toBe(true);
  await page.mouse.move(1800, 20);
  await expect(page.locator('.hover-trailer')).toHaveCount(0);
  await card.hover();
  await expect(card.locator('video')).toBeAttached();
  expect(requests()).toBe(1);
  await card.locator('.landscape-art').click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await expect(page.locator('.hover-trailer video')).toHaveCount(0);
});

test('YouTube embeds are constrained to the approved host and disappear on errors', async ({ page }) => {
  await mockYouTubeApi(page);
  await page.route('https://www.youtube-nocookie.com/**', route => route.fulfill({ contentType: 'text/html', body: '<html>Trailer fixture</html>' }));
  await catalog(page, { source: 'P6AaSMfXHbA', type: 'Trailer' });
  const card = page.locator('.landscape-card').first();
  await card.hover();
  const iframe = card.locator('iframe');
  await expect(iframe).toHaveAttribute('src', /youtube-nocookie\.com\/embed\/P6AaSMfXHbA\?/);
  await iframe.evaluate(el => window.dispatchEvent(new MessageEvent('message', { source: el.contentWindow!, origin: 'https://www.youtube-nocookie.com', data: JSON.stringify({ event: 'onError', info: 150 }) })));
  await expect(iframe).toHaveCount(0);
  await expect(card.locator('.landscape-art')).toBeVisible();
});

test('reduced motion and the preview setting prevent trailer requests', async ({ page }) => {
  const requests = await catalog(page);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.locator('.landscape-card').first().hover();
  await page.waitForTimeout(1100);
  expect(requests()).toBe(0);
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.evaluate(() => localStorage.setItem('aster.settings.v1', JSON.stringify({ hoverTrailers: false })));
  await page.reload();
  await page.locator('.landscape-card').first().hover();
  await page.waitForTimeout(1100);
  expect(requests()).toBe(0);
});

test('live Cinemeta YouTube trailer starts muted in the browser', async ({ page }) => {
  test.skip(process.env.ASTER_LIVE_TRAILERS !== '1', 'Optional live provider check');
  const response = await fetch('https://v3-cinemeta.strem.io/meta/movie/tt0241527.json');
  const data = await response.json();
  expect(response.ok).toBe(true);
  const trailer = data.meta.trailerStreams[0];
  await catalog(page, trailer);
  await page.locator('.landscape-card').first().hover();
  await expect(page.locator('.hover-trailer.is-playing')).toBeVisible({ timeout: 30000 });
  const frame = page.frames().find(f => f.url().startsWith('https://www.youtube-nocookie.com/embed/'))!;
  expect(await frame.locator('video').evaluate(v => v.muted)).toBe(true);
  await page.screenshot({ path: '../aster-hover-trailer-live.png' });
});

test('search cards also play trailers and leaving the page stops them', async ({ page }) => {
  await catalog(page);
  await page.locator('.sidebar').getByRole('button', { name: 'Search', exact: true }).click();
  const card = page.locator('.media-grid .card').first();
  await card.hover();
  await expect(card.locator('video')).toBeAttached();
  await expect.poll(() => card.locator('video').evaluate(v => v.currentTime)).toBeGreaterThan(0);
  await page.locator('.sidebar').getByRole('button', { name: 'Home', exact: true }).click();
  await expect(page.locator('.hover-trailer')).toHaveCount(0);
});

test('compact cards expand to a valid YouTube player instead of silently skipping previews', async ({ page }) => {
  await mockYouTubeApi(page);
  await page.route('https://www.youtube-nocookie.com/**', route => route.fulfill({ contentType: 'text/html', body: '<html>Trailer fixture</html>' }));
  await catalog(page, { ytId: 'P6AaSMfXHbA' });
  await page.setViewportSize({width:1152,height:768});
  await page.locator('.landscape-card').first().hover();
  const iframe=page.locator('.hover-trailer-floating iframe');
  await expect(iframe).toBeAttached();
  const box=await iframe.boundingBox();
  expect(box!.width).toBeGreaterThanOrEqual(200);
  expect(box!.height).toBeGreaterThanOrEqual(200);
  expect(box!.x).toBeGreaterThanOrEqual(0);
  expect(box!.x+box!.width).toBeLessThanOrEqual(1152);
  await page.mouse.move(1100,10);
  await expect(iframe).toHaveCount(0);
});

test('a collection update does not discard an active hover preview', async ({ page }) => {
  await catalog(page);
  await page.locator('.sidebar').getByRole('button',{name:'Search',exact:true}).click();
  const card=page.locator('.media-grid .card').first();
  await card.hover();
  const video=card.locator('video');
  await expect.poll(()=>video.evaluate(v=>v.currentTime)).toBeGreaterThan(0);
  await video.evaluate(v=>v.dataset.previewIdentity='same-player');
  await card.getByRole('button',{name:'Favorite Trailer movie 0',exact:true}).click();
  await expect(video).toHaveAttribute('data-preview-identity','same-player');
});

test('Home banner autoplays without hover, switches titles and yields to card previews', async ({page})=>{
  await catalog(page,undefined,true);
  const banner=page.locator('.cinema-hero .banner-trailer');
  await expect(banner.locator('video')).toBeAttached();
  await expect.poll(()=>banner.locator('video').evaluate(v=>v.currentTime)).toBeGreaterThan(0);
  expect(await banner.locator('video').evaluate(v=>v.muted)).toBe(true);
  await expect(page.getByRole('button',{name:'Play',exact:true})).toBeVisible();
  await expect(banner).toHaveClass(/is-playing/);
  await expect.poll(()=>banner.locator('video').evaluate(v=>v.currentTime)).toBeGreaterThan(2);
  await page.screenshot({path:'../aster-banner-trailer.png'});
  await banner.locator('video').evaluate(v=>v.dataset.identity='old-banner');
  await page.getByRole('button',{name:'Feature Trailer movie 1',exact:true}).click();
  await expect(page.locator('video[data-identity="old-banner"]')).toHaveCount(0);
  await expect(banner.locator('video')).toBeAttached();
  await page.locator('.landscape-card').first().hover();
  await expect(banner).toHaveCount(0);
  await expect(page.locator('.landscape-card').first().locator('video')).toBeAttached();
  await page.locator('.sidebar').getByRole('button',{name:'Search',exact:true}).click();
  await expect(page.locator('video')).toHaveCount(0);
});

test('scrolling settles and the hovered card recovers automatically', async ({page})=>{
  await catalog(page);
  const card=page.locator('.landscape-card').first();
  await card.hover();
  await expect.poll(()=>card.locator('video').evaluate(v=>v.currentTime)).toBeGreaterThan(0);
  await page.mouse.wheel(0,60);
  await expect(card.locator('video')).toHaveCount(0);
  await expect(card.locator('video')).toBeAttached();
  await expect.poll(()=>card.locator('video').evaluate(v=>v.currentTime)).toBeGreaterThan(0);
});

test('an unavailable YouTube trailer tries the next provider video', async ({page})=>{
  await mockYouTubeApi(page);
  await page.route('https://www.youtube-nocookie.com/**',r=>r.fulfill({contentType:'text/html',body:'<html>Fixture</html>'}));
  await catalog(page);
  await page.route('https://trailers.aster.test/meta/**',r=>r.fulfill({json:{meta:{trailerStreams:[{ytId:'P6AaSMfXHbA'},{ytId:'M7lc1UVf-VE'}]}}}));
  await page.locator('.landscape-card').first().hover();
  const iframe=page.locator('.landscape-card iframe');
  await expect(iframe).toHaveAttribute('src',/P6AaSMfXHbA/);
  await iframe.evaluate(el=>window.dispatchEvent(new MessageEvent('message',{source:el.contentWindow!,origin:'https://www.youtube-nocookie.com',data:JSON.stringify({event:'onError',info:150})})));
  await expect(iframe).toHaveAttribute('src',/M7lc1UVf-VE/);
});

test('featured banners rotate while the pointer stays over the banner',async({page})=>{
  await page.clock.install();
  await catalog(page,undefined,false);
  await page.mouse.move(10,10);
  await expect(page.getByRole('heading',{name:'Trailer movie 0',exact:true})).toBeVisible();
  await page.clock.fastForward(8100);
  await expect(page.getByRole('heading',{name:'Trailer movie 1',exact:true})).toBeVisible();
  await page.locator('.cinema-hero-copy').hover();
  await page.clock.fastForward(8100);
  await expect(page.getByRole('heading',{name:'Trailer movie 0',exact:true})).toBeVisible();
  await page.getByRole('button',{name:'Feature Trailer movie 0',exact:true}).click();
  await page.clock.fastForward(8100);
  await expect(page.getByRole('heading',{name:'Trailer movie 1',exact:true})).toBeVisible();
});

test('delayed YouTube readiness and repeated card hovers keep working',async({page})=>{
  await mockYouTubeApi(page,1500);
  await page.route('https://www.youtube-nocookie.com/**',r=>r.fulfill({contentType:'text/html',body:'<html>Fixture</html>'}));
  await catalog(page,{ytId:'P6AaSMfXHbA'});
  const card=page.locator('.landscape-card').first();
  for(let i=0;i<3;i++){
    await card.hover();
    await expect(card.locator('iframe')).toBeAttached();
    await expect(card.locator('.hover-trailer.is-playing')).toBeVisible();
    await page.mouse.move(1800,20);
    await expect(page.locator('iframe')).toHaveCount(0);
  }
  expect(await page.evaluate(()=>{const w=window as unknown as {__ytMockPlayers:{destroyed:boolean}[]};return w.__ytMockPlayers.every(p=>p.destroyed);})).toBe(true);
});

test('previews loop instead of becoming permanently finished after 45 seconds',async({page})=>{
  await page.clock.install();
  await mockYouTubeApi(page);
  await page.route('https://www.youtube-nocookie.com/**',r=>r.fulfill({contentType:'text/html',body:'<html>Fixture</html>'}));
  await catalog(page,{ytId:'P6AaSMfXHbA'});
  await page.locator('.landscape-card').first().hover();
  await expect(page.locator('.landscape-card .is-playing')).toBeVisible();
  await page.clock.fastForward(46000);
  await expect(page.locator('.landscape-card iframe')).toBeAttached();
  expect(await page.evaluate(()=>{const w=window as unknown as {__ytMockPlayers:{seekCalls:number}[]};return w.__ytMockPlayers.at(-1)!.seekCalls;})).toBeGreaterThan(0);
});

test('stalled playback retries and advances to another trailer instead of staying frozen',async({page})=>{
  await page.clock.install();
  await mockYouTubeApi(page);
  await page.route('https://www.youtube-nocookie.com/**',r=>r.fulfill({contentType:'text/html',body:'<html>Fixture</html>'}));
  await catalog(page);
  await page.route('https://trailers.aster.test/meta/**',r=>r.fulfill({json:{meta:{trailerStreams:[{ytId:'P6AaSMfXHbA'},{ytId:'M7lc1UVf-VE'}]}}}));
  await page.locator('.landscape-card').first().hover();
  await expect(page.locator('.landscape-card .is-playing')).toBeVisible();
  await page.evaluate(()=>{const w=window as unknown as {__ytMockPlayers:{getCurrentTime:()=>number}[]};w.__ytMockPlayers[0].getCurrentTime=()=>0;});
  await page.clock.runFor(18000);
  await expect(page.locator('.landscape-card iframe')).toHaveAttribute('src',/M7lc1UVf-VE/);
});

test('an unavailable hovered card does not block the banner or its rotation',async({page})=>{
  await catalog(page,undefined,true,url=>url.includes('trailer%3A0')?{trailers:[]}:{trailers:[{url:'https://trailers.aster.test/trailer.mp4'}]});
  await page.getByRole('button',{name:'Feature Trailer movie 1',exact:true}).click();
  await page.locator('.landscape-card').first().hover();
  await expect(page.locator('.landscape-card').first().getByText('Trailer unavailable')).toBeVisible();
  await expect.poll(()=>page.locator('.banner-trailer video').evaluate(v=>v.currentTime)).toBeGreaterThan(0);
});

test('moving within a card restarts its preview after focus was lost',async({page})=>{
  await catalog(page);
  const card=page.locator('.landscape-card').first();await card.hover();
  await expect(card.locator('video')).toBeAttached();
  await page.evaluate(()=>{ Object.defineProperty(document,'hasFocus',{configurable:true,value:()=>false}); window.dispatchEvent(new Event('blur')); });
  await expect(card.locator('video')).toHaveCount(0);
  const box=await card.boundingBox();await page.mouse.move(box!.x+30,box!.y+30);
  await expect(card.locator('video')).toBeAttached();
});

test('entering and leaving a card in the same browser task never leaves a stale preview',async({page})=>{
  const requests=await catalog(page);
  await page.evaluate(()=>{for(const card of document.querySelectorAll('.landscape-card')){card.dispatchEvent(new PointerEvent('pointerover',{bubbles:true,pointerType:'mouse',relatedTarget:document.body}));card.dispatchEvent(new PointerEvent('pointerout',{bubbles:true,pointerType:'mouse',relatedTarget:document.body}));}});
  await expect(page.locator('.landscape-card .hover-trailer')).toHaveCount(0);
  await page.waitForTimeout(1100);
  expect(requests()).toBe(0);
});

test('banner includes the entire movie pool, not only the first six titles',async({page})=>{
  await page.clock.install();
  await page.route('https://all-movies.test/**',r=>r.fulfill({json:{metas:Array.from({length:12},(_,i)=>({id:`all:${i}`,name:`All movie ${i}`,background:'/art/forest.jpg'}))}}));
  await page.addInitScript(()=>{localStorage.setItem('aster.settings.v1',JSON.stringify({bannerTrailers:false}));localStorage.setItem('aster.state.v1',JSON.stringify({version:1,seeded:true,items:{},addons:[{url:'https://all-movies.test/manifest.json',manifest:{id:'all',name:'All movies',description:'Fixture',version:'1',resources:['catalog'],types:['movie'],catalogs:[{id:'all',type:'movie'}]}}]}));});
  await page.goto('/');await expect(page.locator('.carousel-count')).toHaveText('1 / 12');
  for(let i=0;i<7;i++)await page.getByRole('button',{name:'Next featured title',exact:true}).click();
  await expect(page.getByRole('heading',{name:'All movie 7',exact:true})).toBeVisible();
  await expect(page.locator('.carousel-count')).toHaveText('8 / 12');
  await page.clock.fastForward(8100);
  await expect(page.getByRole('heading',{name:'All movie 8',exact:true})).toBeVisible();
});

test('banner starts its preview without the former 1.8 second delay',async({page})=>{
  await page.clock.install();await page.clock.pauseAt(new Date());
  await catalog(page,undefined,true);
  await page.clock.runFor(50);
  await expect(page.locator('.banner-trailer video')).toBeAttached();
});
