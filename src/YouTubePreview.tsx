import { useEffect, useRef } from 'react';
import { youtubeApi, type YouTubePlayer } from './youtube';

/** Imperative player DOM lives inside an empty React-owned container. */
export default function YouTubePreview({ id, title, playing, failed }: { id: string; title: string; playing: () => void; failed: () => void }) {
  const container = useRef<HTMLSpanElement>(null);
  const callbacks = useRef({playing, failed}); callbacks.current = {playing, failed};
  useEffect(() => {
    let alive = true, player: YouTubePlayer | undefined, ready = false, failureReported = false;
    let lastPosition = -1, unchanged = 0;
    const fail = () => { if (alive && !failureReported) { failureReported = true; callbacks.current.failed(); } };
    const restart = () => { if (!alive || !ready || !player) return; player.mute(); player.seekTo(0, true); player.playVideo(); };
    void youtubeApi().then(api => {
      if (!alive || !container.current) return;
      const slot = document.createElement('span'); container.current.append(slot);
      player = new api.Player(slot, { host: 'https://www.youtube-nocookie.com', width: '100%', height: '100%', videoId: id,
        playerVars: { autoplay: 1, mute: 1, controls: 0, playsinline: 1, rel: 0, origin: location.origin },
        events: {
          onReady: event => { if (!alive) return; ready = true; event.target.mute(); event.target.playVideo(); if (event.target.getPlayerState() === 1) callbacks.current.playing(); },
          onStateChange: event => { if (!alive) return; if (event.data === 1) callbacks.current.playing(); else if (event.data === 0) restart(); else if (ready && event.data === 2) event.target.playVideo(); },
          onError: fail, onAutoplayBlocked: fail,
        },
      });
      const iframe = player.getIframe(); iframe.title = `${title} trailer`; iframe.tabIndex = -1;
      iframe.referrerPolicy = 'strict-origin-when-cross-origin'; iframe.allow = 'autoplay; encrypted-media';
    }).catch(fail);
    // Do not rely solely on state messages: verify that video time advances.
    const health = setInterval(() => {
      if (!ready || !player || !alive) return;
      try {
        const position = player.getCurrentTime();
        if (position >= 45) { restart(); lastPosition = -1; unchanged = 0; return; }
        unchanged = Math.abs(position - lastPosition) < .1 ? unchanged + 1 : 0;
        lastPosition = position;
        if (player.getPlayerState() === 1 && position > 0) callbacks.current.playing();
        if (unchanged === 3) player.playVideo();
        if (unchanged >= 8) fail();
      } catch { fail(); }
    }, 2000);
    return () => { alive = false; clearInterval(health); try { player?.destroy(); } catch { /* Frame may already have detached. */ } container.current?.replaceChildren(); };
  }, [id, title]);
  return <span className="trailer-youtube" ref={container} />;
}
