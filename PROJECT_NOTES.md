# Follow-ups

- **Trakt app registration — deferred by the owner.** Register Aster’s own application before enabling the shared Authenticate flow. Set the public Client ID as `VITE_TRAKT_CLIENT_ID` locally and as a repository variable, then publish a new signed release. Keep client secrets out of desktop builds. Do not reuse Stremio’s client registration or callback URL. Current API guidance: https://developer.trakt.tv/docs/create-an-app and https://developer.trakt.tv/docs/pkce .
- **Yellow border — investigate later at the owner’s request.** It remained visible after Aster closed, including after the preview JavaScript session was reset. No Windows capture/privacy settings were changed. Avoid native screen-capture previews while investigating.

- **Next planned session: iOS app (November 20, 2026).** Reuse Aster's shared data models, addon integration patterns and Supabase profile/library/watch-progress backend. Begin with the iPhone interface and playback approach; device builds will require macOS with Xcode. Apple TV remains a future client.

- **Fullscreen catalog layout fixed in Alpha 5.** Removed the inherited 1900px main width cap. Verified rails fill 1440px, 2560px and 3840px windows, preserve horizontal scrolling, and allow the final card to be fully reached.

- **Alpha 5 hover trailers.** Muted previews after 900ms on Home, Search and collection cards. Uses installed metadata addons (Cinemeta trailerStreams / Stremio trailers); no extra API key. Stops on leave, scroll, dialog/player opening or hidden app. Respects reduced motion and Settings → Home & display → Play trailers on hover. Direct HTTPS video and approved YouTube privacy-enhanced embeds only; unavailable trailers retain artwork. Live Cinemeta/YouTube playback verified in browser.
