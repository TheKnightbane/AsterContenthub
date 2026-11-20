# Aster Content Hub 0.1.0-alpha.8

Windows alpha fix: reliable, repeatable trailer previews.

- Uses YouTube's supported player API and readiness events, replacing a fragile one-shot message subscription.
- Repeated hover starts create and clean up separate player instances correctly.
- Previews loop while hovered instead of stopping permanently after 45 seconds.
- Detects stalled playback, retries play, and falls back to another trailer if needed. Duplicate error/timeout notifications no longer skip extra sources.
- Keeps rotating Home banners, muted banner autoplay, compact-card sizing and scroll recovery.

## Download

Use **AsterContentHub-Setup-0.1.0-alpha.8-x64.exe**. Alpha 3–7 installations can receive this through automatic updates. Windows x64 and WebView2 are required; mpv is included. Your library and settings are preserved.

The installer is unsigned for Windows publisher/SmartScreen checks. Tauri update signatures verify installer authenticity and release version separately.

Use your own addons and authorized media sources. Player source and licenses: [mpv 0.42.0 corresponding source](https://github.com/TheKnightbane/AsterContenthub/releases/download/v0.1.0-alpha.2/mpv-0.42.0-corresponding-source.zip).
