/**
 * Shared GunDB / ZEN initialization for Tunecamp Website
 */

// Default peers
const REGISTRY_PEERS = [
    "https://delay.scobrudot.dev/zen"
];

// Singleton instance
let gunInstance = null;

function getZen() {
    if (!gunInstance) {
        if (typeof Zen === 'undefined') {
            console.error("Zen library not loaded! Make sure zen.js is included before gun-init.js");
            return null;
        }
        
        console.log("📡 Initializing shared Zen instance...");
        gunInstance = new Zen({
            peers: REGISTRY_PEERS,
            localStorage: true
        });
    }
    return gunInstance;
}

// Global export
window.getZen = getZen;
window.getGun = getZen; // fallback
