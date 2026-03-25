import Gun from "gun";
import "gun/sea.js";

async function testSEA() {
    try {
        console.log("Testing Gun.SEA...");
        const pair = await Gun.SEA.pair();
        console.log("Pair generated:", pair.pub.slice(0, 8));

        const message = "test-message";
        const sig = await Gun.SEA.sign(message, pair);
        console.log("Signature generated type:", typeof sig);
        
        const verified = await Gun.SEA.verify(sig, pair.pub);
        console.log("Verified message:", verified);
        
        if (verified === message) {
            console.log("✅ SEA Verify works!");
        } else {
            console.log("❌ SEA Verify failed! Returned:", verified);
        }
    } catch (e) {
        console.error("💥 SEA Error:", e);
    }
}

testSEA();
