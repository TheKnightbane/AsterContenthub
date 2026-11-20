# Aster Content Hub 0.1.0-alpha.7

Windows alpha update: automatic Home banner trailers and more reliable card previews.

- Home suggestions rotate every eight seconds, pausing while the pointer or keyboard focus is on the banner.
- Featured Home titles automatically play a muted trailer after a short pause, keeping the title and Play button accessible.
- Banner previews yield while you browse cards and stop during movie playback, dialogs or navigation away from Home.
- Card previews recover when scrolling settles, instead of remaining cancelled until you leave the card.
- Removed/blocked trailers try the next provider video; loading and unavailable messages make preview status clear.
- Separate banner autoplay and card-hover switches in Settings → Home & display; reduced motion disables automatic previews.
- Includes compact-card preview sizing, fullscreen layout fixes, bundled mpv and signed updates.

## Download

Use **AsterContentHub-Setup-0.1.0-alpha.7-x64.exe**. Alpha 3–6 installations can receive this through automatic updates. Alpha 1/2 users need to install a current setup build once to enable the updater. Windows x64 and WebView2 are required; mpv is included. Saved libraries and settings are preserved.

The installer is unsigned for Windows publisher/SmartScreen checks. Tauri update signatures verify installer authenticity and release version separately.

Use your own addons and authorized media sources. Player source and licenses: [mpv 0.42.0 corresponding source](https://github.com/TheKnightbane/AsterContenthub/releases/download/v0.1.0-alpha.2/mpv-0.42.0-corresponding-source.zip).
