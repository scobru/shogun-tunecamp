import { useState, useEffect, useCallback } from "react";
import { GunAuth } from "../services/gun";

export interface PurchaseRecord {
    txid: string;
    date: number;
    price: string;
    code?: string;
}

/**
 * Hook to load and track the current GunDB user's purchases.
 * Returns a map of trackId -> PurchaseRecord and helper methods.
 */
export function usePurchases() {
    const [purchases, setPurchases] = useState<Map<string, PurchaseRecord>>(new Map());
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const user = GunAuth.user;
        if (!user.is) {
            setLoading(false);
            return;
        }

        const entries = new Map<string, PurchaseRecord>();
        let settled = false;

        // Timeout so we don't stay in "loading" forever if no purchases exist
        const timeout = setTimeout(() => {
            if (!settled) {
                settled = true;
                setLoading(false);
            }
        }, 3000);

        // @ts-ignore — GunDB dynamic API
        user.get("purchases").map().on((data: any, trackId: string) => {
            if (!data || trackId === "_") return;

            // GunDB can return soul/metadata objects — skip them
            if (typeof data !== "object" || !data.txid) return;

            entries.set(String(trackId), {
                txid: data.txid,
                date: data.date,
                price: data.price,
                code: data.code || undefined,
            });

            setPurchases(new Map(entries));

            if (!settled) {
                settled = true;
                setLoading(false);
            }
        });

        return () => {
            clearTimeout(timeout);
            // GunDB `.off()` is not always reliable, but we try
            try {
                // @ts-ignore
                user.get("purchases").map().off();
            } catch {
                // ignore
            }
        };
    }, []);

    const isPurchased = useCallback(
        (trackId: string | number): boolean => purchases.has(String(trackId)),
        [purchases]
    );

    const getCode = useCallback(
        (trackId: string | number): string | undefined =>
            purchases.get(String(trackId))?.code,
        [purchases]
    );

    const getPurchase = useCallback(
        (trackId: string | number): PurchaseRecord | undefined =>
            purchases.get(String(trackId)),
        [purchases]
    );

    return { purchases, loading, isPurchased, getCode, getPurchase };
}
