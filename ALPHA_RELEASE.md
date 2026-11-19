# Aster Content Hub 0.1.0-alpha.4

Windows alpha update: guided first-time setup and reliable player exit.

- First-launch setup for catalog/stream addons and optional Real-Debrid connection.
- One-click Cinemeta setup, custom manifest URLs, saved progress, skip options and a setup summary.
- Existing libraries and connections are preserved. Run setup again from Settings → About.
- Escape remains available when fullscreen controls disappear: Escape exits fullscreen, then another press closes playback.
- Trakt now has an Authenticate button that opens its browser approval page when an app registration is configured. Shared Aster Trakt registration remains pending; it is a planned owner follow-up.
- Includes mpv, audio/subtitle controls and signed automatic updates.

## Download

Use **AsterContentHub-Setup-0.1.0-alpha.4-x64.exe**. Alpha 3 installations can receive this through automatic updates. Alpha 1/2 users need to install a current setup build once to enable the updater. Close earlier Aster windows before a manual installation. Windows x64 and WebView2 are required; mpv is included.

The installer is unsigned for Windows publisher/SmartScreen checks. Tauri update signatures verify installer authenticity and release version separately.

Use your own addons and authorized media sources. Player source and licenses: [mpv 0.42.0 corresponding source](https://github.com/TheKnightbane/AsterContenthub/releases/download/v0.1.0-alpha.2/mpv-0.42.0-corresponding-source.zip).

