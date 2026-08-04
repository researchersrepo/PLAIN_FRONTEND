const DEBUG_MODE = true;
function appendDebugLog(message) {
    if (!DEBUG_MODE) return;
    const panel = document.getElementById("debugPanel");
    const time = new Date().toLocaleTimeString();
    console.log(`[${time}] ${message}`);
    if (panel) {
        panel.textContent += `\n[${time}] ${message}`;
        panel.scrollTop = panel.scrollHeight;
    }
}
