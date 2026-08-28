# Prototype Migration Card: Tencent Cloud ASR credentials

## Source and boundary

- Static source: `design/open-design/v2026-08-05-asr-tencent-credentials/short-drama-material-studio.html`
- SHA-256: `DF149D4E0DBD641CBE1F5A92211B1991A864F2C39030299708D972675765475F`
- Tool entry: Settings -> Capability providers -> ASR subtitle recognition.
- Viewport: 1440 x 900, system scaling 100%, app scaling 100%.
- Migration type: in-screen state migration. The established settings shell, candidate list, draft panel, and scrolling ownership remain unchanged.

## Target states

| State | Preconditions | Expected result |
| --- | --- | --- |
| Default ASR provider | Any non-Tencent provider | Existing single `key` input remains visible. |
| Tencent Cloud ASR | `supplier-asr-vendor` is `Tencent Cloud ASR` | Only `SecretId` and `SecretKey` inputs replace the generic key input. |
| Switch away from Tencent | Provider changes to any other value | Generic key input returns; Tencent inputs are hidden without losing unsaved values. |

## Binding boundary

- The static prototype owns the input structure, labels, placement, and show/hide state.
- `ProviderSettingsPrototypeBridge` only reads the two inputs, validates that both are present on first save, and saves one JSON credential record through the existing secure storage path.
- No Tencent signature request, API connectivity test, cloud ASR execution, or changes to any other capability are included.
