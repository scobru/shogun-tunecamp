# ADR-001: Implementazione delle Interazioni ActivityPub (Fediverso)

## Status
Accettato / Implementato

## Contesto
Tunecamp è nato come nodo di sola lettura (read-only) nel Fediverso, permettendo la scoperta del catalogo musicale tramite NodeInfo e WebFinger. Tuttavia, per partecipare attivamente al network sociale decentralizzato (Mastodon, Funkwhale, ecc.), era necessario implementare la ricezione e l'elaborazione di attività bidirezionali come `Follow`, `Undo`, `Like` e la capacità di trasmettere (broadcasting) nuovi rilasci ai follower.

Il piano iniziale (documentato in `ACTIVITYPUB_PLAN.md`) proponeva l'aggiunta di tabelle nel database SQLite per tracciare i follower e i like, e l'implementazione di gestori della inbox tramite `@fedify/fedify` per processare queste interazioni.

## Decisione
L'architettura proposta nel piano è valida ed è stata implementata con successo nel sistema attuale (`src/server/database.ts`, `src/server/fedify.ts`, `src/server/activitypub.ts`).

Abbiamo deciso di adottare il seguente design:
1.  **Persistenza Relazionale (SQLite)**: Le relazioni sociali (`followers`, `likes`) e le note in uscita (`ap_notes`) sono tracciate nel database principale (`better-sqlite3`), garantendo la consistenza con i modelli di dominio `Artist` e `Album`.
2.  **Dispatching tramite Fedify**: Abbiamo utilizzato i listener inbox di `@fedify/fedify` per processare in modo sincrono le attività in ingresso (`Follow`, `Accept`, `Like`, `Undo`, `Announce`).
3.  **Gestione Chiavi Crittografiche**: Le chiavi RSA (4096-bit) per le firme HTTP Signature vengono generate asincronamente tramite la thread pool di libuv (`crypto.generateKeyPair`) alla creazione di un nuovo artista, evitando il blocco dell'Event Loop principale.
4.  **Separazione delle Competenze (GunDB vs ActivityPub)**: Manteniamo ActivityPub strettamente per l'interazione esterna col Fediverso (Mastodon, Funkwhale), mentre `GunDB` continua a gestire la scoperta interna e le statistiche dei play (scrobbling) tra i nodi Tunecamp.

## Conseguenze

### Vantaggi
*   **Interoperabilità Piena**: Gli artisti su Tunecamp possono ora costruire un pubblico reale sul Fediverso. Le interazioni (Like) e i Follow vengono materializzati nel database locale.
*   **Architettura Modulare**: Il routing di ActivityPub/Fedify è incapsulato in `src/server/fedify.ts` e isolato dalla logica dell'API Subsonic.
*   **Performance Chiavi**: La pre-generazione asincrona delle chiavi RSA previene blocchi di latenza durante la negoziazione delle firme HTTP.

### Trade-off e Rischi Architetturali (Aree di Miglioramento)
*   **Gestione Sincrona della Inbox**: Attualmente, i listener in `fedify.ts` (es. `on(Follow)`) inviano immediatamente l'`Accept` chiamando esternamente altri server HTTP. Se un server remoto è lento o non disponibile, l'operazione può causare ritardi o fallire senza una chiara strategia di retry (Circuit Breaker assente). In futuro, il *fan-out* dei messaggi (es. `broadcastRelease`) verso centinaia di follower richiederà l'introduzione di una **Background Job Queue** (es. Redis/BullMQ o una tabella SQLite per job eseguiti tramite un cron in-process) per garantire l'invio asincrono e la tolleranza ai guasti di rete.
*   **Coerenza Eventuale (Like)**: I "Like" ricevuti dal Fediverso vengono salvati in SQLite, mentre i commenti o play counter interni vivono in GunDB. C'è il rischio di disallineamento visivo nell'interfaccia utente se non c'è una chiara distinzione concettuale tra "Mi piace dal Web" e "Statistiche interne Tunecamp".
*   **Verifica Sicurezza HTTP Signature**: Il sistema necessita di un rafforzamento formale della verifica delle `HTTP Signature` in ingresso, prevenendo potenziali tentativi di spoofing sui webhook della Inbox.

## Conclusione
Il design architetturale del modulo ActivityPub è solido per la fase attuale e rispetta i confini di contesto (Bounded Contexts). Tuttavia, la scalabilità dell'invio in uscita (broadcasting) è il prossimo collo di bottiglia architetturale che richiederà l'evoluzione da un modello Push sincrono a uno asincrono guidato da code (Event-driven background processing).
