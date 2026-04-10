const SEAWalletBTC = require('../gun/lib/wallet-btc.js');

async function test() {
    console.log("Testing SEAWalletBTC alphabet expansion...");
    
    // A sample SEA pair with '+' in priv
    const pair = {
        pub: "dummy_pub",
        priv: "ABC+DEF/GHI.JKL_MNO-PQR" // Contains all our supported characters
    };

    try {
        const wallet = await SEAWalletBTC.seaToBtcWallet(pair);
        console.log("✅ Success! Derived BTC address (legacy):", wallet.address);
        console.log("Derived BTC address (segwit):", wallet.segwitAddress);
        console.log("Private key length:", wallet.privateKey.length);
    } catch (e) {
        console.error("❌ Failed:", e.message);
        console.error(e.stack);
        process.exit(1);
    }
}

test();
