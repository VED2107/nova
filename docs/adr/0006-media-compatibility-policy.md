# ADR 0006: Media compatibility policy

- **Status:** Accepted (2026-10-15)

## Context

NOVA aims to play consumer and professional footage, including demanding camera recordings. Compatibility claims are easy to inflate: an extension being recognized proves nothing. Some formats also cannot be decoded with open components, or are not media at all.

## Decision

1. **Evidence before claims.** A format is *Verified* only when a sample plays in the real-engine harness (`tests/compat.rs`) and meets all of its checks. The checks cover playback start, detected codec, size, bit depth, chroma, alpha and HDR, seek accuracy, real-time advance and decoder drops. Synthetic profile samples verify codec support. Camera-branded formats stay *Expected* until real files from the camera are tested. Categories and current status: `docs/compat/README.md`.
2. **Content first.** File contents decide, not extensions. Known container signatures always reach the engine, and the engine itself probes contents. Extensions only refine the explanation when the content is not playable media (editing projects, camera RAW).
3. **One engine contract.** Additional decoders (for example camera RAW SDKs) can only be added as adapters behind `PlaybackBackend`. Each must pass the same contract tests and the compatibility harness. The existing libmpv path stays the default.
4. **No restricted components without review.** Proprietary SDKs, patented codec implementations and restricted builds are not bundled until their redistribution terms have been reviewed and recorded in an ADR. RAW SDK adapters, if added, will be optional and separately installed, with their own license notices. The engine build's license follows ADR 0003; FFmpeg and libmpv configurations are not assumed to share one license.
5. **Never pretend.**
   - **Editing projects:** rejected before decoding, with "open in <app> or export" guidance.
   - **Camera RAW:** NOVA lets the engine try. If it cannot decode, NOVA names the vendor SDK and the alternatives.
   - **Missing decoders:** if a stream's decoder is missing, the other streams keep playing, and a banner explains the problem.
   - **DRM-protected media:** out of scope.
6. **Diagnostics are engine-reported.** The inspector shows what the engine decoded: container, codec and profile, bit depth, chroma, alpha, color, HDR, and hardware or software decoder. It never infers these from the file name.

## Consequences

- Marketing and README text may only list formats in the *Verified* category, plus *Partial* with its limitation.
- Adding a format to the matrix means adding a sample (or a private-corpus entry) and running the harness.
- Camera RAW support depends on SDK license reviews; until then it is detection plus guidance only.
