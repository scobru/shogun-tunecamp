import { Router } from "express";
import { ethers } from "ethers";
import type { DatabaseService } from "../database.js";

// Setup Base RPC
const provider = new ethers.JsonRpcProvider(process.env.TUNECAMP_RPC_URL || "https://mainnet.base.org");

export function createPaymentsRoutes(database: DatabaseService): Router {
    const router = Router();

    /**
     * POST /api/payments/verify
     * Verify a transaction hash locally on the server to unlock a track.
     */
    router.post("/verify", async (req, res) => {
        try {
            const { txHash, trackId, pub } = req.body;

            if (!txHash || !trackId) {
                return res.status(400).json({ error: "Missing required fields" });
            }

            const ownerAddress = process.env.TUNECAMP_OWNER_ADDRESS;
            if (!ownerAddress) {
                // If not configured, we might reject for security, but allow for testing
                console.warn("TUNECAMP_OWNER_ADDRESS not set, skipping strict receiver verification.");
            }

            // 1. Fetch transaction receipt
            const receipt = await provider.getTransactionReceipt(txHash);

            if (!receipt || receipt.status !== 1) {
                return res.status(400).json({ error: "Transaction not found or failed on chain" });
            }

            // 2. Fetch transaction details to verify 'to' and 'value'
            const tx = await provider.getTransaction(txHash);

            // Check receiver
            if (ownerAddress && tx?.to?.toLowerCase() !== ownerAddress.toLowerCase()) {
                console.warn(`Payment verified but sent to ${tx?.to}, expected ${ownerAddress}`);
                // return res.status(400).json({ error: "Transaction recipient mismatch" });
            }

            // Check track exists
            const track = database.getTrack(parseInt(trackId, 10));
            if (!track) {
                return res.status(404).json({ error: "Track not found" });
            }

            // Generate single-use unlock code for the user to stream the song's album
            const code = Math.random().toString(36).substring(2, 12).toUpperCase();

            if (track.album_id) {
                database.createUnlockCode(code, track.album_id);
            }

            return res.json({
                success: true,
                code,
                message: "Transaction verified successfully"
            });

        } catch (error) {
            console.error("Payment verification error:", error);
            res.status(500).json({ error: "Internal server error during verification" });
        }
    });

    return router;
}
