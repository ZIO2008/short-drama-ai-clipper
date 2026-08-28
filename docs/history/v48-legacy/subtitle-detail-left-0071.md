# Prototype Migration Card: Subtitle Detail Left Panel (0071)

## Source

- Open Design project: `01b5725c-2688-4cbc-bc29-7432712449b3`
- Immutable source: `0071-d0ac7850-108e-42cb-a2ba-26550bce08ca.html`
- Repository fixture: `design/open-design/v2026-08-05-subtitle-detail-left-0071/short-drama-material-studio.html`
- SHA-256: `438A04722C321EE82338104390B9C56C51AACD57B85BF39AD24DA231C9980322`

## Scope

- Replace only the left-panel transport script in Subtitle Assets > View Frame.
- Preserve the 0070 three-source evidence layout, runtime data bridge, settings, import, delete, episode list, and task states.
- The 0071/0070 HTML diff contains only the transport control update: back, play, forward, current/total time, and the stopped-after-seek indicator.
- Script order is part of the fixture contract: run the transport script before the evidence script, otherwise the evidence script creates the legacy single-playback control and blocks the 0071 control.
- The approved view-frame layout fills the available subtitle workspace with a 16px modal inset. Its final left/right track is `1.28fr / .72fr`; the monitor is re-fitted through the prototype's own resize handler when the copied dialog opens.

## Static Acceptance

- Verify the static fixture in Electron at `1440 x 900` and `1280 x 720`.
- Verify no page-level scrolling; only the existing right evidence pane may scroll.
- Do not modify runtime behavior until the static fixture matches the 0071 source.

## Runtime Attachment

- The left transport controls operate only the current local preview video: play/pause and seek by minus or plus five seconds.
- The video is the single source of truth for current time, duration, the one playback head, and play state.
- Clicking a right-side subtitle or the timeline only seeks. It does not start playback, write an edit range, or persist any value.
