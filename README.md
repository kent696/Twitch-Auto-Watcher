# Twitch Auto Watcher

A Chrome extension that automatically monitors a Twitch channel, opens the stream when it goes live, keeps the stream tab active in the background, and automatically claims available Channel Points bonuses.

> This is an unofficial project and is not affiliated with or endorsed by Twitch.

## Features

- Monitor a Twitch channel automatically
- Choose a stream check interval: 30 seconds, 1, 2, 5, or 10 minutes
- Detect LIVE / OFFLINE status through the Twitch API
- Auto Watch ON / OFF
- Auto Claim ON / OFF
- Automatically open the configured stream when it goes live
- Open the stream in a pinned and muted tab
- Automatically close the extension-managed stream tab when the channel goes offline
- Prevent the managed stream tab from being automatically discarded by Chrome
- Detect discarded / frozen tabs and reload them when necessary
- Automatically claim available Channel Points bonus rewards
- Store claim statistics locally
- Restore the configured channel after restarting Chrome
- Restore the connected Twitch account after restarting Chrome
- Validate the Twitch access token periodically
- Automatically refresh expired access tokens using the stored refresh token
- Display account, stream status, watch state, watched channel, watch duration, last checked time, claim count, and last claim time in the popup
- Keep an Activity Log for LIVE detection, watch sessions, playback confirmation, reloads, claims, and errors
- Keep recent Watch History with session duration and stop reason
- Show Last LIVE, Last Watched, Total Watch, and Last Error diagnostics
- Manually trigger a stream check with **Check Now**

## Requirements

- Google Chrome or another Chromium-based browser with Manifest V3 support
- A Twitch account
- A Twitch Developer Application
- Chrome must remain running for automatic monitoring and watching to continue

## Installation

1. Download or clone this repository.

```bash
git clone https://github.com/kent696/Twitch-Auto-Watcher.git
```

2. Open Chrome and go to:

```text
chrome://extensions
```

3. Enable **Developer mode**.

4. Click **Load unpacked**.

5. Select the project folder containing `manifest.json`.

## Twitch Developer Setup

This extension uses a Twitch Developer Application for authentication.

1. Open the Twitch Developer Console.
2. Create a new application.
3. Use a unique application name.
4. Set the client type to **Public**.
5. Copy the generated **Client ID**.
6. Open:

```text
src/background/background.js
```

7. Replace the Client ID value:

```javascript
const TWITCH_CLIENT_ID = "YOUR_CLIENT_ID_HERE";
```

Do not put a Twitch Client Secret, access token, or refresh token in the source code.

The extension stores OAuth tokens in `chrome.storage.local` on the local browser.

## Usage

1. Open the extension popup.
2. Connect your Twitch account.
3. Enter the Twitch channel login name.

For example, if the channel URL is:

```text
https://www.twitch.tv/twitch
```

enter:

```text
twitch
```

Do not use the display name shown on Twitch if it differs from the URL login name.

4. Click **Save Channel**.

The extension will then monitor the channel automatically.

### When the channel is LIVE

The extension will:

```text
Check Twitch API
      ↓
Channel is LIVE
      ↓
Open Twitch stream
      ↓
Pin the tab
      ↓
Mute the tab
      ↓
Keep the tab from being auto-discarded
      ↓
Monitor Channel Points bonus UI
      ↓
Claim available bonuses
```

### When the channel is OFFLINE

The extension will close only the stream tab that it created and managed.

It will not intentionally close unrelated Twitch tabs opened manually by the user.

## Popup Status

The popup currently displays information such as:

```text
Twitch Account
Connected: username

Channel
twitch

Stream Status
LIVE / OFFLINE

Watching
twitch

Claims
3

Last Claim
23:45
```

## Project Structure

```text
Twitch-Auto-Watcher/
├─ manifest.json
├─ README.md
├─ README.zh-TW.md
└─ src/
   ├─ background/
   │  └─ background.js
   ├─ content/
   │  └─ content.js
   └─ popup/
      ├─ popup.html
      ├─ popup.css
      └─ popup.js
```

## How It Works

### Background Service Worker

`background.js` handles:

- Twitch OAuth authentication
- Access token validation
- Refresh token handling
- Stream status polling
- Automatic stream tab creation
- Stream tab cleanup
- Tab health checks
- Local statistics

### Content Script

`content.js` runs on Twitch pages and:

- Observes Twitch DOM changes
- Detects available Channel Points bonus claim controls
- Claims available bonuses
- Reports successful claim actions to the background service worker

### Popup

The popup is used to:

- Connect a Twitch account
- Configure the monitored channel
- View stream status
- View the currently watched channel
- View claim statistics

## Data Storage

The extension stores settings and runtime information using:

```text
chrome.storage.local
```

Examples include:

```text
channel
twitchAccessToken
twitchRefreshToken
twitchLogin
twitchUserId
streamStatus
streamCheckedAt
lastLiveDetectedAt
watchState
watchingChannel
watchSession
watchHistory
lastWatchedAt
totalWatchDurationMs
activityLog
lastError
claimStats
totalClaimCount
lastClaimAt
streamCheckInterval
```

No server operated by this project is used to store this data.

## Important Notes

- Chrome must remain running for the extension to continue monitoring streams.
- Manifest V3 background service workers may sleep when idle. The extension uses `chrome.alarms` so Chrome can wake the service worker for scheduled checks.
- Stream tabs may be affected by browser memory management. The extension marks its managed stream tab as non-auto-discardable and performs health checks.
- Twitch may change its website structure or APIs at any time. DOM selectors or API behavior may therefore require future updates.
- Channel Points availability and earning behavior are controlled by Twitch.

## Roadmap

Planned improvements include:

- Multiple channel monitoring
- Improved Channel Points statistics
- Notifications
- Exportable activity / watch history
- GitHub release packaging


## Version History

### v0.1.3

- Added Activity Log
- Added Watch History and duration tracking
- Added Last Checked, Last LIVE, Last Watched, Total Watch, and Last Error
- Added WATCHING / OPENING / IDLE / ERROR watch states
- Added manual **Check Now**
- Added configurable stream check intervals
- Added playback heartbeat reporting from the Twitch content script
- Added better diagnostics for missing, discarded, and frozen managed tabs

## Development Status

Current development version:

```text
v0.1.3
```

The project is still under active development.

## Security

Never commit any of the following to GitHub:

```text
Client Secret
Access Token
Refresh Token
OAuth authorization data
```

The Twitch Client ID is an application identifier and can be included in a public client application.

## Disclaimer

This project is provided for educational and personal use.

Users are responsible for ensuring that their use of the extension complies with Twitch's current Terms of Service, Community Guidelines, developer policies, and any applicable rules.

## License

A license has not yet been selected.

Before distributing the project broadly, consider adding a license such as MIT, Apache-2.0, or another license appropriate for the project.
