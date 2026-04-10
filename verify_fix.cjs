const SEAWallet = require('../gun/lib/wallet-eth.js');

async function test() {
    console.log("Testing SEAWallet alphabet expansion...");
    
    // A sample SEA pair with '+' in priv
    const pair = {
        pub: "dummy_pub",
        priv: "ABC+DEF/GHI.JKL_MNO-PQR" // Contains all our supported characters
    };

    try {
        const wallet = await SEAWallet.seaToEthWallet(pair);
        console.log("✅ Success! Derived address:", wallet.address);
        console.log("Private key length:", wallet.privateKey.length);
    } catch (e) {
        console.error("❌ Failed:", e.message);
        process.exit(1);
    }
}

test();
