import type { Page } from '@playwright/test';
/** Offline implementation of the public player API; real provider checks remain opt-in. */
export async function mockYouTubeApi(page: Page, readyDelay = 50) {
  await page.route('https://www.youtube.com/iframe_api', route => route.fulfill({ contentType: 'application/javascript', body: `
    window.__ytMockPlayers=[];
    window.YT={Player:class {
      constructor(slot,options){this.options=options;this.state=-1;this.playCalls=0;this.seekCalls=0;this.destroyed=false;this.base=performance.now();
        this.iframe=document.createElement('iframe');this.iframe.src=options.host+'/embed/'+options.videoId+'?'+new URLSearchParams(options.playerVars);slot.replaceWith(this.iframe);
        this.listener=e=>{if(e.source!==this.iframe.contentWindow||e.origin!=='https://www.youtube-nocookie.com')return;try{const d=typeof e.data==='string'?JSON.parse(e.data):e.data;this.emit(d.event,d.info);}catch{}};
        window.addEventListener('message',this.listener);window.__ytMockPlayers.push(this);
        setTimeout(()=>{if(!this.destroyed)options.events.onReady({target:this});},${readyDelay});
      }
      emit(event,data){if(!this.destroyed)this.options.events[event]?.({target:this,data});}
      getIframe(){return this.iframe;}
      mute(){this.muted=true;}
      playVideo(){this.playCalls++;this.state=1;this.emit('onStateChange',1);}
      seekTo(position){this.seekCalls++;this.base=performance.now()-position*1000;}
      getPlayerState(){return this.state;}
      getCurrentTime(){return (performance.now()-this.base)/1000;}
      destroy(){this.destroyed=true;window.removeEventListener('message',this.listener);this.iframe.remove();}
    }};window.onYouTubeIframeAPIReady?.();
  ` }));
}
