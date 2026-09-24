# Twitch Auto Watcher

這是一個 Chrome 擴充功能，可以自動監控指定的 Twitch 頻道；當頻道開台時，自動開啟直播分頁並在背景持續觀看，同時自動領取可用的 Channel Points 頻道點數獎勵。

> 本專案為非官方專案，與 Twitch 無隸屬、合作或背書關係。

## 功能

- 自動監控指定 Twitch 頻道
- 可自行選擇直播檢查間隔：30 秒、1、2、5 或 10 分鐘
- 透過 Twitch API 判斷 LIVE / OFFLINE
- Auto Watch ON / OFF
- Auto Claim ON / OFF
- 開台時自動開啟指定直播
- 自動將直播分頁設為釘選
- 自動將直播分頁靜音
- 頻道下播後自動關閉由擴充功能建立的直播分頁
- 防止 Chrome 自動丟棄擴充功能管理的直播分頁
- 偵測分頁是否被 discarded / frozen，必要時自動重新載入
- 自動偵測並領取可用的 Channel Points Bonus
- 在本機記錄領取次數與最後領取時間
- 關閉並重新開啟 Chrome 後保留監控頻道
- 關閉並重新開啟 Chrome 後恢復已連線的 Twitch 帳號
- 定期驗證 Twitch Access Token
- Access Token 失效時使用 Refresh Token 自動更新
- Popup 顯示帳號、直播狀態、觀看狀態、觀看頻道、觀看時間、最後檢查時間、領取次數與最後領取時間
- Activity Log 記錄 LIVE 偵測、觀看開始/結束、播放器確認、分頁恢復、Claim 與錯誤
- Watch History 保存最近觀看場次、觀看時長與停止原因
- 顯示 Last LIVE、Last Watched、Total Watch 與 Last Error 診斷資料
- 可使用 **Check Now** 手動立即檢查直播

## 使用需求

- Google Chrome 或支援 Manifest V3 的 Chromium 瀏覽器
- Twitch 帳號
- Twitch Developer Application
- Chrome 必須保持執行，擴充功能才能持續監控與自動觀看

## 安裝方式

1. 下載或 Clone 此 Repository。

```bash
git clone https://github.com/kent696/Twitch-Auto-Watcher.git
```

2. 開啟 Chrome：

```text
chrome://extensions
```

3. 開啟右上角的 **開發人員模式**。

4. 點擊 **載入未封裝項目**。

5. 選擇包含 `manifest.json` 的專案資料夾。

## Twitch Developer 設定

此 Extension 使用 Twitch Developer Application 進行 Twitch 帳號授權。

1. 前往 Twitch Developer Console。
2. 建立新的 Application。
3. Application 名稱需要使用未被註冊的唯一名稱。
4. Client Type 選擇 **Public / 公開**。
5. 複製 Twitch 提供的 **Client ID**。
6. 打開：

```text
src/background/background.js
```

7. 修改：

```javascript
const TWITCH_CLIENT_ID = "YOUR_CLIENT_ID_HERE";
```

請不要把 Twitch Client Secret、Access Token 或 Refresh Token 寫進原始碼。

OAuth Token 會儲存在使用者自己的：

```text
chrome.storage.local
```

## 使用方法

1. 打開擴充功能 Popup。
2. 連接 Twitch 帳號。
3. 輸入要監控的 Twitch 頻道 Login Name。

例如 Twitch 網址：

```text
https://www.twitch.tv/twitch
```

就輸入：

```text
twitch
```

如果 Twitch 顯示名稱與網址名稱不同，請使用網址最後面的 Login Name，而不是顯示名稱。

4. 點擊 **Save Channel**。

之後 Extension 就會自動監控。

### 頻道開台時

流程：

```text
檢查 Twitch API
      ↓
偵測到 LIVE
      ↓
自動開啟 Twitch
      ↓
釘選分頁
      ↓
分頁靜音
      ↓
避免 Chrome 自動丟棄
      ↓
監控 Channel Points Bonus
      ↓
自動領取可用 Bonus
```

### 頻道下播時

Extension 只會關閉由自己建立並管理的直播分頁。

不會刻意關閉使用者自己手動開啟的其他 Twitch 分頁。

## Popup 狀態

目前 Popup 可以顯示：

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

## 專案結構

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

## 運作方式

### Background Service Worker

`background.js` 負責：

- Twitch OAuth 授權
- Access Token 驗證
- Refresh Token 更新
- 定期檢查直播狀態
- 自動建立 Twitch 觀看分頁
- 下播後清理觀看分頁
- 分頁健康狀態檢查
- 本機統計資料

### Content Script

`content.js` 會在 Twitch 頁面中：

- 監控 Twitch DOM
- 偵測 Channel Points Bonus 按鈕
- 自動點擊可領取的 Bonus
- 將領取事件回報給 Background Service Worker

### Popup

Popup 用於：

- 連接 Twitch 帳號
- 設定監控頻道
- 查看 LIVE / OFFLINE
- 查看目前正在觀看的頻道
- 查看 Channel Points 領取統計

## 資料儲存

Extension 使用：

```text
chrome.storage.local
```

儲存資料，例如：

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

本專案目前沒有自己的後端伺服器用來保存上述資料。

## 注意事項

- Chrome 必須保持執行，Extension 才能繼續監控直播。
- Manifest V3 的 Background Service Worker 閒置時可能會休眠，因此本專案使用 `chrome.alarms` 進行定期喚醒與檢查。
- Chrome 的記憶體管理可能會停用背景分頁，因此 Extension 會將自動觀看分頁設為不可自動丟棄，並定期檢查分頁狀態。
- Twitch 網頁 DOM 或 API 未來可能改版，因此自動領取功能可能需要更新 selector 或相關邏輯。
- Channel Points 的實際取得與獎勵規則由 Twitch 控制。

## Roadmap

預計加入：

- 多頻道監控
- 更完整的 Channel Points 統計
- 通知功能
- 匯出 Activity / Watch History
- GitHub Release 安裝包


## 版本紀錄

### v0.1.3

- 新增 Activity Log
- 新增 Watch History 與觀看時長統計
- 新增 Last Checked、Last LIVE、Last Watched、Total Watch、Last Error
- 新增 WATCHING / OPENING / IDLE / ERROR 觀看狀態
- 新增手動 **Check Now**
- 新增自訂直播偵測間隔
- Content Script 新增播放狀態 heartbeat
- 強化 managed tab 遺失、discarded、frozen 的診斷紀錄

## 開發狀態

目前開發版本：

```text
v0.1.3
```

專案仍在持續開發中。

## 安全性

請勿將以下資料提交到 GitHub：

```text
Client Secret
Access Token
Refresh Token
OAuth 授權資料
```

Twitch Client ID 屬於應用程式識別資訊，可以存在 Public Client 的前端程式中。

## 免責聲明

本專案主要供學習與個人用途使用。

使用者需自行確認使用方式符合 Twitch 最新的 Terms of Service、Community Guidelines、Developer Agreement / Policies 與其他適用規則。

## License

目前尚未選擇 License。

正式公開散布前，可以考慮加入 MIT、Apache-2.0 或其他適合此專案的開源授權。