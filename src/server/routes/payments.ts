import { Router } from "express";
import { ethers } from "ethers";
import fs from "fs-extra";
import path from "path";
import type { DatabaseService } from "../database.js";
import { getEthUsdRate } from "../price.js";

// Setup Base RPC
const provider = new ethers.JsonRpcProvider(process.env.TUNECAMP_RPC_URL || "https://mainnet.base.org");

export function createPaymentsRoutes(database: DatabaseService, musicDir: string): Router {
    const router = Router();

    /**
     * POST /api/payments/verify
     * Verify a transaction hash locally on the server to unlock a track.
     */
    router.post("/verify", async (req, res) => {
        try {
            const { txHash, trackId } = req.body;

            if (!txHash || !trackId) {
                return res.status(400).json({ error: "Missing required fields" });
            }

            const ownerAddress = process.env.TUNECAMP_OWNER_ADDRESS;
            if (!ownerAddress) {
                console.warn("TUNECAMP_OWNER_ADDRESS not set, skipping strict receiver verification.");
            }

            // 1. Fetch transaction receipt
            const receipt = await provider.getTransactionReceipt(txHash);

            if (!receipt || receipt.status !== 1) {
                return res.status(400).json({ error: "Transaction not found or failed on chain" });
            }

            // 2. Fetch transaction details to verify 'to' and 'value'
            const tx = await provider.getTransaction(txHash);

            // Check track exists
            const track = database.getTrack(parseInt(trackId, 10));
            if (!track) {
                return res.status(404).json({ error: "Track not found" });
            }

            // Check receiver
            const web3CheckoutAddr = database.getSetting("web3_checkout_address");
            const expectedRecipient = (track as any).walletAddress || ownerAddress;

            if (web3CheckoutAddr && tx?.to?.toLowerCase() === web3CheckoutAddr.toLowerCase()) {
                // If the store is deployed, this transaction should be a call to purchaseWithETH
                try {
                    const iface = new ethers.Interface([
                        "function purchaseWithETH(uint256 trackId, uint8 role, uint256 quantity) payable",
                        "function purchaseWithUSDC(uint256 trackId, uint8 role, uint256 quantity, uint256 amount)"
                    ]);
                    const parsed = iface.parseTransaction({ data: tx.data, value: tx.value });
                    if (parsed && parsed.args) {
                        const paidTrackId = parsed.args.trackId.toString();
                        if (paidTrackId !== trackId.toString()) {
                            return res.status(400).json({ error: "Transaction paid for a different track" });
                        }
                    }
                } catch (e) {
                    console.warn("Could not decode TuneCampCheckout transaction data parameters. Fallback check active.");
                }
            } else if (expectedRecipient && tx?.to?.toLowerCase() !== expectedRecipient.toLowerCase()) {
                console.warn(`Payment verification mismatch: Track ${trackId} expected recipient ${expectedRecipient}, but transaction was sent to ${tx?.to}`);
                return res.status(400).json({ error: "Transaction recipient mismatch" });
            }

            // Verify value (loose check to allow for small price fluctuations if in USD)
            if (track.price && track.price > 0) {
                const paidWei = tx?.value || 0n;
                const paidEth = parseFloat(ethers.formatEther(paidWei));

                let expectedEth = track.price;
                if (track.currency === 'USD') {
                    const rate = await getEthUsdRate();
                    expectedEth = track.price / rate;
                }

                // Allow 5% slippage/margin for price fluctuations
                const margin = expectedEth * 0.05;
                if (paidEth < expectedEth - margin) {
                    // With smart contracts, the contract ensures exact payment based on its inner oracle.
                    // This warning is kept for legacy direct transfers.
                    console.warn(`Potential underpayment: paid ${paidEth} ETH, expected ~${expectedEth} ETH`);
                }
            }

            // Generate single-use unlock code for the user to stream the song's album
            const code = Math.random().toString(36).substring(2, 12).toUpperCase();

            if (track.album_id) {
                database.createUnlockCode(code, track.album_id);
            }

            return res.json({
                success: true,
                code,
                trackId: track.id,
                albumId: track.album_id,
                message: "Transaction verified successfully"
            });

        } catch (error) {
            console.error("Payment verification error:", error);
            res.status(500).json({ error: "Internal server error during verification" });
        }
    });

    /**
     * GET /api/payments/rate/:currency
     * Get the current conversion rate for a currency (only 'USD' supported for now).
     */
    router.get("/rate/:currency", async (req, res) => {
        try {
            const { currency } = req.params;
            if (currency.toUpperCase() !== 'USD') {
                return res.status(400).json({ error: "Unsupported currency" });
            }

            const rate = await getEthUsdRate();
            res.json({ rate });
        } catch (error) {
            console.error("Rate fetch error:", error);
            res.status(500).json({ error: "Failed to fetch rate" });
        }
    });

    /**
     * GET /api/payments/download/:trackId
     * Download a purchased track using an unlock code.
     * Query param: ?code=XXXXXXXXXX
     */
    router.get("/download/:trackId", async (req, res) => {
        try {
            const trackId = parseInt(req.params.trackId as string, 10);
            const code = req.query.code as string;

            if (!code) {
                return res.status(400).json({ error: "Unlock code required" });
            }

            // Validate unlock code
            const validation = database.validateUnlockCode(code);
            if (!validation.valid) {
                return res.status(403).json({ error: "Invalid or expired unlock code" });
            }

            // Get track
            const track = database.getTrack(trackId);
            if (!track) {
                return res.status(404).json({ error: "Track not found" });
            }

            // Verify code is for the correct album
            if (validation.releaseId && track.album_id && validation.releaseId !== track.album_id) {
                return res.status(403).json({ error: "Unlock code is for a different release" });
            }

            if (!track.file_path) {
                return res.status(400).json({ error: "Track has no downloadable file" });
            }

            const trackPath = path.join(musicDir, track.file_path);
            if (!await fs.pathExists(trackPath)) {
                return res.status(404).json({ error: "Track file not found on disk" });
            }

            const filename = path.basename(trackPath);
            res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
            res.setHeader("Content-Type", "application/octet-stream");
            return fs.createReadStream(trackPath).pipe(res);

        } catch (error) {
            console.error("Payment download error:", error);
            res.status(500).json({ error: "Failed to download track" });
        }
    });

    return router;
}
