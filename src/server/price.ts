import fetch from 'node-fetch';

interface PriceCache {
    rate: number;
    timestamp: number;
}

let cache: PriceCache | null = null;
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

/**
 * Fetch the current ETH pool price in USD.
 * Uses a public API (CoinGecko) with local caching.
 */
export async function getEthUsdRate(): Promise<number> {
    const now = Date.now();

    // Return cached rate if valid
    if (cache && (now - cache.timestamp) < CACHE_DURATION) {
        return cache.rate;
    }

    try {
        // Using CoinGecko simple price API
        const response = await fetch('https://api.coingecko.com/api/v3/simple/price?ids=ethereum&vs_currencies=usd');

        if (!response.ok) {
            await drainResponse(response);
            throw new Error(`Price API returned focus status: ${response.status}`);
        }

        const data = await response.json() as any;
        const rate = data?.ethereum?.usd;

        if (!rate) {
            // response.json() already consumed the body, but it's good to be safe if json() had failed
            throw new Error('Invalid response from price API');
        }

        // Update cache
        cache = {
            rate,
            timestamp: now
        };

        return rate;
    } catch (error) {
        console.error('Failed to fetch ETH price:', error);

        // If we have an expired cache, return it as fallback instead of failing
        if (cache) {
            console.warn('Using expired price cache as fallback');
            return cache.rate;
        }

        // Hardcoded fallback for extreme failure
        return 2500;
    }
}
