const channelInput = document.getElementById("channel");
const saveButton = document.getElementById("save");
const statusText = document.getElementById("status");

const connectTwitchButton = document.getElementById("connectTwitch");
const disconnectTwitchButton = document.getElementById("disconnectTwitch");
const authStatusText = document.getElementById("authStatus");
const accountBadge = document.getElementById("accountBadge");
const accountName = document.getElementById("accountName");

const streamStatusText = document.getElementById("streamStatus");
const watchStateText = document.getElementById("watchState");
const watchingChannelText = document.getElementById("watchingChannel");
const currentWatchDurationText = document.getElementById("currentWatchDuration");
const lastCheckedText = document.getElementById("lastChecked");
const lastLiveDetectedText = document.getElementById("lastLiveDetected");
const lastWatchedText = document.getElementById("lastWatched");
const totalWatchDurationText = document.getElementById("totalWatchDuration");
const claimCountText = document.getElementById("claimCount");
const lastClaimText = document.getElementById("lastClaim");
const lastErrorText = document.getElementById("lastError");

const autoWatchToggle = document.getElementById("autoWatchEnabled");
const autoClaimToggle = document.getElementById("autoClaimEnabled");
const intervalSelect = document.getElementById("streamCheckInterval");
const checkNowButton = document.getElementById("checkNow");
const automationStatusText = document.getElementById("automationStatus");
const activityLogElement = document.getElementById("activityLog");
const watchHistoryElement = document.getElementById("watchHistory");
const clearActivityButton = document.getElementById("clearActivity");

let currentWatchSession = null;
let durationTimer = null;


function normalizeChannel(value) {
    let channel = String(value || "").trim();

    if (!channel) {
        return "";
    }

    try {
        if (/^https?:\/\//i.test(channel)) {
            const url = new URL(channel);

            if (
                url.hostname === "twitch.tv" ||
                url.hostname === "www.twitch.tv"
            ) {
                channel = url.pathname
                    .split("/")
                    .filter(Boolean)[0] || "";
            }
        }
    }
    catch (error) {
        // Treat invalid URLs as a normal Twitch login name.
    }

    return channel
        .replace(/^@/, "")
        .trim()
        .toLowerCase();
}


function setBadge(element, text, type = "neutral") {
    element.textContent = text;
    element.className = `badge ${type}`;
}


function formatDateTime(timestamp) {
    const value = Number(timestamp || 0);

    if (!value) {
        return "--";
    }

    return new Intl.DateTimeFormat("zh-TW", {
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hour12: false
    }).format(new Date(value));
}


function formatDuration(durationMs) {
    const totalSeconds = Math.max(
        0,
        Math.floor(Number(durationMs || 0) / 1000)
    );

    if (totalSeconds < 60) {
        return `${totalSeconds}s`;
    }

    const totalMinutes = Math.floor(totalSeconds / 60);
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;

    if (hours > 0) {
        return `${hours}h ${minutes}m`;
    }

    return `${totalMinutes}m`;
}


function formatActivityType(type) {
    const labels = {
        live_detected: "LIVE detected",
        stream_offline: "Stream offline",
        watch_started: "Watch started",
        watch_stopped: "Watch stopped",
        content_script_active: "Content script active",
        playback_confirmed: "Playback confirmed",
        tab_reloaded: "Watch tab reloaded",
        tab_missing: "Watch tab missing",
        claim: "Bonus claimed",
        interval_changed: "Check interval changed",
        error: "Error"
    };

    return labels[type] || type || "Activity";
}


function updateCurrentDuration() {
    if (!currentWatchSession?.startAt) {
        currentWatchDurationText.textContent = "--";
        return;
    }

    currentWatchDurationText.textContent =
        formatDuration(
            Date.now() - Number(currentWatchSession.startAt)
        );
}


function renderActivityLog(items) {
    const activity = Array.isArray(items) ? items.slice(0, 8) : [];

    if (activity.length === 0) {
        activityLogElement.className = "timeline empty-state";
        activityLogElement.textContent = "No activity yet.";
        return;
    }

    activityLogElement.className = "timeline";
    activityLogElement.replaceChildren();

    for (const item of activity) {
        const wrapper = document.createElement("div");
        wrapper.className = "timeline-item";

        const title = document.createElement("div");
        title.className = "timeline-title";

        const label = document.createElement("span");
        label.textContent = formatActivityType(item.type);

        const time = document.createElement("span");
        time.textContent = formatDateTime(item.at);

        title.append(label, time);

        const meta = document.createElement("div");
        meta.className = "timeline-meta";

        const parts = [];

        if (item.channel) {
            parts.push(item.channel);
        }

        if (item.message) {
            parts.push(item.message);
        }

        if (item.details?.reason) {
            parts.push(`Reason: ${item.details.reason}`);
        }

        if (item.details?.durationMs) {
            parts.push(`Duration: ${formatDuration(item.details.durationMs)}`);
        }

        meta.textContent = parts.join(" · ") || "--";

        wrapper.append(title, meta);
        activityLogElement.append(wrapper);
    }
}


function renderWatchHistory(items) {
    const history = Array.isArray(items) ? items.slice(0, 3) : [];

    if (history.length === 0) {
        watchHistoryElement.className = "timeline empty-state";
        watchHistoryElement.textContent = "No watch sessions yet.";
        return;
    }

    watchHistoryElement.className = "timeline";
    watchHistoryElement.replaceChildren();

    for (const session of history) {
        const wrapper = document.createElement("div");
        wrapper.className = "timeline-item";

        const title = document.createElement("div");
        title.className = "timeline-title";

        const channel = document.createElement("span");
        channel.textContent = session.channel || "unknown";

        const duration = document.createElement("span");
        duration.textContent = formatDuration(session.durationMs);

        title.append(channel, duration);

        const meta = document.createElement("div");
        meta.className = "timeline-meta";
        meta.textContent =
            `${formatDateTime(session.startAt)} → ${formatDateTime(session.endAt)} · ${session.reason || "ended"}`;

        wrapper.append(title, meta);
        watchHistoryElement.append(wrapper);
    }
}


async function loadPopupState() {
    const data = await chrome.storage.local.get([
        "channel",
        "twitchAccessToken",
        "twitchRefreshToken",
        "twitchLogin",
        "twitchAuthPending",
        "streamStatus",
        "watchState",
        "watchingChannel",
        "watchSession",
        "streamCheckedAt",
        "lastLiveDetectedAt",
        "lastWatchedAt",
        "totalWatchDurationMs",
        "totalClaimCount",
        "lastClaimAt",
        "lastError",
        "activityLog",
        "watchHistory",
        "autoWatchEnabled",
        "autoClaimEnabled",
        "streamCheckInterval"
    ]);

    if (data.channel) {
        channelInput.value = data.channel;
    }

    const hasSavedSession = Boolean(
        data.twitchAccessToken ||
        data.twitchRefreshToken
    );

    if (data.twitchAuthPending) {
        setBadge(accountBadge, "Authorizing", "pending");
        accountName.textContent =
            data.twitchLogin || "Waiting for Twitch";
        connectTwitchButton.classList.add("hidden");
        disconnectTwitchButton.classList.remove("hidden");
    }
    else if (hasSavedSession) {
        setBadge(accountBadge, "Connected", "connected");
        accountName.textContent =
            data.twitchLogin || "Restoring account";
        connectTwitchButton.classList.add("hidden");
        disconnectTwitchButton.classList.remove("hidden");
    }
    else {
        setBadge(accountBadge, "Not connected", "neutral");
        accountName.textContent = "--";
        connectTwitchButton.classList.remove("hidden");
        disconnectTwitchButton.classList.add("hidden");
    }

    switch (data.streamStatus) {
        case "live":
            setBadge(streamStatusText, "LIVE", "live");
            break;
        case "offline":
            setBadge(streamStatusText, "OFFLINE", "offline");
            break;
        case "checking":
            setBadge(streamStatusText, "CHECKING", "checking");
            break;
        case "error":
            setBadge(streamStatusText, "ERROR", "error");
            break;
        case "not_connected":
            setBadge(streamStatusText, "Not connected", "neutral");
            break;
        default:
            setBadge(streamStatusText, "Unknown", "neutral");
            break;
    }

    const watchState = data.watchState || "idle";

    switch (watchState) {
        case "watching":
            setBadge(watchStateText, "WATCHING", "watching");
            break;
        case "opening":
            setBadge(watchStateText, "OPENING", "opening");
            break;
        case "error":
            setBadge(watchStateText, "ERROR", "error");
            break;
        default:
            setBadge(watchStateText, "IDLE", "idle");
            break;
    }

    watchingChannelText.textContent =
        data.watchingChannel || "--";

    currentWatchSession = data.watchSession || null;
    updateCurrentDuration();

    lastCheckedText.textContent =
        formatDateTime(data.streamCheckedAt);

    lastLiveDetectedText.textContent =
        formatDateTime(data.lastLiveDetectedAt);

    lastWatchedText.textContent =
        formatDateTime(data.lastWatchedAt);

    totalWatchDurationText.textContent =
        formatDuration(data.totalWatchDurationMs);

    claimCountText.textContent =
        String(data.totalClaimCount || 0);

    lastClaimText.textContent =
        formatDateTime(data.lastClaimAt);

    autoWatchToggle.checked =
        data.autoWatchEnabled !== false;

    autoClaimToggle.checked =
        data.autoClaimEnabled !== false;

    intervalSelect.value =
        String(Number(data.streamCheckInterval || 2));

    if (!intervalSelect.value) {
        intervalSelect.value = "2";
    }

    if (data.lastError?.message) {
        lastErrorText.textContent =
            `${formatDateTime(data.lastError.at)} · ${data.lastError.source || "Unknown"}: ${data.lastError.message}`;
    }
    else {
        lastErrorText.textContent = "None";
    }

    renderActivityLog(data.activityLog);
    renderWatchHistory(data.watchHistory);
}


async function restoreTwitchSession() {
    try {
        const response = await chrome.runtime.sendMessage({
            type: "TWITCH_RESTORE_SESSION"
        });

        if (response?.success && response.connected) {
            authStatusText.textContent =
                "Saved Twitch session restored.";
        }

        await loadPopupState();
    }
    catch (error) {
        console.warn(
            "Unable to restore Twitch session.",
            error
        );
    }
}


saveButton.addEventListener("click", async () => {
    const channel = normalizeChannel(channelInput.value);

    if (!channel) {
        statusText.textContent =
            "Please enter a Twitch channel.";
        return;
    }

    saveButton.disabled = true;
    statusText.textContent = "Saving...";

    try {
        await chrome.storage.local.set({ channel });
        channelInput.value = channel;
        statusText.textContent = "Channel saved.";

        const response = await chrome.runtime.sendMessage({
            type: "CHECK_STREAM_NOW"
        });

        if (!response?.success) {
            statusText.textContent =
                response?.error ||
                "Channel saved. Stream check failed.";
        }
    }
    catch (error) {
        statusText.textContent =
            "Unable to save channel.";
    }
    finally {
        saveButton.disabled = false;
        await loadPopupState();
    }
});


channelInput.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
        saveButton.click();
    }
});


connectTwitchButton.addEventListener("click", async () => {
    connectTwitchButton.disabled = true;
    authStatusText.textContent =
        "Starting Twitch authorization...";

    try {
        const response = await chrome.runtime.sendMessage({
            type: "TWITCH_LOGIN"
        });

        if (!response?.success) {
            authStatusText.textContent =
                response?.error || "Authorization failed.";
            return;
        }

        authStatusText.textContent =
            "Complete authorization in the Twitch tab.";
    }
    catch (error) {
        authStatusText.textContent = "Authorization failed.";
    }
    finally {
        connectTwitchButton.disabled = false;
        await loadPopupState();
    }
});


disconnectTwitchButton.addEventListener("click", async () => {
    disconnectTwitchButton.disabled = true;
    authStatusText.textContent =
        "Disconnecting Twitch account...";

    try {
        const response = await chrome.runtime.sendMessage({
            type: "TWITCH_LOGOUT"
        });

        if (!response?.success) {
            authStatusText.textContent =
                response?.error ||
                "Unable to disconnect Twitch account.";
            return;
        }

        authStatusText.textContent =
            "Twitch account disconnected.";
    }
    catch (error) {
        authStatusText.textContent =
            "Unable to disconnect Twitch account.";
    }
    finally {
        disconnectTwitchButton.disabled = false;
        await loadPopupState();
    }
});


async function updateAutomationSettings() {
    autoWatchToggle.disabled = true;
    autoClaimToggle.disabled = true;
    automationStatusText.textContent =
        "Saving automation settings...";

    try {
        const response = await chrome.runtime.sendMessage({
            type: "UPDATE_AUTOMATION_SETTINGS",
            autoWatchEnabled: autoWatchToggle.checked,
            autoClaimEnabled: autoClaimToggle.checked
        });

        if (!response?.success) {
            throw new Error(
                response?.error ||
                "Unable to save automation settings."
            );
        }

        automationStatusText.textContent =
            "Automation settings saved.";
    }
    catch (error) {
        automationStatusText.textContent =
            "Unable to save automation settings.";
        await loadPopupState();
    }
    finally {
        autoWatchToggle.disabled = false;
        autoClaimToggle.disabled = false;
    }
}


autoWatchToggle.addEventListener(
    "change",
    updateAutomationSettings
);

autoClaimToggle.addEventListener(
    "change",
    updateAutomationSettings
);


intervalSelect.addEventListener("change", async () => {
    intervalSelect.disabled = true;
    automationStatusText.textContent =
        "Updating check interval...";

    try {
        const response = await chrome.runtime.sendMessage({
            type: "UPDATE_STREAM_CHECK_INTERVAL",
            interval: Number(intervalSelect.value)
        });

        if (!response?.success) {
            throw new Error(
                response?.error ||
                "Unable to update check interval."
            );
        }

        automationStatusText.textContent =
            `Check interval set to ${response.interval} minute(s).`;
    }
    catch (error) {
        automationStatusText.textContent =
            "Unable to update check interval.";
    }
    finally {
        intervalSelect.disabled = false;
        await loadPopupState();
    }
});


checkNowButton.addEventListener("click", async () => {
    checkNowButton.disabled = true;
    automationStatusText.textContent =
        "Checking stream now...";

    try {
        const response = await chrome.runtime.sendMessage({
            type: "CHECK_STREAM_NOW"
        });

        if (!response?.success) {
            throw new Error(
                response?.error || "Stream check failed."
            );
        }

        automationStatusText.textContent =
            response.live
                ? "Channel is LIVE."
                : "Channel is OFFLINE.";
    }
    catch (error) {
        automationStatusText.textContent =
            error.message || "Stream check failed.";
    }
    finally {
        checkNowButton.disabled = false;
        await loadPopupState();
    }
});


clearActivityButton.addEventListener("click", async () => {
    clearActivityButton.disabled = true;

    try {
        await chrome.runtime.sendMessage({
            type: "CLEAR_ACTIVITY_LOG"
        });
    }
    finally {
        clearActivityButton.disabled = false;
        await loadPopupState();
    }
});


chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName !== "local") {
        return;
    }

    const watchedKeys = new Set([
        "channel",
        "twitchAccessToken",
        "twitchRefreshToken",
        "twitchLogin",
        "twitchAuthPending",
        "streamStatus",
        "watchState",
        "watchingChannel",
        "watchSession",
        "streamCheckedAt",
        "lastLiveDetectedAt",
        "lastWatchedAt",
        "totalWatchDurationMs",
        "totalClaimCount",
        "lastClaimAt",
        "lastError",
        "activityLog",
        "watchHistory",
        "autoWatchEnabled",
        "autoClaimEnabled",
        "streamCheckInterval"
    ]);

    const shouldRefresh =
        Object.keys(changes)
            .some((key) => watchedKeys.has(key));

    if (shouldRefresh) {
        loadPopupState();
    }
});


async function initializePopup() {
    await loadPopupState();
    await restoreTwitchSession();

    const state = await chrome.storage.local.get([
        "channel",
        "twitchAccessToken",
        "twitchRefreshToken"
    ]);

    if (
        state.channel &&
        (
            state.twitchAccessToken ||
            state.twitchRefreshToken
        )
    ) {
        try {
            await chrome.runtime.sendMessage({
                type: "CHECK_STREAM_NOW"
            });
        }
        catch (error) {
            console.warn(
                "Initial stream check failed.",
                error
            );
        }
    }

    await loadPopupState();

    if (durationTimer !== null) {
        clearInterval(durationTimer);
    }

    durationTimer = setInterval(
        updateCurrentDuration,
        1000
    );
}


initializePopup();
