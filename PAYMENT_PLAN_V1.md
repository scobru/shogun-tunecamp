# 🎵 Tunecamp V1: Piano di Implementazione Pagamenti P2P

Questo documento delinea la strategia e l'architettura tecnica per integrare i pagamenti diretti nell'ecosistema Tunecamp V1, garantendo un'esperienza fluida ("web2-like") ma totalmente decentralizzata.

---

## 1. Visione Generale

L'obiettivo di Tunecamp V1 è permettere ad artisti e label di vendere musica direttamente ai fan senza intermediari, utilizzando la rete **Base Mainnet** per transazioni istantanee a costi irrisori (~$0.002).

### Caratteristiche Chiave:

- **Wallet Nativo**: Derivazione automatica di un indirizzo Ethereum dalle credenziali GunDB (SEA).
- **Pagamento Diretto**: Transazione P2P dall'utente al proprietario dell'istanza (Artista/Label).
- **Zero Attrito**: Nessuna necessità di installare estensioni browser (MetaMask) per gli utenti base.
- **Verifica On-Chain**: Sblocco dei contenuti basato sulla conferma della transazione sulla blockchain.

---

## 2. Architettura Tecnica

### 2.1 Identità e Wallet

Utilizziamo la chiave privata `priv` dell'oggetto SEA di GunDB come "seed" per generare un wallet Ethereum deterministico.

```typescript
import { ethers } from "ethers";

/**
 * Deriva un wallet Ethereum dalla chiave SEA dell'utente Shogun.
 * @param userSEA L'oggetto SEA dell'utente loggato via GunDB.
 */
async function deriveTunecampWallet(userSEA: { priv: string }) {
  // Il campo 'priv' di SEA è un segreto esadecimale compatibile con le chiavi private ETH
  const privateKey = `0x${userSEA.priv}`;
  const wallet = new ethers.Wallet(privateKey);
  return {
    address: wallet.address,
    wallet: wallet,
  };
}
```

### 2.2 Configurazione Istanza (Server-Side)

L'istanza Tunecamp deve conoscere l'indirizzo di ricezione e i parametri di rete.

- **Variabili d'Ambiente (`.env`)**:
  - `TUNECAMP_OWNER_ADDRESS`: Indirizzo del wallet dell'artista/label.
  - `TUNECAMP_RPC_URL`: `https://mainnet.base.org` (o Alchemy/Infura).
  - `TUNECAMP_CURRENCY_CONTRACT`: Indirizzo USDC su Base (`0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913`) se non si usa ETH.

---

## 3. Flusso di Lavoro (Workflow)

### Fase 1: Checkout (Frontend)

Quando l'utente clicca su "Acquista Traccia":

1.  **Check Fondi**: Il sistema interroga il saldo del wallet derivato su Base.
2.  **Esecuzione**: Se i fondi sono sufficienti, viene firmata e inviata la transazione.

```typescript
const tx = await wallet.sendTransaction({
  to: process.env.TUNECAMP_OWNER_ADDRESS,
  value: ethers.parseUnits(trackPrice, "ether"), // Esempio in ETH
});
const receipt = await tx.wait();
```

3.  **Persistenza**: Il TXID (Transaction Hash) viene salvato nello spazio GunDB dell'utente:
    `gun.user().get('purchases').get(trackId).put({ txid: receipt.hash, date: Date.now() })`

### Fase 2: Sblocco Contenuti (Streaming Server)

Per proteggere i file audio, il server di streaming esegue una validazione "Lazy":

1.  L'utente richiede il brano inviando il suo `pub` e il `txid`.
2.  Il server verifica tramite RPC su Base:
    - La transazione esiste ed è confermata.
    - Il `from` della transazione corrisponde all'indirizzo derivato dal `pub` dell'utente.
    - Il `to` corrisponde al `TUNECAMP_OWNER_ADDRESS`.
    - L'importo corrisponde al prezzo del brano.
3.  Se valida, il server avvia lo streaming del file (o fornisce la chiave di decriptazione temporanea).

---

## 4. UI/UX (Material Expressive 2026)

L'interfaccia deve riflettere la modernità del sistema:

- **The Wallet Pill**: Un piccolo indicatore nella barra di navigazione che mostra il saldo in USDC/ETH con un effetto "glow" quando viene ricaricato.
- **Interactive Checkout**: Un'animazione "Expressive Bloom" che espande il tasto d'acquisto in un pannello di conferma trasparente (glassmorphism).
- **Payment Success**: Una notifica tattile e visiva che conferma l'acquisto e aggiunge istantaneamente il brano alla "Libreria" dell'utente.

---

## 5. Sicurezza e Best Practices

1.  **Gestione Chiavi**: La chiave privata derivata deve esistere **solo nella memoria RAM** del browser durante la sessione. Mai scriverla su localStorage o database non criptati.
2.  **Gas Fees**: Essendo su Base, le fee sono minime. Tunecamp mostrerà un avviso se il saldo ETH dell'utente è troppo basso per coprire il gas (~$0.01).
3.  **Fallback MetaMask**: Se l'utente ha MetaMask/Coinbase Wallet installato, Tunecamp offrirà l'opzione di usare il wallet esterno invece di quello nativo derivato.

---

## 6. Roadmap Evolutiva (V2)

- **Smart Contract Splitter**: Distribuzione automatica tra artista, label e hosting provider.
- **Stealth Payments**: Privacy opzionale per i guadagni degli artisti.
- **Subscription Model (ERC-4626)**: Abbonamenti basati su rendimento (stake-to-listen).
- **Gasless Transactions**: Utilizzo di Paymaster per permettere acquisti senza possedere ETH per il gas.

---

_Documento creato da Shogun Agent per Tunecamp Ecosystem._
