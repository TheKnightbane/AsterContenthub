# Aster Content Hub — Windows alpha

A desktop content hub built with Tauri, React, TypeScript and Vite. **0.1.0-alpha.7** is an early testing release.

[Download the Windows alpha](https://github.com/TheKnightbane/AsterContenthub/releases/tag/v0.1.0-alpha.7) · [Report an issue](https://github.com/TheKnightbane/AsterContenthub/issues)

## Install and preview

Download **AsterContentHub-Setup-0.1.0-alpha.7-x64.exe** from the release page. Windows x64 and Microsoft WebView2 are required. The installer can install WebView2 when needed. This is an unsigned development build; Windows may display an unknown-publisher warning.

No account, email, API key or Supabase credentials are required to open the app. Your existing Aster library and device credentials are preserved. Automatic updates are included. Alpha 1/2 users need to install this version once; later signed releases download automatically. Updates install after a minute of inactivity, with a Later option. Playback, open dialogs and editing postpone installation. Settings → About includes Check for updates and an Automatic updates switch. Portable/development previews use manual installation.

mpv 0.42.0 is included and selected automatically on first use. No separate player installation is needed. The built-in video player remains available in Settings.

In fullscreen, move the mouse to reveal the timeline and volume controls. Left/Right seek 10 seconds, Up/Down adjust volume, M mutes, F toggles fullscreen; Esc exits fullscreen, and another press closes playback. Escape is also observed by the native host while Aster is the foreground app, so hidden controls do not swallow it.

## First-time setup

Fresh installs open a guided setup screen. Add Cinemeta for catalog discovery, then paste your own stream-provider manifest. Optionally connect Real-Debrid using your own API token. Every step is skippable and unfinished setup resumes after reopening. Existing configured installations skip onboarding. Settings → About → Run setup again opens it whenever needed. Addons are saved locally; Real-Debrid tokens use Windows Credential Manager. Neither is included in the distributed installer.

Trakt has an Authenticate button, with the shared Aster registration still pending. The owner deferred registering Aster’s own Trakt app; see `PROJECT_NOTES.md`. A future registration can supply the public `VITE_TRAKT_CLIENT_ID` build/repository variable.

## Start watching

1. In Addons, install a catalog manifest such as Cinemeta: `https://v3-cinemeta.strem.io/manifest.json`.
2. Install a compatible stream-provider addon. Cinemeta supplies metadata, seasons and episodes; it does not supply playback links.
3. Connect your own services in Settings when needed, then press Play. Choose source remains available beside Play and inside the player.

Movies start using the preferred source quality. TV shows have season and episode pickers, separate resume progress, Next episode and optional autoplay across seasons. Audio and subtitle controls list tracks supplied by the selected video. Fullscreen mpv hides the surrounding controls until pointer or keyboard activity.

The retired Open Cinema catalog is not shown. No commercial films or third-party subscriptions are included. Use content and sources you are authorized to access.

## Profiles and sync — no email

Open **Profiles & sync** from the sidebar or profile avatar.

- Create local profiles with separate libraries, favorites, watch progress, collections and appearance settings. The original collection stays in the first profile.
- Select **Enable sync** to connect a profile to the alpha backend. No email or password is needed.
- Select **Add another device** to generate a pairing code. On the other device, choose **Connect existing profile** and paste the code.
- Pairing codes expire after 15 minutes and work once. They grant access to that profile, so share them only with your trusted device.
- Changes upload after a short delay and synchronize periodically while the app is open. Offline changes remain local and retry when connectivity returns. **Sync now** is also available.

The selected season and last played episode are remembered locally; synchronized episode progress reconstructs Continue on another device. New devices need their own addons and service credentials. Profiles are not protected by PINs. Service credentials and default player/language preferences are device-wide.

Keep a collection backup and at least one connected device. If all devices lose their sessions, there is no email recovery in this alpha. **Reconnect with code** can attach a replacement session using another connected device.

Cloud sync is optional. The published alpha uses a shared Supabase project within its hosting quotas, and alpha availability is not guaranteed. Each device has a separate background identity; database row-level policies allow access only through explicit profile membership. Library metadata, favorites and progress are uploaded only after enabling or pairing sync. Windows sync sessions are stored in Credential Manager; browser development uses browser storage. Pairing codes are stored hashed on the server.

## Services

| Integration | Alpha functionality |
| --- | --- |
| Stremio addons | Catalogs, search, series metadata and stream sources |
| Real-Debrid | Account verification; hosted links and movie/episode torrents |
| TorBox / Premiumize / AllDebrid | Cloud browsing and supported link/magnet resolution |
| PikPak / WebDAV | Folder browsing and original-file playback; PikPak needs Premium WebDAV |
| Jellyfin / Emby / Plex | Server libraries, shows, episodes and original-file playback |
| Jackett / Prowlarr | Search configured indexers and resolve magnet results |
| IPTV | M3U channels and HTTP(S) streams, including protected HLS |
| Trakt / Simkl | Movie lists/history and opt-in completed-movie tracking |
| MDBList | Movie lists, using installed addons for playback sources |
| Infuse | External handoff on supported Apple devices; Infuse does not run on Windows |

Credentials are stored in Windows Credential Manager and are not included in collection backups or cloud sync. Protected server playback uses a private loopback bridge; those local URLs cannot be handed to another device. Provider accounts, permissions, premium features and source availability determine what plays. Hosted-provider adapters have fixture coverage; every external personal account has not been verified live.

## Known alpha limitations

- Native iOS/tvOS apps, media-server next-episode queues and autoplay inside external players are not included.
- Media servers play original files without requesting transcoding. Alternate audio/subtitles depend on the file.
- Real-Debrid episode packs match common SxxExx or season-x-episode names. Other cloud episode torrents should be opened as exact files from Services. Ambiguous packs require another source or explicit file selection.
- Indexers require magnet/infohash results; NZB and authenticated torrent-file fetching are not included.
- IPTV guide/DVR, casting, parental controls, profile PINs and automatic app updates are not implemented.
- Collection conflicts use record timestamps from device clocks. Production-grade recovery and per-field conflict resolution are future work.

## Build from source

Windows prerequisites: Node.js 24 with npm, Rust stable/MSVC, Microsoft C++ Build Tools with Windows SDK, and WebView2. See [Tauri prerequisites](https://v2.tauri.app/start/prerequisites/).

```powershell
npm ci
npm run dev               # Browser preview at http://127.0.0.1:1420
npm run desktop           # Native app with hot reload
npm test
npx playwright install chromium
npm run test:e2e
npm run desktop:build -- --config src-tauri/tauri.unsigned.conf.json     # Windows executable and NSIS installer
```

The workspace helper `Start-Aster.ps1` can also launch `-Mode web`, `-Mode desktop`, `-Mode test` or `-Mode build`. It discovers the workspace-local toolchain when available and otherwise uses standard installed tools.

### Your own optional backend

Copy `.env.example` to `.env.local`, set `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY`, run `supabase/profiles.sql` in your Supabase SQL editor, and enable anonymous sign-ins. Keep row-level security enabled. Never put a secret/service-role key into the app. Builds without this configuration remain local-only.

`shared/models.ts` defines the media and saved-record JSON shared by future clients. `supabase/profiles.sql` defines profile membership and pairing. `src/profile-sync.ts` implements the protocol. Native Swift iOS/tvOS clients can use the same backend and models; they are not part of this alpha.

Live pairing tests are opt-in: set `ASTER_LIVE_SYNC=1` before running `tests/e2e/profiles.spec.ts`. They create isolated test profiles in the configured backend. Normal CI uses a mock configuration and never needs private credentials.

## Testing and feedback

See `VERIFICATION.md` for completed checks. When reporting a bug, include the app version, Windows version, selected player, steps to reproduce, and an error message. Remove private links, access tokens, pairing codes and account credentials from reports.

## Credits

Sintel © Blender Foundation, [sintel.org](https://www.sintel.org/), [CC BY 3.0](https://creativecommons.org/licenses/by/3.0/). The unmodified trailer from [W3C’s media sample](https://media.w3.org/2010/05/sintel/trailer.mp4) is included only as a playback test asset.

Illustrative photographs: Unsplash, under the [Unsplash license](https://unsplash.com/license); exact URLs are in `ASSETS.md`. UI icons: Lucide (ISC). Aster logo: original SVG. Aster is not affiliated with Stremio, Blender, the listed service providers or Infuse.

## Bundled player

The Windows package includes the unmodified official mpv 0.42.0 x64 player and Vulkan runtime. Build preparation downloads a pinned, SHA-256-verified archive. Player notices and source information are in `third-party/mpv` and installed under `player`. mpv runs as a separate child process controlled through its IPC interface.

## Publishing automatic updates

Release builds use Tauri updater signatures, which are separate from Windows Authenticode publisher certificates. The initial Windows installer is still unsigned for SmartScreen. The public verification key is bundled with Aster. The encrypted private key is kept outside this repository and in GitHub Actions secrets; never commit it or replace it casually. Keep a secure offline backup because existing installations trust this key.

Bump `package.json`, `package-lock.json`, `src-tauri/Cargo.toml`, `src-tauri/tauri.conf.json`, the About version and release notes together. Commit, then push a matching tag, for example `git tag v0.1.0-alpha.7` followed by `git push origin main v0.1.0-alpha.7`. The **Publish signed Windows update** workflow tests, builds and signs the installer, publishes the versioned release and advances `updater/latest.json`. It also supports Run workflow on GitHub. An ordinary source commit or unsigned uploaded EXE does not become an update. Older release jobs cannot roll the update feed backwards.

Required Actions secrets: `TAURI_SIGNING_PRIVATE_KEY` and `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`. Public backend config uses the repository variables documented above. `Windows alpha checks` deliberately builds without release-signing secrets, including for pull requests.

The app checks at launch and every six hours while open, retries when networking returns, downloads through HTTPS, and verifies the installer signature before offering installation. Check/signature failures leave the running app unchanged. Windows installations are detected by their NSIS uninstaller; portable previews show version availability without converting themselves into installed apps.

Fork maintainers must configure their own app identifier, signing public key, release endpoint and Actions secrets before distributing builds. Do not publish a fork that unintentionally follows the official Aster update feed.

### Hover trailers

Hover over a movie or series card for a moment to play a muted trailer. Your installed metadata addon must supply one; Cinemeta is supported. Move away to stop. Turn previews off in Settings → Home & display → Play trailers on hover. Reduced motion disables automatic previews. Missing, blocked or non-embeddable trailers keep the artwork. YouTube previews use its privacy-enhanced embedded player and require internet access; small cards expand a hover preview to meet the player minimum size. Metadata compatibility follows the [Stremio meta contract](https://stremio.github.io/stremio-addon-sdk/api/responses/meta.html) and embeds use the [YouTube player API](https://developers.google.com/youtube/iframe_api_reference).

To verify real YouTube playback in the packaged Windows WebView, build the desktop app and run `node scripts/check-native-trailers.mjs`. This opt-in check requires internet, opens an isolated diagnostic copy, uses a fresh test profile/WebView folder, checks scaled and large cards, then closes its own process. It does not use your library.

The Home spotlight rotates suggestions every eight seconds and automatically starts available muted trailers. Rotation pauses while you hover over or focus the banner. Banner autoplay, rotation and card hover previews each have their own switch in Settings → Home & display. Reduced motion disables automatic playback and rotation. Scrolling temporarily suspends previews; they recover when scrolling settles. Unavailable trailer videos fall back to other provider trailers.
