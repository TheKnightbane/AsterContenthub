# Follow-ups

- **Trakt app registration — deferred by the owner.** Register Aster’s own application before enabling the shared Authenticate flow. Set the public Client ID as `VITE_TRAKT_CLIENT_ID` locally and as a repository variable, then publish a new signed release. Keep client secrets out of desktop builds. Do not reuse Stremio’s client registration or callback URL. Current API guidance: https://developer.trakt.tv/docs/create-an-app and https://developer.trakt.tv/docs/pkce .
- **Yellow border — investigate later at the owner’s request.** It remained visible after Aster closed, including after the preview JavaScript session was reset. No Windows capture/privacy settings were changed. Avoid native screen-capture previews while investigating.
