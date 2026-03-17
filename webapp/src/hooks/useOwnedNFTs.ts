import { useState, useEffect } from 'react';
import { TuneCampNFT, TokenRole, DEPLOYMENTS } from 'shogun-contracts-sdk';
import { WalletService } from '../services/wallet';
import { usePurchases } from './usePurchases';
import API from '../services/api';
import type { Track } from '../types';

export interface OwnedNFT {
    trackId: number;
    title: string;
    artistName: string;
    coverUrl?: string;
    role: TokenRole;
    balance: number;
}

export function useOwnedNFTs(address: string | null) {
    const [ownedNFTs, setOwnedNFTs] = useState<OwnedNFT[]>([]);
    const [loading, setLoading] = useState<boolean>(true);
    const { purchases, loading: purchasesLoading } = usePurchases();
    
    // We also need track metadata
    const [tracks, setTracks] = useState<Record<number, Track>>({});

    useEffect(() => {
        // Fetch all tracks once to have metadata handy
        API.getTracks().then(data => {
            const trackMap: Record<number, Track> = {};
            data.forEach(t => trackMap[t.id] = t);
            setTracks(trackMap);
        }).catch(console.error);
    }, []);

    useEffect(() => {
        if (!address || purchasesLoading || Object.keys(tracks).length === 0) {
            setLoading(false);
            return;
        }

        let isMounted = true;

        const fetchBalances = async () => {
            setLoading(true);
            try {
                // Instantiate the TuneCampNFT contract wrapper
                const provider = WalletService.provider;
                // Currently returning chain 8453 (Base Mainnet) hardcoded for production or via config
                const chainId = (window as any).TUNECAMP_CONFIG?.rpcUrl?.includes('sepolia') ? 84532 : 8453;
                
                // Address comes from our sdk DEPLOYMENTS map
                const nftAddress = DEPLOYMENTS[chainId as keyof typeof DEPLOYMENTS]?.["TuneCampFactory#TuneCampNFT"] as string;
                
                if (!nftAddress) {
                    console.error("TuneCampNFT proxy address not found in ABI deployments for chain", chainId);
                    setLoading(false);
                    return;
                }

                const tuneCampNFT = new TuneCampNFT(provider, undefined, chainId).attach(nftAddress);

                // Prepare to check both LICENSE and OWNERSHIP for each purchased track
                // Since `usePurchases` gives us track IDs the user downloaded/bought on-database
                // we can just check those specific IDs rather than scanning all events.
                const purchasedTrackIds = Array.from(purchases.keys()).map(id => parseInt(id, 10)).filter(id => !isNaN(id));
                const nftsFound: OwnedNFT[] = [];

                // Simple loop, can be optimized to balanceOfBatch if contract supports it (ERC1155 does)
                const accounts: string[] = [];
                const tokenIds: bigint[] = [];
                const lookup: { trackId: number, role: TokenRole }[] = [];

                for (const trackId of purchasedTrackIds) {
                    // Collect potential token IDs
                    const idLicense = await tuneCampNFT.encodeTokenId(trackId, TokenRole.LICENSE);
                    const idOwnership = await tuneCampNFT.encodeTokenId(trackId, TokenRole.OWNERSHIP);
                    
                    accounts.push(address, address);
                    tokenIds.push(idLicense, idOwnership);
                    
                    lookup.push({ trackId, role: TokenRole.LICENSE });
                    lookup.push({ trackId, role: TokenRole.OWNERSHIP });
                }

                if (tokenIds.length > 0) {
                     // Since TuneCampNFT inherits ERC1155, it has balanceOfBatch
                     // Ethers v6 calling
                     const balances: bigint[] = await (tuneCampNFT.contract as any).balanceOfBatch(accounts, tokenIds);
                     
                     balances.forEach((bal, idx) => {
                         if (bal > 0n) {
                             const trackData = tracks[lookup[idx].trackId];
                             nftsFound.push({
                                 trackId: lookup[idx].trackId,
                                 title: trackData?.title || `Track #${lookup[idx].trackId}`,
                                 artistName: trackData?.artistName || "Unknown Artist",
                                 coverUrl: trackData?.coverUrl,
                                 role: lookup[idx].role,
                                 balance: Number(bal)
                             });
                         }
                     });
                }

                if (isMounted) {
                    setOwnedNFTs(nftsFound);
                }
            } catch (err) {
                console.error("Failed to load owned NFTs:", err);
            } finally {
                if (isMounted) {
                    setLoading(false);
                }
            }
        };

        fetchBalances();

        return () => { isMounted = false; };
    }, [address, purchasesLoading, purchases, tracks]);

    return { ownedNFTs, loading };
}
