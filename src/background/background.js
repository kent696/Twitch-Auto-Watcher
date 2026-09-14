// ========================================
// Twitch Points Watcher - Background
// ========================================


// 每 2 分鐘檢查直播
const STREAM_CHECK_ALARM = "streamCheck";

// Twitch 登入授權輪詢
const TWITCH_AUTH_ALARM = "twitchAuthPoll";

// Twitch Token 每小時驗證
const TWITCH_VALIDATE_ALARM = "twitchTokenValidate";

// Extension 自動建立的觀看分頁 ID
const WATCH_TAB_KEY = "watchTabId";


// ========================================
// 自動化功能設定
// ========================================

async function getAutomationSettings() {
    const data = await chrome.storage.local.get([
        "autoWatchEnabled",
        "autoClaimEnabled"
    ]);

    return {
        // 舊版使用者沒有這兩個欄位時，預設維持啟用。
        autoWatchEnabled:
            data.autoWatchEnabled !== false,

        autoClaimEnabled:
            data.autoClaimEnabled !== false
    };
}


async function ensureAutomationDefaults() {
    const data = await chrome.storage.local.get([
        "autoWatchEnabled",
        "autoClaimEnabled"
    ]);

    const updates = {};

    if (typeof data.autoWatchEnabled !== "boolean") {
        updates.autoWatchEnabled = true;
    }

    if (typeof data.autoClaimEnabled !== "boolean") {
        updates.autoClaimEnabled = true;
    }

    if (Object.keys(updates).length > 0) {
        await chrome.storage.local.set(updates);
    }
}


// ========================================
// Twitch Client ID
// ========================================

const TWITCH_CLIENT_ID = "kdpb6dpojgzimq8zmy3io63lenw5tc";


// 目前查詢直播狀態不需要額外權限 Scope
const TWITCH_SCOPES = "";



// ========================================
// 建立直播檢查排程
// ========================================

function createStreamCheckAlarm() {

    chrome.alarms.get(
        STREAM_CHECK_ALARM,
        (alarm) => {

            if (alarm) {
                return;
            }

            chrome.alarms.create(
                STREAM_CHECK_ALARM,
                {
                    periodInMinutes: 2
                }
            );

            console.log(
                "[Twitch Points Watcher]",
                "Stream check alarm created."
            );
        }
    );
}



// ========================================
// 建立 Twitch Token 驗證排程
// ========================================

function createTokenValidationAlarm() {

    chrome.alarms.get(
        TWITCH_VALIDATE_ALARM,
        (alarm) => {

            if (alarm) {
                return;
            }

            chrome.alarms.create(
                TWITCH_VALIDATE_ALARM,
                {
                    periodInMinutes: 60
                }
            );

            console.log(
                "[Twitch Auth]",
                "Hourly token validation alarm created."
            );
        }
    );
}



// ========================================
// Extension 安裝 / 更新
// ========================================

chrome.runtime.onInstalled.addListener(() => {

    console.log(
        "[Twitch Points Watcher]",
        "Extension installed."
    );

    createStreamCheckAlarm();
    createTokenValidationAlarm();

    ensureAutomationDefaults()
        .then(() => restoreTwitchSessionAndCheckStream())
        .catch((error) => {
            console.error(
                "[Twitch Auth]",
                "Unable to restore Twitch session after install/update.",
                error
            );
        });
});



// ========================================
// Chrome 啟動
// ========================================

chrome.runtime.onStartup.addListener(() => {

    console.log(
        "[Twitch Points Watcher]",
        "Chrome started."
    );

    createStreamCheckAlarm();
    createTokenValidationAlarm();

    ensureAutomationDefaults()
        .then(() => restoreTwitchSessionAndCheckStream())
        .catch((error) => {
            console.error(
                "[Twitch Auth]",
                "Unable to restore Twitch session on startup.",
                error
            );
        });
});



// Service Worker 被喚醒時確認 Alarm 存在
createStreamCheckAlarm();
createTokenValidationAlarm();
ensureAutomationDefaults()
    .catch((error) => {
        console.error(
            "[Twitch Points Watcher]",
            "Unable to initialize automation defaults.",
            error
        );
    });



// ========================================
// Twitch Device Authorization
// ========================================

async function startTwitchLogin() {

    console.log(
        "[Twitch Auth]",
        "Starting Twitch authorization..."
    );


    const body = new URLSearchParams();

    body.set(
        "client_id",
        TWITCH_CLIENT_ID
    );

    body.set(
        "scopes",
        TWITCH_SCOPES
    );


    const response = await fetch(
        "https://id.twitch.tv/oauth2/device",
        {
            method: "POST",

            headers: {
                "Content-Type":
                    "application/x-www-form-urlencoded"
            },

            body: body.toString()
        }
    );


    const data = await response.json();


    if (!response.ok) {

        console.error(
            "[Twitch Auth]",
            "Device authorization failed:",
            data
        );

        throw new Error(
            data.message ||
            "Unable to start Twitch authorization."
        );
    }


    console.log(
        "[Twitch Auth]",
        "Device code received."
    );


    console.log(
        "[Twitch Auth]",
        "User code:",
        data.user_code
    );


    // 儲存目前正在進行的授權
    await chrome.storage.local.set({

        twitchAuthPending: {

            deviceCode:
                data.device_code,

            userCode:
                data.user_code,

            verificationUri:
                data.verification_uri,

            expiresAt:
                Date.now() +
                (
                    data.expires_in *
                    1000
                )
        }

    });


    // 自動開啟 Twitch 授權頁面
    await chrome.tabs.create({

        url: data.verification_uri

    });


    // 先清掉舊的輪詢
    await chrome.alarms.clear(
        TWITCH_AUTH_ALARM
    );


    // Chrome Alarm 最快以 30 秒為單位
    chrome.alarms.create(
        TWITCH_AUTH_ALARM,
        {
            delayInMinutes: 0.5,
            periodInMinutes: 0.5
        }
    );


    console.log(
        "[Twitch Auth]",
        "Waiting for user authorization..."
    );


    return {
        success: true,
        userCode: data.user_code
    };
}



// ========================================
// 輪詢 Twitch 授權結果
// ========================================

async function pollTwitchAuthorization() {

    const result =
        await chrome.storage.local.get(
            [
                "twitchAuthPending"
            ]
        );


    const pending =
        result.twitchAuthPending;


    // 沒有正在進行的授權
    if (!pending) {

        await chrome.alarms.clear(
            TWITCH_AUTH_ALARM
        );

        return;
    }


    // Device Code 已過期
    if (
        Date.now() >
        pending.expiresAt
    ) {

        console.log(
            "[Twitch Auth]",
            "Authorization expired."
        );

        await clearTwitchAuthPending();

        return;
    }


    console.log(
        "[Twitch Auth]",
        "Checking authorization..."
    );


    const body =
        new URLSearchParams();


    body.set(
        "client_id",
        TWITCH_CLIENT_ID
    );


    body.set(
        "device_code",
        pending.deviceCode
    );


    body.set(
        "grant_type",
        "urn:ietf:params:oauth:grant-type:device_code"
    );


    body.set(
        "scopes",
        TWITCH_SCOPES
    );


    const response =
        await fetch(
            "https://id.twitch.tv/oauth2/token",
            {
                method: "POST",

                headers: {
                    "Content-Type":
                        "application/x-www-form-urlencoded"
                },

                body: body.toString()
            }
        );


    const data =
        await response.json();


    // ==============================
    // 使用者還沒完成授權
    // ==============================

    if (!response.ok) {

        const errorMessage =
            (
                data.message ||
                data.error ||
                ""
            ).toLowerCase();


        if (
            errorMessage.includes(
                "authorization_pending"
            )
        ) {

            console.log(
                "[Twitch Auth]",
                "Waiting for user..."
            );

            return;
        }


        // 使用者拒絕授權
        if (
            errorMessage.includes(
                "access_denied"
            )
        ) {

            console.log(
                "[Twitch Auth]",
                "Authorization denied."
            );

            await clearTwitchAuthPending();

            return;
        }


        // Device Code 過期
        if (
            errorMessage.includes(
                "expired"
            )
        ) {

            console.log(
                "[Twitch Auth]",
                "Device code expired."
            );

            await clearTwitchAuthPending();

            return;
        }


        console.error(
            "[Twitch Auth]",
            "Authorization error:",
            data
        );

        return;
    }


    // ==============================
    // 成功取得 Token
    // ==============================

    console.log(
        "[Twitch Auth]",
        "Authorization successful."
    );


    await saveTwitchToken(
        data
    );
}



// ========================================
// 儲存 Twitch Token
// ========================================

async function saveTwitchToken(
    tokenData
) {

    const accessToken =
        tokenData.access_token;


    // 驗證 Token + 取得 Twitch 帳號
    const response =
        await fetch(
            "https://id.twitch.tv/oauth2/validate",
            {
                headers: {

                    Authorization:
                        `OAuth ${accessToken}`

                }
            }
        );


    if (!response.ok) {

        throw new Error(
            "Unable to validate Twitch token."
        );
    }


    const account =
        await response.json();


    // 儲存 Token 與帳號資訊
    await chrome.storage.local.set({

        twitchAccessToken:
            accessToken,

        twitchRefreshToken:
            tokenData.refresh_token ||
            null,

        twitchTokenExpiresAt:
            Date.now() +
            (
                tokenData.expires_in *
                1000
            ),

        twitchLogin:
            account.login ||
            null,

        twitchUserId:
            account.user_id ||
            null,

        twitchScopes:
            account.scopes ||
            []

    });


    // 清除授權暫存
    await clearTwitchAuthPending();


    console.log(
        "[Twitch Auth]",
        "Connected successfully."
    );


    console.log(
        "[Twitch Auth]",
        "Account:",
        account.login
    );

}



// ========================================
// 清除 Twitch 授權暫存
// ========================================

async function clearTwitchAuthPending() {

    await chrome.storage.local.remove(
        "twitchAuthPending"
    );


    await chrome.alarms.clear(
        TWITCH_AUTH_ALARM
    );
}



// ========================================
// Twitch Session 驗證 / Refresh
// ========================================

let tokenRefreshPromise = null;


async function validateTwitchAccessToken(accessToken) {

    if (!accessToken) {
        return null;
    }

    const response =
        await fetch(
            "https://id.twitch.tv/oauth2/validate",
            {
                method: "GET",
                headers: {
                    Authorization:
                        `OAuth ${accessToken}`
                }
            }
        );

    if (!response.ok) {
        return null;
    }

    const account =
        await response.json();

    if (
        account.client_id &&
        account.client_id !== TWITCH_CLIENT_ID
    ) {

        console.error(
            "[Twitch Auth]",
            "Stored token belongs to a different Client ID."
        );

        return null;
    }

    return account;
}


async function clearTwitchSession() {

    await chrome.storage.local.remove([
        "twitchAccessToken",
        "twitchRefreshToken",
        "twitchTokenExpiresAt",
        "twitchLogin",
        "twitchUserId",
        "twitchScopes"
    ]);

    await chrome.storage.local.set({
        streamStatus: "not_connected",
        streamCheckedAt: Date.now()
    });

    await closeWatchTab();
}


async function refreshTwitchAccessToken() {

    if (tokenRefreshPromise) {
        return tokenRefreshPromise;
    }

    tokenRefreshPromise =
        (async () => {

            const stored =
                await chrome.storage.local.get([
                    "twitchRefreshToken"
                ]);

            const refreshToken =
                stored.twitchRefreshToken;

            if (!refreshToken) {

                console.warn(
                    "[Twitch Auth]",
                    "No refresh token is stored."
                );

                return null;
            }

            console.log(
                "[Twitch Auth]",
                "Refreshing Twitch access token..."
            );

            const body =
                new URLSearchParams();

            body.set(
                "client_id",
                TWITCH_CLIENT_ID
            );

            body.set(
                "grant_type",
                "refresh_token"
            );

            body.set(
                "refresh_token",
                refreshToken
            );

            const response =
                await fetch(
                    "https://id.twitch.tv/oauth2/token",
                    {
                        method: "POST",
                        headers: {
                            "Content-Type":
                                "application/x-www-form-urlencoded"
                        },
                        body:
                            body.toString()
                    }
                );

            const data =
                await response.json();

            if (!response.ok) {

                console.error(
                    "[Twitch Auth]",
                    "Unable to refresh Twitch token.",
                    data
                );

                await clearTwitchSession();

                return null;
            }

            const accessToken =
                data.access_token;

            const account =
                await validateTwitchAccessToken(
                    accessToken
                );

            if (!account) {

                console.error(
                    "[Twitch Auth]",
                    "The refreshed Twitch token could not be validated."
                );

                await clearTwitchSession();

                return null;
            }

            // Public Device Code refresh tokens are rotated.
            // Always save the newest refresh token returned by Twitch.
            await chrome.storage.local.set({

                twitchAccessToken:
                    accessToken,

                twitchRefreshToken:
                    data.refresh_token ||
                    refreshToken,

                twitchTokenExpiresAt:
                    Date.now() +
                    (
                        Number(data.expires_in || 0) *
                        1000
                    ),

                twitchLogin:
                    account.login ||
                    null,

                twitchUserId:
                    account.user_id ||
                    null,

                twitchScopes:
                    account.scopes ||
                    []

            });

            console.log(
                "[Twitch Auth]",
                "Twitch access token refreshed."
            );

            console.log(
                "[Twitch Auth]",
                "Account:",
                account.login
            );

            return accessToken;
        })();

    try {
        return await tokenRefreshPromise;
    }
    finally {
        tokenRefreshPromise = null;
    }
}


async function validateStoredTwitchSession() {

    const stored =
        await chrome.storage.local.get([
            "twitchAccessToken",
            "twitchRefreshToken",
            "twitchLogin"
        ]);

    if (!stored.twitchAccessToken) {

        if (stored.twitchRefreshToken) {

            console.log(
                "[Twitch Auth]",
                "Access token missing. Trying stored refresh token."
            );

            return Boolean(
                await refreshTwitchAccessToken()
            );
        }

        console.log(
            "[Twitch Auth]",
            "No saved Twitch session."
        );

        return false;
    }

    const account =
        await validateTwitchAccessToken(
            stored.twitchAccessToken
        );

    if (account) {

        await chrome.storage.local.set({

            twitchLogin:
                account.login ||
                stored.twitchLogin ||
                null,

            twitchUserId:
                account.user_id ||
                null,

            twitchScopes:
                account.scopes ||
                [],

            twitchTokenExpiresAt:
                Date.now() +
                (
                    Number(account.expires_in || 0) *
                    1000
                )

        });

        console.log(
            "[Twitch Auth]",
            "Existing session restored for:",
            account.login
        );

        return true;
    }

    console.warn(
        "[Twitch Auth]",
        "Stored access token is invalid. Trying refresh token."
    );

    if (stored.twitchRefreshToken) {

        return Boolean(
            await refreshTwitchAccessToken()
        );
    }

    await clearTwitchSession();

    return false;
}


async function restoreTwitchSessionAndCheckStream() {

    const connected =
        await validateStoredTwitchSession();

    if (!connected) {
        return;
    }

    const stored =
        await chrome.storage.local.get([
            "channel"
        ]);

    if (!stored.channel) {

        console.log(
            "[Twitch Points Watcher]",
            "No Twitch channel configured."
        );

        return;
    }

    console.log(
        "[Twitch Points Watcher]",
        "Restored channel:",
        stored.channel
    );

    await checkStreamStatus(
        stored.channel
    );
}



// ========================================
// 記錄自動領取 Channel Points
// ========================================

let claimWriteQueue = Promise.resolve();

function recordChannelPointsClaim(channel, claimedAt) {

    claimWriteQueue = claimWriteQueue
        .then(async () => {

            const normalizedChannel =
                String(channel || "unknown")
                    .toLowerCase();

            const timestamp =
                Number(claimedAt) || Date.now();

            const data =
                await chrome.storage.local.get([
                    "claimStats",
                    "totalClaimCount",
                    "lastClaimAt",
                    "lastClaimChannel"
                ]);

            const stats =
                data.claimStats || {};

            const current =
                stats[normalizedChannel] || {
                    count: 0,
                    lastClaimAt: 0
                };

            // 多個 Twitch 分頁同時存在時，避免短時間重複計數
            if (
                timestamp -
                Number(current.lastClaimAt || 0) <
                10000
            ) {

                console.log(
                    "[Channel Points] Duplicate claim event ignored."
                );

                return;
            }

            stats[normalizedChannel] = {
                count:
                    Number(current.count || 0) + 1,
                lastClaimAt:
                    timestamp
            };

            const totalClaimCount =
                Number(data.totalClaimCount || 0) + 1;

            await chrome.storage.local.set({
                claimStats: stats,
                totalClaimCount,
                lastClaimAt: timestamp,
                lastClaimChannel:
                    normalizedChannel
            });

            console.log(
                "[Channel Points] Claim recorded for",
                normalizedChannel
            );
        })
        .catch((error) => {
            console.error(
                "[Channel Points] Unable to record claim.",
                error
            );
        });

    return claimWriteQueue;
}


// ========================================
// Popup / Content Script → Background Message
// ========================================

chrome.runtime.onMessage.addListener(
    (
        message,
        sender,
        sendResponse
    ) => {

        // Connect Twitch
        if (
            message.type ===
            "TWITCH_LOGIN"
        ) {

            startTwitchLogin()
                .then((result) => {
                    sendResponse(result);
                })
                .catch((error) => {
                    console.error(
                        "[Twitch Auth]",
                        error
                    );

                    sendResponse({
                        success: false,
                        error: error.message
                    });
                });

            return true;
        }

        // Popup 要求恢復 / 驗證已儲存的 Twitch Session
        if (
            message.type ===
            "TWITCH_RESTORE_SESSION"
        ) {

            validateStoredTwitchSession()
                .then(async (connected) => {

                    const stored =
                        await chrome.storage.local.get([
                            "twitchLogin"
                        ]);

                    sendResponse({
                        success: true,
                        connected,
                        login:
                            connected
                                ? stored.twitchLogin || null
                                : null
                    });
                })
                .catch((error) => {
                    console.error(
                        "[Twitch Auth]",
                        "Unable to restore Twitch session from popup.",
                        error
                    );

                    sendResponse({
                        success: false,
                        connected: false,
                        error: error.message
                    });
                });

            return true;
        }

        // Popup 要求立即檢查目前設定的頻道
        if (
            message.type ===
            "CHECK_STREAM_NOW"
        ) {

            chrome.storage.local.get([
                "channel"
            ])
                .then(async (stored) => {

                    if (!stored.channel) {
                        sendResponse({
                            success: false,
                            error: "No Twitch channel configured."
                        });
                        return;
                    }

                    const stream =
                        await checkStreamStatus(
                            stored.channel
                        );

                    sendResponse({
                        success: true,
                        live: Boolean(stream)
                    });
                })
                .catch((error) => {
                    console.error(
                        "[Stream Check]",
                        "Manual stream check failed.",
                        error
                    );

                    sendResponse({
                        success: false,
                        error: error.message
                    });
                });

            return true;
        }

        // Popup 要求解除 Twitch API 綁定
        if (
            message.type ===
            "TWITCH_LOGOUT"
        ) {

            Promise.all([
                clearTwitchAuthPending(),
                clearTwitchSession()
            ])
                .then(() => {
                    console.log(
                        "[Twitch Auth]",
                        "Twitch account disconnected."
                    );

                    sendResponse({
                        success: true
                    });
                })
                .catch((error) => {
                    console.error(
                        "[Twitch Auth]",
                        "Unable to disconnect Twitch account.",
                        error
                    );

                    sendResponse({
                        success: false,
                        error: error.message
                    });
                });

            return true;
        }

        // Popup 更新 Auto Watch / Auto Claim 設定
        if (
            message.type ===
            "UPDATE_AUTOMATION_SETTINGS"
        ) {

            (async () => {
                const updates = {};

                if (typeof message.autoWatchEnabled === "boolean") {
                    updates.autoWatchEnabled =
                        message.autoWatchEnabled;
                }

                if (typeof message.autoClaimEnabled === "boolean") {
                    updates.autoClaimEnabled =
                        message.autoClaimEnabled;
                }

                if (Object.keys(updates).length > 0) {
                    await chrome.storage.local.set(updates);
                }

                if (updates.autoWatchEnabled === false) {
                    await closeWatchTab();
                }
                else if (updates.autoWatchEnabled === true) {
                    const stored =
                        await chrome.storage.local.get([
                            "channel"
                        ]);

                    if (stored.channel) {
                        await checkStreamStatus(
                            stored.channel
                        );
                    }
                }

                return getAutomationSettings();
            })()
                .then((settings) => {
                    sendResponse({
                        success: true,
                        ...settings
                    });
                })
                .catch((error) => {
                    console.error(
                        "[Automation]",
                        "Unable to update automation settings.",
                        error
                    );

                    sendResponse({
                        success: false,
                        error: error.message
                    });
                });

            return true;
        }

        // Content Script 通知已點擊 Bonus Claim
        if (
            message.type ===
            "CHANNEL_POINTS_CLAIMED"
        ) {

            recordChannelPointsClaim(
                message.channel,
                message.claimedAt
            )
                .then(() => {
                    sendResponse({
                        success: true
                    });
                });

            return true;
        }
    }
);

// ========================================
// 自動觀看分頁管理
// ========================================

async function openWatchTab(channel) {

    const expectedUrl =
        `https://www.twitch.tv/${channel}`;


    const data =
        await chrome.storage.local.get([
            WATCH_TAB_KEY
        ]);


    const savedTabId =
        data[WATCH_TAB_KEY];


    // 已經有 Extension 建立的觀看分頁
    if (savedTabId) {

        try {

            const tab =
                await chrome.tabs.get(
                    savedTabId
                );


            // 如果目前分頁不是指定頻道，切換到新的頻道
            if (
                !tab.url ||
                !tab.url.startsWith(
                    expectedUrl
                )
            ) {

                await chrome.tabs.update(
                    savedTabId,
                    {
                        url: expectedUrl,
                        muted: true,
                        pinned: true,
                        autoDiscardable: false
                    }
                );


                console.log(
                    "[Auto Watch]",
                    `Updated watch tab to ${channel}.`
                );
            }
            else {

                await chrome.tabs.update(
                    savedTabId,
                    {
                        muted: true,
                        pinned: true,
                        autoDiscardable: false
                    }
                );


                console.log(
                    "[Auto Watch]",
                    `Watch tab already exists for ${channel}.`
                );
            }


            await chrome.storage.local.set({
                watchingChannel: channel
            });


            return savedTabId;
        }
        catch (error) {

            await chrome.storage.local.remove([
                WATCH_TAB_KEY,
                "watchingChannel"
            ]);


            console.log(
                "[Auto Watch]",
                "Saved watch tab no longer exists. Creating a new one."
            );
        }
    }


    // 建立新的 Twitch 觀看分頁
    const tab =
        await chrome.tabs.create({
            url: expectedUrl,
            active: false,
            pinned: true
        });


    if (!tab.id) {
        throw new Error(
            "Unable to create Twitch watch tab."
        );
    }


    await chrome.tabs.update(
        tab.id,
        {
            muted: true,
            pinned: true,
            autoDiscardable: false
        }
    );


    await chrome.storage.local.set({
        [WATCH_TAB_KEY]: tab.id,
        watchingChannel: channel
    });


    console.log(
        "[Auto Watch]",
        `Opened watch tab for ${channel}.`
    );


    return tab.id;
}

async function checkWatchTabHealth() {

    const settings =
        await getAutomationSettings();

    if (!settings.autoWatchEnabled) {
        await closeWatchTab();
        return;
    }

    const data =
        await chrome.storage.local.get([
            WATCH_TAB_KEY,
            "watchingChannel"
        ]);

    const tabId =
        data[WATCH_TAB_KEY];

    const channel =
        data.watchingChannel;


    if (!tabId || !channel) {
        return;
    }


    try {

        const tab =
            await chrome.tabs.get(tabId);


        console.log(
            "[Tab Health]",
            "discarded:",
            tab.discarded,
            "frozen:",
            tab.frozen
        );


        // 再次確保 Chrome 不要自動丟棄
        await chrome.tabs.update(
            tabId,
            {
                muted: true,
                pinned: true,
                autoDiscardable: false
            }
        );


        // 被 Chrome discard 的情況
        if (tab.discarded) {

            console.log(
                "[Tab Health]",
                "Watch tab was discarded. Reloading."
            );


            await chrome.tabs.reload(
                tabId
            );


            return;
        }


        // Chrome 132+ 才有 frozen
        if (tab.frozen) {

            console.log(
                "[Tab Health]",
                "Watch tab is frozen."
            );

            // 這裡先用 reload 恢復
            await chrome.tabs.reload(
                tabId
            );

        }

    }
    catch (error) {

        console.log(
            "[Tab Health]",
            "Watch tab no longer exists."
        );


        await chrome.storage.local.remove([
            WATCH_TAB_KEY,
            "watchingChannel"
        ]);

    }
}

async function closeWatchTab() {

    const data =
        await chrome.storage.local.get([
            WATCH_TAB_KEY
        ]);


    const tabId =
        data[WATCH_TAB_KEY];


    if (!tabId) {

        await chrome.storage.local.remove(
            "watchingChannel"
        );

        return;
    }


    try {

        const tab =
            await chrome.tabs.get(
                tabId
            );


        // 只處理 Twitch 網址，避免誤關其他分頁
        if (
            tab.url &&
            tab.url.startsWith(
                "https://www.twitch.tv/"
            )
        ) {

            await chrome.tabs.remove(
                tabId
            );


            console.log(
                "[Auto Watch]",
                "Watch tab closed."
            );
        }
        else {

            console.warn(
                "[Auto Watch]",
                "Saved tab is no longer a Twitch page. It will not be closed."
            );
        }
    }
    catch (error) {

        console.log(
            "[Auto Watch]",
            "Watch tab was already closed."
        );
    }


    await chrome.storage.local.remove([
        WATCH_TAB_KEY,
        "watchingChannel"
    ]);
}


// 使用者手動關閉自動觀看分頁時，同步清除紀錄
chrome.tabs.onRemoved.addListener(
    async (tabId) => {

        const data =
            await chrome.storage.local.get([
                WATCH_TAB_KEY
            ]);


        if (
            data[WATCH_TAB_KEY] === tabId
        ) {

            await chrome.storage.local.remove([
                WATCH_TAB_KEY,
                "watchingChannel"
            ]);


            console.log(
                "[Auto Watch]",
                "Watch tab was manually closed."
            );
        }
    }
);


// ========================================
// 檢查 Twitch 直播狀態
// ========================================

async function checkStreamStatus(channel) {

    console.log(
        "[Stream Check]",
        `Checking ${channel}...`
    );


    const auth =
        await chrome.storage.local.get([
            "twitchAccessToken",
            "twitchRefreshToken"
        ]);


    let accessToken =
        auth.twitchAccessToken;


    // 如果 Access Token 不見了，但還有 Refresh Token，
    // 嘗試自動恢復登入狀態。
    if (
        !accessToken &&
        auth.twitchRefreshToken
    ) {

        accessToken =
            await refreshTwitchAccessToken();
    }


    if (!accessToken) {

        console.warn(
            "[Stream Check]",
            "Twitch account is not connected."
        );

        await chrome.storage.local.set({
            streamStatus: "not_connected",
            streamCheckedAt: Date.now()
        });

        await closeWatchTab();

        return null;
    }


    const url =
        new URL(
            "https://api.twitch.tv/helix/streams"
        );


    url.searchParams.set(
        "user_login",
        channel
    );


    const requestStream =
        (token) => {

            return fetch(
                url.toString(),
                {
                    method: "GET",

                    headers: {

                        "Authorization":
                            `Bearer ${token}`,

                        "Client-Id":
                            TWITCH_CLIENT_ID

                    }
                }
            );
        };


    let response =
        await requestStream(
            accessToken
        );


    // Access Token 失效時，不直接登出。
    // 先使用 Refresh Token 取得新的 Access Token，再重試一次。
    if (response.status === 401) {

        console.warn(
            "[Stream Check]",
            "Twitch access token is invalid. Trying token refresh."
        );

        const refreshedToken =
            await refreshTwitchAccessToken();

        if (!refreshedToken) {

            await chrome.storage.local.set({
                streamStatus: "not_connected",
                streamCheckedAt: Date.now()
            });

            await closeWatchTab();

            return null;
        }

        accessToken =
            refreshedToken;

        response =
            await requestStream(
                accessToken
            );
    }


    if (!response.ok) {

        const errorText =
            await response.text();


        throw new Error(
            `Twitch API error ${response.status}: ${errorText}`
        );
    }


    const result =
        await response.json();


    // ==============================
    // LIVE
    // ==============================

    if (
        Array.isArray(result.data) &&
        result.data.length > 0
    ) {

        const stream =
            result.data[0];


        console.log(
            "[Stream Check]",
            `${channel} is LIVE`
        );


        console.log(
            "[Stream Check]",
            "Title:",
            stream.title
        );


        console.log(
            "[Stream Check]",
            "Game:",
            stream.game_name
        );


        console.log(
            "[Stream Check]",
            "Viewers:",
            stream.viewer_count
        );


        await chrome.storage.local.set({

            streamStatus:
                "live",

            streamCheckedAt:
                Date.now(),

            streamInfo: {

                id:
                    stream.id,

                channel:
                    stream.user_login,

                displayName:
                    stream.user_name,

                title:
                    stream.title,

                game:
                    stream.game_name,

                viewers:
                    stream.viewer_count,

                startedAt:
                    stream.started_at

            }

        });


        const automation =
            await getAutomationSettings();

        if (automation.autoWatchEnabled) {
            await openWatchTab(
                channel
            );
        }
        else {
            await closeWatchTab();

            console.log(
                "[Auto Watch]",
                "Auto Watch is disabled."
            );
        }


        return stream;
    }


    // ==============================
    // OFFLINE
    // ==============================

    console.log(
        "[Stream Check]",
        `${channel} is OFFLINE`
    );


    await chrome.storage.local.set({

        streamStatus:
            "offline",

        streamCheckedAt:
            Date.now(),

        streamInfo:
            null

    });


    await closeWatchTab();


    return null;
}

// ========================================
// Alarm Event
// ========================================

chrome.alarms.onAlarm.addListener(
    async (alarm) => {

        // ==============================
        // Twitch 授權輪詢
        // ==============================

        if (
            alarm.name ===
            TWITCH_AUTH_ALARM
        ) {

            try {

                await pollTwitchAuthorization();

            }
            catch (error) {

                console.error(
                    "[Twitch Auth]",
                    error
                );

            }

            return;
        }


        // ==============================
        // 每小時驗證 Twitch Token
        // ==============================

        if (
            alarm.name ===
            TWITCH_VALIDATE_ALARM
        ) {

            try {

                await validateStoredTwitchSession();

            }
            catch (error) {

                console.error(
                    "[Twitch Auth]",
                    "Hourly token validation failed.",
                    error
                );

            }

            return;
        }


        // ==============================
        // 每 2 分鐘檢查直播
        // ==============================

        if (
            alarm.name !==
            STREAM_CHECK_ALARM
        ) {

            return;
        }


        console.log(
            "[Twitch Points Watcher]",
            "Checking stream..."
        );


        const result =
            await chrome.storage.local.get(
                [
                    "channel"
                ]
            );


        if (!result.channel) {

            console.log(
                "[Twitch Points Watcher]",
                "No Twitch channel configured."
            );

            return;
        }


        console.log(
            "[Twitch Points Watcher]",
            "Channel:",
            result.channel
        );


        try {

            await checkStreamStatus(
                result.channel
            );

            await checkWatchTabHealth();

        }
        catch (error) {

            console.error(
                "[Stream Check]",
                error
            );

        }
    }
);
