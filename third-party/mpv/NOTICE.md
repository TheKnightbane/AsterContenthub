# Bundled mpv 0.42.0 — Windows x64

Copyright © 2000–2026 mpv/MPlayer/mplayer2 projects and the respective authors of the included libraries.

Aster distributes the unmodified official Windows x64 Clang player as a separate executable, together with its `vulkan-1.dll` runtime. Aster communicates through mpv's public JSON IPC interface. The player is free software, supplied without warranty; its original license terms and the component copyright notices are included in this directory. mpv's GPL and LGPL texts describe the applicable options; this GPL-enabled player includes FFmpeg configured with GPL components.

Binary: https://github.com/mpv-player/mpv/releases/tag/v0.42.0

Original archive: `mpv-v0.42.0-x86_64-pc-windows-msvc.zip`

SHA-256: `8dd69cbab079086765fa5d873c09513b2834b85d146c1301718a757e8c0595ef`

Source access: download **mpv-0.42.0-corresponding-source.zip** beside the Aster Windows downloads at https://github.com/TheKnightbane/AsterContenthub/releases/tag/v0.1.0-alpha.2 . This includes source packages, Meson patches and the upstream build log/recipe. `SOURCES.json` lists the upstream source locations and archive checksums. Some packages in the original Meson dependency graph are optional and are retained for build reproduction.

Upstream build provenance: https://github.com/mpv-player/mpv/actions/runs/41936479105/job/126946096696

Build script: `ci/build-win32.ps1` in the mpv source archive. Aster's `scripts/Prepare-Player.ps1` verifies the original binary download and copies these notices alongside the runtime. The portable Aster package must retain its entire `player` directory.

Microsoft Visual C++ runtime DLLs in this directory are unmodified redistributable code from Visual Studio C++ Build Tools, copyright Microsoft Corporation. They are deployed locally alongside mpv so no separate runtime installation is needed. They retain Microsoft's license terms; they are not licensed under the mpv GPL. Redistribution reference: https://learn.microsoft.com/visualstudio/releases/2022/redistribution and https://visualstudio.microsoft.com/license-terms/ .
