# Alpha verification — 0.1.0-alpha.2

Verified on Windows, November 19, 2026.

- 31 core tests passed: persistence, addon protocol/search, source ranking, settings/backups, episode matching/order, tracker queues and isolated local profiles.
- 43 standard Playwright checks passed. The optional live pairing check is skipped in the standard suite and was run separately successfully.
- Live UI check: two independent browser contexts created device sessions, paired with a one-use code, transferred a library item and watch position, and synchronized a favorite change back to the first device.
- Live backend checks passed for anonymous device sessions, owner upload, unpaired read/write isolation, membership-forgery rejection, pairing issuer membership, one-use 128-bit pairing codes, paired download, reverse progress sync, pairing-table secrecy and atomic concurrent redemption.
- 16 native tests passed, including installed-mpv decoding/progress/controls, private media-server HTTP/HLS, safe native command arguments and a real Windows Credential Manager roundtrip larger than a single credential. The fixture credential was removed afterward.
- TypeScript/Vite production builds passed. Profile sync sessions stay in Windows Credential Manager; public backend configuration is separate from device credentials.
- Browser screenshots of the profile picker, paired sync, next-episode controls, seasons and complete colour palettes were visually reviewed.

Existing library data remains under its original storage key in the default profile. New profiles use separate collection/settings/progress keys. Addons, Real-Debrid and other provider credentials are retained. No personal streaming credential is included in the source or release artifacts.

## Practical limits

Browser mpv checks simulate native events; real installed mpv decoding and IPC are covered by the native tests. Alternate track selection uses simulated multi-track fixtures plus native IPC because the included trailer has one audio track and no subtitles. Supabase pairing and progress synchronization were verified live with isolated test profiles. Hosted streaming providers use local/fixture checks; every external personal service account has not been verified live. Native iOS/tvOS apps and external Infuse playback on an Apple device are outside this alpha.

The earlier SMTP experiment is not used for profiles. Resend accepted delivery to its registered test address, but the user did not receive the relay email. The app now uses device sessions and pairing without email. No SMTP secret or sign-in code is part of this repository.

## Packaged Windows alpha

The final 0.1.0-alpha.1 release build and NSIS x64 installer completed successfully. The packaged executable launched as a responsive Aster Content Hub window. Download artifacts have SHA-256 checksums in the release. Native installed-mpv tests, the full browser suite and live two-device pairing checks passed before packaging.

## Alpha 2 — bundled player and fullscreen controls

The official mpv 0.42.0 x64 Clang archive is pinned by SHA-256 and packaged with its Vulkan runtime, license notices and corresponding-source download. Player discovery prefers Aster's resource directory; native tests assert that the bundled executable is used even when a system mpv is installed. All 31 core tests, 7 embedded-player browser tests and 16 native tests passed, including bundled decoding, IPC and arrow-key volume control. A new fullscreen regression checks seeking, volume, idle auto-hide even over the bottom bar, and native surface bounds. The packaged app was launched and its running mpv path was confirmed under the package's player directory; fullscreen controls were visually observed. Mouse movement over the native video surface now reaches Aster through a native cursor observer, with keyboard seeking/volume/mute bindings available in both native video and web controls.

Fullscreen chrome hides after the configured inactivity timeout, including when the pointer rests over a control. Active slider drags and open source/track panels keep controls available. Native cursor observations use screen coordinates, and Lua no longer treats layout-induced mouse-pos changes as physical activity.

The final browser suite passed 44 tests (the optional live pairing test was skipped; pairing was verified live for Alpha 1). The bundled mpv executable also passed decoding and IPC/keyboard tests with its app-local Microsoft C++ runtime DLLs present. The NSIS resource manifest includes mpv, Vulkan, runtime DLLs and redistribution notices.

## Alpha 3 — signed automatic updates

33 core/release tests passed. The complete browser suite passed 48 tests with the optional live profile test skipped; all 5 focused updater tests then passed, including the added opt-out persistence case. Coverage includes background downloads, idle application, playback deferral, Later, signature errors, retries, portable eligibility and manual checks. All 16 existing native checks passed with the updater plugins enabled. A real signed NSIS installer passed cryptographic signature and signed-version validation, and changing an installer byte caused verification to fail.

The updater uses a fixed HTTPS GitHub feed and embedded public key with signed-version enforcement. Private signing credentials are excluded from source and stored as Actions secrets; the local encrypted key and Windows-protected password are outside the project repository. Version ordering prevents late older release jobs from moving the feed backwards.

Browser update installation tests simulate native updater IPC; the real installer signature is verified independently. A complete in-place installation between two updater-enabled public releases has not been performed for this first updater release. Alpha 1/2 users require one manual installation. Portable/development previews do not auto-install updates.
