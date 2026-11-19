import { test, expect } from '@playwright/test';
test.beforeEach(async({page})=>{
  await page.addInitScript(()=>{localStorage.setItem('aster.state.v1',JSON.stringify({version:1,seeded:true,items:{},addons:[{url:'https://episodes.fixture.test/manifest.json',manifest:{id:'episodes',name:'Episode catalog',version:'1',description:'Fixture',resources:['catalog','meta','stream'],types:['series'],catalogs:[{id:'top',type:'series'}]}}]}));});
  await page.route('https://episodes.fixture.test/**',route=>{
    const url=decodeURIComponent(route.request().url());
    return route.fulfill({json:url.includes('/catalog/')?{metas:[{id:'tt12345',name:'Test Show',background:'/art/city.jpg'}]}:url.includes('/meta/')?{meta:{videos:[{id:'tt12345:0:1',title:'Special',season:0,episode:1},{id:'tt12345:1:1',title:'Pilot',season:1,episode:1,overview:'Where the story begins.'},{id:'tt12345:1:2',title:'Second',season:1,episode:2},{id:'tt12345:2:1',title:'New Season',season:2,episode:1},{id:'tt12345:2:2',title:'The Return',season:2,episode:2,overview:'The next chapter.'}]}}:{streams:[{name:'1080p',url:'http://127.0.0.1:1420/media/sintel-trailer.mp4?episode='+encodeURIComponent(url.match(/stream\/series\/([^/]+)\.json/)?.[1]||'1:1')}]}});
  });
});
test('shows seasons and episodes, plays the exact episode and offers its manual source list',async({page})=>{
  await page.goto('/');await page.getByRole('button',{name:'View details',exact:true}).click();
  await expect(page.getByRole('region',{name:'Seasons and episodes'})).toBeVisible();
  await expect(page.getByRole('button',{name:'Play episode 1: Pilot'})).toBeVisible();
  await page.getByLabel('Season',{exact:true}).selectOption('2');
  await expect(page.getByRole('button',{name:'Play episode 1: Pilot'})).toHaveCount(0);
  await page.screenshot({path:'../aster-seasons.png'});
  await page.getByRole('button',{name:'Choose source for episode 2: The Return'}).click();
  await expect(page.getByRole('dialog')).toContainText('S2 E2');
  await expect(page.locator('.source-chooser')).toHaveAttribute('open','');
  await expect(page.locator('.source-row button')).toBeVisible();
  await page.getByRole('button',{name:'Back to seasons'}).click();
  await page.getByLabel('Season',{exact:true}).selectOption('2');
  await page.getByRole('button',{name:'Play episode 2: The Return'}).click();
  await expect(page.locator('video')).toHaveAttribute('src',/episode=tt12345%3A2%3A2/);
  await expect(page.getByRole('dialog')).toContainText('S2 E2');
});
test('episode metadata errors provide a retry instead of a blank show page',async({page})=>{
  let fail=true;await page.route('https://episodes.fixture.test/meta/**',route=>fail?route.fulfill({status:503,body:'Unavailable'}):route.fulfill({json:{meta:{videos:[{id:'tt12345:1:1',title:'Pilot',season:1,episode:1}]}}}));
  await page.goto('/');await page.getByRole('button',{name:'View details',exact:true}).click();
  await expect(page.getByRole('alert')).toContainText('Episode details could not be loaded');fail=false;
  await page.getByRole('button',{name:'Retry episodes'}).click();await expect(page.getByRole('button',{name:'Play episode 1: Pilot'})).toBeVisible();
});


const openPilot=async(page:import('@playwright/test').Page)=>{await page.goto('/');await page.getByRole('button',{name:'View details',exact:true}).click();await page.getByRole('button',{name:'Play episode 1: Pilot',exact:true}).click();await expect(page.locator('video')).toBeVisible();};
const finish=async(page:import('@playwright/test').Page)=>{await page.locator('video').evaluate(async(v:HTMLVideoElement)=>{if(v.readyState<1)await new Promise(r=>v.addEventListener('loadedmetadata',r,{once:true}));v.currentTime=v.duration-.05;v.pause();v.dispatchEvent(new Event('ended'));v.dispatchEvent(new Event('ended'));});};

test('Next episode and autoplay advance across seasons once and stop at the last episode',async({page})=>{
  await openPilot(page);
  await page.getByRole('button',{name:'Next episode',exact:true}).click();
  await expect(page.getByRole('dialog')).toContainText('S1 E2');
  await expect(page.locator('video')).toHaveAttribute('src',/tt12345%3A1%3A2/);
  await finish(page);
  await expect(page.getByRole('dialog')).toContainText('S2 E1');
  await expect(page.locator('video')).toHaveAttribute('src',/tt12345%3A2%3A1/);
  await expect(page.getByRole('dialog').locator('header h2')).toContainText('S2 E1');
  await page.getByRole('button',{name:'Next episode',exact:true}).click();
  await expect(page.getByRole('dialog')).toContainText('S2 E2');
  await expect(page.getByRole('button',{name:'Next episode',exact:true})).toBeDisabled();
  await finish(page);await expect(page.getByRole('dialog')).toContainText('S2 E2');
});

test('autoplay can be disabled and manual Next episode still works',async({page})=>{
  await openPilot(page);await page.getByRole('checkbox',{name:'Auto-play next episode'}).uncheck();
  await finish(page);await expect(page.getByRole('dialog')).toContainText('S1 E1');
  expect(await page.evaluate(()=>JSON.parse(localStorage.getItem('aster.settings.v1')!).autoNext)).toBe(false);
  await page.getByRole('button',{name:'Next episode',exact:true}).click();await expect(page.getByRole('dialog')).toContainText('S1 E2');
});

test('remembers the selected season, last episode and playback position after reopening',async({page})=>{
  await page.goto('/');await page.getByRole('button',{name:'View details',exact:true}).click();await page.getByLabel('Season',{exact:true}).selectOption('2');
  await page.reload();await page.getByRole('button',{name:'View details',exact:true}).click();await expect(page.getByLabel('Season',{exact:true})).toHaveValue('2');
  await page.getByRole('button',{name:'Play episode 2: The Return'}).click();
  await page.locator('video').evaluate(async(v:HTMLVideoElement)=>{if(v.readyState<1)await new Promise(r=>v.addEventListener('loadedmetadata',r,{once:true}));v.currentTime=2;v.pause();v.dispatchEvent(new Event('pause'));});
  await page.getByRole('button',{name:'Close dialog'}).click();await page.reload();
  await page.getByRole('button',{name:'View details',exact:true}).click();await expect(page.getByLabel('Season',{exact:true})).toHaveValue('2');
  await page.screenshot({path:'../aster-remember-season.png'});
  await page.getByRole('button',{name:/Continue S2 E2/}).click();
  await expect.poll(()=>page.locator('video').evaluate((v:HTMLVideoElement)=>v.currentTime)).toBeGreaterThanOrEqual(1.9);
});

test('failed next-episode sources leave playback available and can be retried',async({page})=>{
  let fail=true;await page.route('https://episodes.fixture.test/stream/series/tt12345%3A1%3A2.json',route=>fail?route.fulfill({status:503,body:'Unavailable'}):route.fulfill({json:{streams:[{name:'1080p',url:'http://127.0.0.1:1420/media/sintel-trailer.mp4?retry=1'}]}}));
  await openPilot(page);await page.getByRole('button',{name:'Next episode',exact:true}).click();
  await expect(page.getByRole('alert')).toContainText('could not be reached');await expect(page.getByRole('dialog')).toContainText('S1 E1');
  fail=false;await page.getByRole('button',{name:'Next episode',exact:true}).click();await expect(page.getByRole('dialog')).toContainText('S1 E2');
});



test('closing during next-episode loading prevents late autoplay',async({page})=>{
  let release:()=>void=()=>{},requested=false;const ready=new Promise<void>(resolve=>{release=resolve;});
  await page.route('https://episodes.fixture.test/stream/series/tt12345%3A1%3A2.json',async route=>{requested=true;await ready;await route.fulfill({json:{streams:[{name:'1080p',url:'http://127.0.0.1:1420/media/sintel-trailer.mp4?late=1'}]}});});
  await openPilot(page);await page.getByRole('button',{name:'Next episode',exact:true}).click();await expect.poll(()=>requested).toBe(true);
  await page.getByRole('button',{name:'Close dialog'}).click();release();
  await expect(page.locator('video')).toHaveCount(0);await expect(page.locator('.modal[open]')).toHaveCount(0);
});
