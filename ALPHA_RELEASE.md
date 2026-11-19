# Aster Content Hub 0.1.0-alpha.3

Windows alpha update: automatic signed updates from GitHub.

- Checks at launch and every six hours, with background download.
- Applies updates after a minute of inactivity; playback, open dialogs and editing postpone the restart.
- Later and Restart to update controls, plus Settings → About → Check for updates / Automatic updates.
- Invalid or modified update packages are rejected.
- Includes mpv and its runtime libraries, fullscreen seek/volume controls, audio/subtitle selection and the existing profile sync features.

## Install once to enable automatic updates

Close earlier Aster windows and install **AsterContentHub-Setup-0.1.0-alpha.3-x64.exe**. Alpha 1/2 cannot acquire the updater automatically; this one-time installation enables future signed updates. Library and profile data stay in place. Portable/development previews require manual installation. Windows x64 and WebView2 are required. The installer is still unsigned for Windows publisher/SmartScreen checks; Tauri update signatures verify update authenticity separately.

No separate mpv installation is needed. Use your own addons and authorized media sources. Player source and licenses: [mpv 0.42.0 corresponding source](https://github.com/TheKnightbane/AsterContenthub/releases/download/v0.1.0-alpha.2/mpv-0.42.0-corresponding-source.zip).

Automatic updates are installed from signed versioned releases produced by the release workflow; ordinary source commits do not trigger an app installation.
