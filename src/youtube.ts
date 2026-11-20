export interface YouTubePlayer {
  mute(): void; playVideo(): void; seekTo(seconds: number, allowSeekAhead: boolean): void;
  getPlayerState(): number; getCurrentTime(): number; getIframe(): HTMLIFrameElement; destroy(): void;
}
interface PlayerEvent { target: YouTubePlayer; data?: number }
export interface YouTubeApi {
  Player: new (element: HTMLElement, options: { host: string; width: string; height: string; videoId: string; playerVars: Record<string, string | number>; events: { onReady: (event: PlayerEvent) => void; onStateChange: (event: PlayerEvent) => void; onError: () => void; onAutoplayBlocked: () => void } }) => YouTubePlayer;
}
declare global { interface Window { YT?: YouTubeApi; onYouTubeIframeAPIReady?: () => void } }
let pending: Promise<YouTubeApi> | undefined;
/** One shared, retryable loader for YouTube's supported ready/event handshake. */
export function youtubeApi(): Promise<YouTubeApi> {
  if (window.YT?.Player) return Promise.resolve(window.YT);
  if (pending) return pending;
  pending = new Promise<YouTubeApi>((resolve, reject) => {
    const script = document.createElement('script');
    const previous = window.onYouTubeIframeAPIReady;
    const cleanup = () => { clearTimeout(timeout); if (window.onYouTubeIframeAPIReady === ready) window.onYouTubeIframeAPIReady = previous; };
    const fail = () => { cleanup(); script.remove(); pending = undefined; reject(new Error('Trailer player could not load.')); };
    const ready = () => { previous?.(); if (window.YT?.Player) { cleanup(); resolve(window.YT); } };
    const timeout = setTimeout(fail, 20000);
    window.onYouTubeIframeAPIReady = ready;
    script.src = 'https://www.youtube.com/iframe_api'; script.async = true; script.onerror = fail;
    document.head.append(script);
  });
  return pending;
}
