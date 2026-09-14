const channelInput = document.getElementById("channel");
const saveButton = document.getElementById("save");
const statusText = document.getElementById("status");

const connectTwitchButton = document.getElementById("connectTwitch");
const disconnectTwitchButton = document.getElementById("disconnectTwitch");
const authStatusText = document.getElementById("authStatus");
const accountBadge = document.getElementById("accountBadge");
const accountName = document.getElementById("accountName");

const streamStatusText = document.getElementById("streamStatus");
const watchingChannelText = document.getElementById("watchingChannel");
const claimCountText = document.getElementById("claimCount");
const lastClaimText = document.getElementById("lastClaim");


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
        // 如果不是有效 URL，就當作一般頻道名稱處理。
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
        hour12: false
    }).format(new Date(value));
}


async function loadPopupState() {
    const data = await chrome.storage.local.get([
        "channel",
        "twitchAccessToken",
        "twitchRefreshToken",
        "twitchLogin",
        "twitchAuthPending",
        "streamStatus",
        "watchingChannel",
        "totalClaimCount",
        "lastClaimAt"
    ]);

    if (data.channel) {
        channelInput.value = data.channel;
    }

    const hasSavedSession = Boolean(
        data.twitchAccessToken ||
        data.twitchRefreshToken
    );

    if (data.twitchAuthPending) {
        setBadge(
            accountBadge,
            "Authorizing",
            "pending"
        );

        accountName.textContent =
            data.twitchLogin || "Waiting for Twitch";

        connectTwitchButton.classList.add("hidden");
        disconnectTwitchButton.classList.remove("hidden");
    }
    else if (hasSavedSession) {
        setBadge(
            accountBadge,
            "Connected",
            "connected"
        );

        accountName.textContent =
            data.twitchLogin || "Restoring account";

        connectTwitchButton.classList.add("hidden");
        disconnectTwitchButton.classList.remove("hidden");
    }
    else {
        setBadge(
            accountBadge,
            "Not connected",
            "neutral"
        );

        accountName.textContent = "--";
        connectTwitchButton.classList.remove("hidden");
        disconnectTwitchButton.classList.add("hidden");
    }

    switch (data.streamStatus) {
        case "live":
            setBadge(
                streamStatusText,
                "LIVE",
                "live"
            );
            break;

        case "offline":
            setBadge(
                streamStatusText,
                "OFFLINE",
                "offline"
            );
            break;

        case "not_connected":
            setBadge(
                streamStatusText,
                "Not connected",
                "neutral"
            );
            break;

        default:
            setBadge(
                streamStatusText,
                "Unknown",
                "neutral"
            );
            break;
    }

    watchingChannelText.textContent =
        data.watchingChannel || "--";

    claimCountText.textContent =
        String(data.totalClaimCount || 0);

    lastClaimText.textContent =
        formatDateTime(data.lastClaimAt);
}


async function restoreTwitchSession() {
    try {
        const response =
            await chrome.runtime.sendMessage({
                type: "TWITCH_RESTORE_SESSION"
            });

        if (
            response?.success &&
            response.connected
        ) {
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


saveButton.addEventListener(
    "click",
    async () => {
        const channel =
            normalizeChannel(
                channelInput.value
            );

        if (!channel) {
            statusText.textContent =
                "Please enter a Twitch channel.";
            return;
        }

        saveButton.disabled = true;
        statusText.textContent = "Saving...";

        try {
            await chrome.storage.local.set({
                channel
            });

            channelInput.value = channel;
            statusText.textContent =
                "Channel saved.";

            const response =
                await chrome.runtime.sendMessage({
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
    }
);


channelInput.addEventListener(
    "keydown",
    (event) => {
        if (event.key === "Enter") {
            saveButton.click();
        }
    }
);


connectTwitchButton.addEventListener(
    "click",
    async () => {
        connectTwitchButton.disabled = true;
        authStatusText.textContent =
            "Starting Twitch authorization...";

        try {
            const response =
                await chrome.runtime.sendMessage({
                    type: "TWITCH_LOGIN"
                });

            if (!response?.success) {
                authStatusText.textContent =
                    response?.error ||
                    "Authorization failed.";
                return;
            }

            authStatusText.textContent =
                "Complete authorization in the Twitch tab.";
        }
        catch (error) {
            authStatusText.textContent =
                "Authorization failed.";
        }
        finally {
            connectTwitchButton.disabled = false;
            await loadPopupState();
        }
    }
);


disconnectTwitchButton.addEventListener(
    "click",
    async () => {
        disconnectTwitchButton.disabled = true;
        authStatusText.textContent =
            "Disconnecting Twitch account...";

        try {
            const response =
                await chrome.runtime.sendMessage({
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
    }
);


chrome.storage.onChanged.addListener(
    (changes, areaName) => {
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
            "watchingChannel",
            "totalClaimCount",
            "lastClaimAt"
        ]);

        const shouldRefresh =
            Object.keys(changes)
                .some((key) =>
                    watchedKeys.has(key)
                );

        if (shouldRefresh) {
            loadPopupState();
        }
    }
);


async function initializePopup() {
    await loadPopupState();
    await restoreTwitchSession();

    const state =
        await chrome.storage.local.get([
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
}


initializePopup();
