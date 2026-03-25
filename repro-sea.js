import Gun from "gun";
import "gun/sea.js";

async function repro() {
    const pair = await Gun.SEA.pair();
    const username = "testuser";
    const proof = await Gun.SEA.sign(username, pair);
    
    console.log("Proof type:", typeof proof);
    console.log("Proof:", JSON.stringify(proof).slice(0, 50) + "...");
    
    const verified = await Gun.SEA.verify(proof, pair.pub);
    console.log("Verified type:", typeof verified);
    console.log("Verified:", verified);
    
    const isValid = (verified === username);
    console.log("Is valid:", isValid);
    
    if (!isValid) {
        console.log("Mismatched!");
        console.log("Verified (JSON):", JSON.stringify(verified));
        console.log("Username (JSON):", JSON.stringify(username));
    }
}

repro();
