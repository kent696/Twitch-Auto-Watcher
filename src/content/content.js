// ========================================
// Twitch Points Watcher - Content Script
// ========================================

const CLAIM_SCAN_INTERVAL_MS = 5000;
const CLAIM_COOLDOWN_MS = 10000;
const PLAYBACK_CHECK_INTERVAL_MS = 15000;

let lastClaimAt = 0;
let scanTimer = null;
let observer = null;
let started = false;

const handledButtons = new WeakSet();


// ========================================
// 取得目前 Twitch 頻道名稱
// ========================================

function getCurrentChannel() {
    const parts = location.pathname
        .split("/")
        .filter(Boolean);

    if (parts.length === 0) {
        return null;
    }

    const firstPart = parts[0].toLowerCase();

    const reservedRoutes = new Set([
        "directory",
        "downloads",
        "jobs",
        "p",
        "settings",
        "subscriptions",
        "turbo",
        "wallet"
    ]);

    if (reservedRoutes.has(firstPart)) {
        return null;
    }

    return firstPart;
}


// ========================================
// 確認這個頁面是 Extension 正在觀看的頻道
// ========================================

async function isManagedChannelPage() {
    const currentChannel = getCurrentChannel();

    if (!currentChannel) {
        return false;
    }

    const data = await chrome.storage.local.get([
        "watchingChannel"
    ]);

    if (!data.watchingChannel) {
        return false;
    }

    return (
        currentChannel ===
        String(data.watchingChannel).toLowerCase()
    );
}


// ========================================
// 找到 Bonus Claim 按鈕
// ========================================

function findClaimButton() {
    // Twitch 常見且相對明確的 accessible label
    const ariaSelectors = [
        'button[aria-label="Claim Bonus"]',
        'button[aria-label*="Claim Bonus" i]',
        'button[aria-label*="claim" i][aria-label*="bonus" i]'
    ];

    for (const selector of ariaSelectors) {
        const button = document.querySelector(selector);

        if (button) {
            return button;
        }
    }

    // Twitch 長期使用的 Bonus icon marker
    const claimIcon = document.querySelector(
        ".claimable-bonus__icon"
    );

    if (claimIcon) {
        const button = claimIcon.closest("button");

        if (button) {
            return button;
        }
    }

    // Chrome 支援 :has()，用 child marker 找真正的按鈕
    try {
        const button = document.querySelector(
            "button:has(.claimable-bonus__icon)"
        );

        if (button) {
            return button;
        }
    }
    catch (error) {
        // 不支援 :has() 時忽略即可
    }

    return null;
}


function isButtonUsable(button) {
    if (!button) {
        return false;
    }

    if (!button.isConnected) {
        return false;
    }

    if (button.disabled) {
        return false;
    }

    const style = window.getComputedStyle(button);

    if (
        style.display === "none" ||
        style.visibility === "hidden"
    ) {
        return false;
    }

    return button.getClientRects().length > 0;
}


// ========================================
// Auto Claim 設定
// ========================================

async function isAutoClaimEnabled() {
    const data =
        await chrome.storage.local.get([
            "autoClaimEnabled"
        ]);

    // 舊版尚未建立設定時預設為開啟。
    return data.autoClaimEnabled !== false;
}


// ========================================
// 領取 Bonus
// ========================================

async function tryClaimBonus() {
    if (!(await isAutoClaimEnabled())) {
        return false;
    }

    if (
        Date.now() - lastClaimAt <
        CLAIM_COOLDOWN_MS
    ) {
        return false;
    }

    const managed =
        await isManagedChannelPage();

    if (!managed) {
        return false;
    }

    const button = findClaimButton();

    if (!isButtonUsable(button)) {
        return false;
    }

    if (handledButtons.has(button)) {
        return false;
    }

    handledButtons.add(button);
    lastClaimAt = Date.now();

    const channel = getCurrentChannel();

    console.log(
        "[Channel Points] Bonus detected. Claiming now."
    );

    try {
        button.click();
    }
    catch (error) {
        console.error(
            "[Channel Points] Unable to click bonus button.",
            error
        );

        return false;
    }

    try {
        await chrome.runtime.sendMessage({
            type: "CHANNEL_POINTS_CLAIMED",
            channel,
            claimedAt: Date.now()
        });
    }
    catch (error) {
        console.warn(
            "[Channel Points] Claim was clicked, but the background script could not be notified."
        );
    }

    console.log(
        "[Channel Points] Bonus claim action completed."
    );

    return true;
}


// ========================================
// MutationObserver 掃描節流
// ========================================

function scheduleScan() {
    if (scanTimer !== null) {
        return;
    }

    scanTimer = window.setTimeout(
        async () => {
            scanTimer = null;
            await tryClaimBonus();
        },
        150
    );
}


function startObserver() {
    if (observer) {
        observer.disconnect();
    }

    observer = new MutationObserver(() => {
        scheduleScan();
    });

    observer.observe(
        document.body,
        {
            childList: true,
            subtree: true
        }
    );

    console.log(
        "[Channel Points] DOM observer started."
    );
}


// ========================================
// 確保直播播放器保持播放
// ========================================

async function ensurePlayback() {
    const managed =
        await isManagedChannelPage();

    if (!managed) {
        return;
    }

    const video = document.querySelector("video");

    if (!video) {
        return;
    }

    if (!video.paused) {
        return;
    }

    try {
        await video.play();

        console.log(
            "[Auto Watch] Playback resumed."
        );
    }
    catch (error) {
        console.log(
            "[Auto Watch] Browser did not allow automatic playback yet."
        );
    }
}


// ========================================
// 啟動 Content Script
// ========================================

async function start() {
    if (started) {
        return;
    }

    const managed =
        await isManagedChannelPage();

    if (!managed) {
        return;
    }

    started = true;

    console.log(
        "[Twitch Points Watcher] Content script active on managed channel."
    );

    startObserver();

    // 頁面一載入先掃一次
    await tryClaimBonus();
    await ensurePlayback();

    // MutationObserver 之外，再保留低頻率 fallback
    window.setInterval(
        () => {
            tryClaimBonus();
        },
        CLAIM_SCAN_INTERVAL_MS
    );

    // Twitch 播放器因網路或頁面狀態暫停時嘗試恢復
    window.setInterval(
        () => {
            ensurePlayback();
        },
        PLAYBACK_CHECK_INTERVAL_MS
    );
}


// watch tab 的 storage 可能比 content script 晚一點寫入，
// 因此短暫重試直到確認這是 Extension 管理的頻道。
let startupAttempts = 0;

const startupTimer = window.setInterval(
    async () => {
        startupAttempts += 1;

        await start();

        if (started || startupAttempts >= 15) {
            window.clearInterval(startupTimer);
        }
    },
    1000
);

start();
