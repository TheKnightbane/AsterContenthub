/** Opt-in real Windows WebView trailer check. Uses a fresh WebView folder and test profile. */
import { chromium } from '@playwright/test';
import { spawn } from 'node:child_process';
import { mkdtempSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';
import assert from 'node:assert/strict';
import { createServer } from 'node:net';
const exe=resolve('src-tauri/target/release/aster-content-hub.exe');
assert(existsSync(exe),'Build the Windows application first.');
const reservation=createServer();
await new Promise(r=>reservation.listen(0,'127.0.0.1',r));
const port=reservation.address().port;
await new Promise(r=>reservation.close(r));
const directory=mkdtempSync(join(tmpdir(),'aster-trailer-test-'));
const child=spawn(exe,[],{windowsHide:true,stdio:'ignore',env:{...process.env,WEBVIEW2_USER_DATA_FOLDER:directory,WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS:`--remote-debugging-port=${port}`}});
let browser;
try {
  for(let attempt=0;attempt<40;attempt++){
    try{browser=await chromium.connectOverCDP(`http://127.0.0.1:${port}`);break;}catch{await new Promise(r=>setTimeout(r,500));}
  }
  assert(browser,'The isolated WebView debugging endpoint did not start.');
  const page=browser.contexts()[0].pages().find(p=>p.url().includes('tauri.localhost'));
  assert(page,'Packaged Tauri page not found.');
  await page.evaluate(({testId,testTitle})=>{
    const id='22222222-2222-4222-8222-222222222222';
    localStorage.setItem('aster.profiles.v1',JSON.stringify([{id,name:'Native trailer test'}]));
    localStorage.setItem('aster.active-profile.v1',id);
    localStorage.setItem('aster.setup.v1',JSON.stringify({version:1,status:'complete',step:3}));
    localStorage.setItem(`aster.settings.v1:profile:${id}`,JSON.stringify({showSpotlight:false,collections:[{id:'trailers',name:'Trailer diagnostics',mediaIds:[testId]}]}));
    localStorage.setItem(`aster.state.v1:profile:${id}`,JSON.stringify({version:1,seeded:true,items:{[testId]:{media:{id:testId,type:'movie',title:testTitle,year:2001,genre:'Fantasy',duration:'Movie',description:'Trailer test',art:'/art/forest.jpg',accent:'#18232d',source:'Cinemeta'},inLibrary:true,favorite:false,updatedAt:new Date().toISOString()}},addons:[{url:'https://v3-cinemeta.strem.io/manifest.json',manifest:{id:'cinemeta',name:'Cinemeta',version:'1',description:'Metadata',resources:['meta'],types:['movie','series'],catalogs:[]}}]}));
  },{testId:process.env.ASTER_TRAILER_TEST_ID||'tt0241527',testTitle:process.env.ASTER_TRAILER_TEST_TITLE||'Harry Potter'});
  await page.reload();
  await page.locator('.cinema-shelf-heading').hover();
  await page.evaluate(()=>{const card=document.querySelector('.landscape-card');card.dispatchEvent(new PointerEvent('pointerover',{bubbles:true,pointerType:'mouse',relatedTarget:document.body}));card.dispatchEvent(new PointerEvent('pointerout',{bubbles:true,pointerType:'mouse',relatedTarget:document.body}));});
  await page.waitForTimeout(150);
  assert.equal(await page.locator('.landscape-card .hover-trailer').count(),0,'Rapid pointer exit must clear queued preview state.');
  console.log('Packaged WebView: rapid hover race cleared correctly.');
  for(const [iteration,width] of [1152,1920,1152,1920].entries()){
    await page.setViewportSize({width,height:900});
    await page.locator('.cinema-shelf-heading').hover();
    const card=page.locator('.landscape-art').first();
    const box=await card.boundingBox();
    await page.locator('.landscape-card').first().hover({position:{x:20,y:20}});
    const preview=page.locator(width===1152?'.hover-trailer-floating.is-playing':'.landscape-art>.hover-trailer.is-playing');
    await preview.waitFor({state:'visible',timeout:35000});
    const frame=page.frames().find(f=>f.url().startsWith('https://www.youtube-nocookie.com/embed/'));
    assert(frame,'YouTube frame missing.');
    await frame.waitForFunction(()=>{const v=document.querySelector('video');return v&&!v.paused&&v.currentTime>1;},null,{timeout:15000});
    assert(await frame.locator('video').evaluate(v=>v.muted),'Trailer must be muted.');
    console.log(`Packaged WebView: ${width}px window, ${Math.round(box.height)}px card, muted trailer playing (${width===1152?'expanded':'inline'}).`);
    if(process.env.ASTER_TRAILER_SOAK==='1'&&iteration===3){
      console.log('Checking continuous playback beyond the old 45-second stop…');
      await frame.waitForFunction(()=>document.querySelector('video')?.currentTime>40,null,{timeout:50000});
      await frame.waitForFunction(()=>{const v=document.querySelector('video');return v&&!v.paused&&v.currentTime<5;},null,{timeout:15000});
      console.log('Continuous preview verified: clip looped and kept playing after 45 seconds.');
    }
    await page.locator('.cinema-shelf-heading').hover();
    await page.locator('iframe').waitFor({state:'detached'});
  }
  await page.evaluate(() => { const key='aster.settings.v1:profile:22222222-2222-4222-8222-222222222222'; const value=JSON.parse(localStorage.getItem(key)); localStorage.setItem(key,JSON.stringify({...value,showSpotlight:true})); const stateKey='aster.state.v1:profile:22222222-2222-4222-8222-222222222222'; const state=JSON.parse(localStorage.getItem(stateKey)); const base=Object.values(state.items)[0]; const secondId=base.media.id==='tt0241527'?'tt33764258':'tt0241527'; state.items[secondId]={...base,media:{...base.media,id:secondId,title:secondId==='tt0241527'?'Harry Potter':'The Odyssey'}}; localStorage.setItem(stateKey,JSON.stringify(state)); });
  await page.reload();
  await page.locator('.cinema-hero .banner-trailer.is-playing').waitFor({state:'visible',timeout:35000});
  const bannerFrame=page.frames().find(f=>f.url().startsWith('https://www.youtube-nocookie.com/embed/'));
  await bannerFrame.waitForFunction(()=>{const v=document.querySelector('video');return v&&!v.paused&&v.currentTime>1;},null,{timeout:15000});
  assert(await bannerFrame.locator('video').evaluate(v=>v.muted));
  await page.locator('.cinema-hero-copy').hover();
  const featured=await page.locator('.cinema-pagination button[aria-pressed=true]').getAttribute('aria-label');
  await page.waitForFunction(before=>document.querySelector('.cinema-pagination button[aria-pressed=true]')?.getAttribute('aria-label')!==before,featured,{timeout:11000});
  console.log('Packaged WebView: eight-second banner rotation continues with pointer over banner.');
  await page.getByRole('button',{name:'View details',exact:true}).click();
  await page.locator('.banner-trailer iframe').waitFor({state:'detached'});
  console.log('Packaged WebView: banner autoplays muted without hover; opening details stops it.');
} finally {
  await browser?.close();
  child.kill();
}
