# Changelog

## v0.1.3

### Added
- Activity Log for stream detection, watch lifecycle, playback confirmation, reloads, claims, and errors.
- Watch History with session duration and stop reason.
- Last Checked, Last LIVE, Last Watched, Total Watch, and Last Error diagnostics.
- Watch states: IDLE, OPENING, WATCHING, and ERROR.
- Playback heartbeat reporting from the Twitch content script.
- Detection when playback is not confirmed within two minutes.
- Recovery when playback heartbeat becomes stale.
- Manual Check Now button.
- Configurable stream check interval: 30 seconds, 1, 2, 5, or 10 minutes.

### Changed
- Generic Twitch channel examples now use `twitch`.
- Stream monitoring diagnostics are persisted in `chrome.storage.local`.
- Watch duration avoids counting a long browser-closed period when a recent playback heartbeat is available.

### Notes
- `Claims` still records claim actions detected by the extension; it is not the Twitch Channel Points balance.
- `Watch Duration` represents the managed watch session and uses playback heartbeat data to improve accuracy.
