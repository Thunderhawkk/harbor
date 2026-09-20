# Music, Sports and HDR work-in-progress checkpoint

Date: 2026-09-20. Branch: `codex/j-music-sports-hdr`.

This checkpoint preserves the current work; it is not approval to publish a release.

## Included

- J's selectively integrated Music and Sports features, their shared/native dependencies, assets, translations, and tests.
- J's HDR display-restoration work and the subsequent overlay startup/handshake changes: companion profile context, forwarded player navigation, listener ordering, readiness-gated display, attempt IDs, cleanup/recovery, and physical client-bound positioning.
- The existing beta 0.9.127 base and regression coverage. No version bump or release-note publication.

## Unresolved

- The user reported on September 19 that the HDR fallback warning still appears immediately in the test build. **HDR is not fixed or verified end-to-end.**
- Targeted failure diagnostics still need implementation. The precise failing startup step and actual HDR output color space have not been established. The warning has not been suppressed and the timeout limits have not been increased.
- The full suite has two known Music/Sports integration failures: missing translation coverage (62 Arabic keys reported first) and a legacy restriction test that expects Sports to be absent.
- Repository-wide formatting has substantial pre-existing failures; unrelated files were not reformatted for this checkpoint.
- Linux validation is blocked by the absent Linux Rust target/toolchain and WSL. No macOS validation was performed.

## Earlier verification

The September 18 Windows test executable built successfully. TypeScript and Windows Rust checking passed, as did 20 focused HDR tests. These tests do not establish real HDR output or mouse responsiveness. The earlier complete suite reported 2,235 passes, two failures, and 22 skips.

## Checkpoint validation

- September 20 TypeScript and locked Windows Rust checks passed. The two existing unused VapourSynth helper warnings remain.
- Complete suite rerun: 2,235 passed, two failed, 22 skipped, matching the failures described above.
- Scoped formatting/lint checks were run on the staged supported files. Eight imported assets retain formatting issues: the bundled stream-blocker manifest, rules and third-party script; Music and three Sports navigation animations; and Sports circuit data. These assets were not reformatted wholesale for a checkpoint.
- Repository-wide `pnpm run check` reports 4,025 formatting issues. No unrelated formatting cleanup was performed.
- Staged whitespace check passed after removing trailing whitespace from the imported ILT20 SVG asset.
- Linux build was attempted again and blocked by the missing `x86_64-unknown-linux-gnu` target. Existing frontend output was reused; no new release build was requested.

Temporary logs, executables, build outputs, local test configuration and personal application data are excluded. Separate modifications in the original `harbor-main` worktree are not part of this checkpoint. Commit only: no push, merge, signing or publication is requested.
