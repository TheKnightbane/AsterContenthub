# Aster Content Hub 0.1.0-alpha.9

Fixes the stuck hover state that could block card previews, the Home banner and rotation.

- Rapid pointer enter/leave now clears the correct queued card state. A preview cannot remain active after the pointer has left.
- Banner suggestions rotate every eight seconds while the pointer or a clicked control remains in the banner.
- Banner playback yields only when a card trailer actually plays, so a stale or unavailable card cannot permanently suppress it.
- Card previews recover when moving within the card after app focus changes. Focus inside the embedded player does not count as leaving Aster.
- Returning Home brings you back to the banner.
- Keeps muted preview loops, supported YouTube player API, bundled mpv and signed updates.

## Download

Use **AsterContentHub-Setup-0.1.0-alpha.9-x64.exe**. Alpha 3–8 installations can update automatically. Windows x64 and WebView2 are required; mpv is included. Your library and settings are preserved.

The installer is unsigned for Windows publisher/SmartScreen checks. Tauri update signatures verify installer authenticity and release version separately.

Use your own addons and authorized media sources. Player source and licenses: [mpv 0.42.0 corresponding source](https://github.com/TheKnightbane/AsterContenthub/releases/download/v0.1.0-alpha.2/mpv-0.42.0-corresponding-source.zip).

The banner cycles through the full loaded movie pool instead of stopping at six titles. A position counter and next/previous controls keep the larger list manageable. Banner playback starts without the previous intentional delay; trailer metadata for the next two titles is prefetched.
