import {test,expect} from '@playwright/test';
import {installFixture,playFixture} from './fixture';
const openProfiles=async(page:import('@playwright/test').Page)=>{await page.getByRole('button',{name:'Profiles & sync',exact:true}).click();};
test('local profiles isolate collections and preserve the original library across switches',async({page})=>{
  await installFixture(page);await page.goto('/');await page.getByRole('button',{name:'View details',exact:true}).click();await page.getByRole('button',{name:'Add to library',exact:true}).click();await page.getByRole('button',{name:'Close dialog'}).click();
  await openProfiles(page);await page.getByLabel('New local profile',{exact:true}).fill('Second profile');await page.getByRole('button',{name:'Create profile',exact:true}).click();
  await page.getByRole('button',{name:'Library',exact:true}).click();await expect(page.getByRole('button',{name:'View Sintel',exact:true})).toHaveCount(0);
  await openProfiles(page);await expect(page.locator('.profile-choice.chosen')).toContainText('Second profile');await page.locator('.profile-choice').filter({hasText:'My profile'}).click();
  await page.getByRole('button',{name:'Library',exact:true}).click();await expect(page.getByRole('button',{name:'View Sintel',exact:true})).toBeVisible();
  await page.reload();await page.getByRole('button',{name:'Library',exact:true}).click();await expect(page.getByRole('button',{name:'View Sintel',exact:true})).toBeVisible();
  await openProfiles(page);await expect(page.getByLabel('Email address')).toHaveCount(0);await page.screenshot({path:'../aster-local-profiles.png'});
});
test('failed device sign-in keeps the local library and can be retried',async({page})=>{
  await installFixture(page);await page.route('https://*.supabase.co/auth/v1/signup',route=>route.fulfill({status:503,json:{msg:'Temporarily unavailable'}}));
  await page.goto('/');await page.getByRole('button',{name:'View details',exact:true}).click();await page.getByRole('button',{name:'Add to library',exact:true}).click();await page.getByRole('button',{name:'Close dialog'}).click();await openProfiles(page);
  await page.getByRole('button',{name:'Enable sync',exact:true}).click();await expect(page.getByRole('alert')).toContainText('Temporarily unavailable');
  expect(await page.evaluate(()=>JSON.parse(localStorage.getItem('aster.state.v1')!).items['fixture:sintel'].inLibrary)).toBe(true);
});
test('two devices pair and synchronize library and watch progress without email',async({page,browser})=>{
  test.skip(process.env.ASTER_LIVE_SYNC!=='1','Requires the explicitly configured live alpha backend.');test.setTimeout(90000);
  await installFixture(page);await page.goto('/');await page.getByRole('button',{name:'View details',exact:true}).click();await page.getByRole('button',{name:'Add to library',exact:true}).click();await page.getByRole('button',{name:'Close dialog'}).click();await playFixture(page);
  await page.locator('video').evaluate(async(v:HTMLVideoElement)=>{if(v.readyState<1)await new Promise(r=>v.addEventListener('loadedmetadata',r,{once:true}));v.currentTime=2;v.pause();v.dispatchEvent(new Event('pause'));});await page.getByRole('button',{name:'Close dialog'}).click();
  await openProfiles(page);await page.getByRole('button',{name:'Enable sync',exact:true}).click();await expect(page.getByRole('dialog').getByRole('status')).toContainText('Collection synced',{timeout:20000});await page.getByRole('button',{name:'Add another device',exact:true}).click();
  const code=(await page.locator('.pairing-code code').innerText()).replace(/-/g,'');
  const peerContext=await browser.newContext({baseURL:'http://127.0.0.1:1420',viewport:{width:1440,height:1050}});try{
    const peer=await peerContext.newPage();await installFixture(peer);await peer.goto('/');await openProfiles(peer);await peer.getByRole('button',{name:'Connect existing profile',exact:true}).click();await peer.getByLabel('Pairing code from your other device').fill(code);await peer.getByRole('button',{name:'Connect & sync',exact:true}).click();await expect(peer.getByRole('dialog').getByRole('status')).toContainText('Collection synced',{timeout:20000});
    await peer.getByRole('button',{name:'Close dialog'}).click();await peer.getByRole('button',{name:'Library',exact:true}).click();await expect(peer.getByRole('button',{name:'View Sintel',exact:true})).toBeVisible();
    expect(await peer.evaluate(()=>JSON.parse(localStorage.getItem('aster.state.v1')!).items['fixture:sintel'].progress.position)).toBeGreaterThan(1.5);
    await peer.getByRole('button',{name:'Favorite Sintel',exact:true}).click();await openProfiles(peer);await peer.getByRole('button',{name:'Sync now',exact:true}).click();await expect(peer.getByRole('dialog').getByRole('status')).toContainText('Collection synced');
    await page.getByRole('button',{name:'Close dialog'}).click();await openProfiles(page);await page.getByRole('button',{name:'Sync now',exact:true}).click();await expect(page.getByRole('dialog').getByRole('status')).toContainText('Collection synced');
    expect(await page.evaluate(()=>JSON.parse(localStorage.getItem('aster.state.v1')!).items['fixture:sintel'].favorite)).toBe(true);
    await page.screenshot({path:'../aster-paired-sync.png'});
  }finally{await peerContext.close();}
});


