# Aster Content Hub 0.1.0-alpha.6

Windows alpha fix: hover trailers now work on smaller and compact cards.

- Fixed a size check that silently skipped YouTube trailers on cards under 200 pixels tall. Small cards now expand a properly sized hover preview, including in scaled Windows layouts.
- Fixed collection updates discarding an active hover preview.
- Catalog rows now fill wide/fullscreen windows without the unused strip on the right. Horizontal scrolling can reach every card.
- Hover over a movie or series card to start a muted trailer after a short pause, on Home, Search and your collections.
- Uses trailer metadata from your installed addons, including Cinemeta. No extra API key is needed.
- Previews stop when you leave, scroll, open a title or start playback. Reduced motion disables them; you can also switch them off in Settings → Home & display.
- Titles without a supported, available trailer keep their artwork. YouTube availability and embed restrictions still apply.
- Includes the existing first-launch setup, bundled mpv, episode controls, profile sync and signed automatic updates.
- Shared Trakt app registration remains an owner follow-up.

## Download

Use **AsterContentHub-Setup-0.1.0-alpha.6-x64.exe**. Alpha 3–5 installations can receive this through automatic updates. Alpha 1/2 users need to install a current setup build once to enable the updater. Close earlier Aster windows before a manual installation. Windows x64 and WebView2 are required; mpv is included.

The installer is unsigned for Windows publisher/SmartScreen checks. Tauri update signatures verify installer authenticity and release version separately.

Use your own addons and authorized media sources. Player source and licenses: [mpv 0.42.0 corresponding source](https://github.com/TheKnightbane/AsterContenthub/releases/download/v0.1.0-alpha.2/mpv-0.42.0-corresponding-source.zip).
