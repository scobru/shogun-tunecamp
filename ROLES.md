# Ruoli e Permessi in TuneCamp

Questo documento descrive le diverse figure (ruoli) all'interno di un'istanza TuneCamp, le loro funzionalità e i relativi permessi di sicurezza.

TuneCamp utilizza un sistema di controllo degli accessi basato su ruoli (RBAC) per garantire che ogni utente possa operare solo nell'ambito delle proprie competenze.

---

## 1. Root Admin (Superuser)
Il **Root Admin** è il proprietario dell'istanza o l'amministratore di sistema principale. Corrisponde solitamente al primo utente creato (ID 1).

### Funzionalità Esclusive:
- **Gestione Globale del Sito:** Modifica del nome del sito, descrizione, URL pubblico, loghi e immagini di background.
- **Configurazione Web3:** Impostazione degli indirizzi per i pagamenti in USDC/USDT e contratti NFT.
- **Gestione Utenti Completa:** 
  - Creazione di nuovi amministratori e utenti.
  - Abilitazione/Disabilitazione di account.
  - Reset delle password per qualsiasi utente.
  - Eliminazione di account (tranne se stesso o l'ultimo admin rimasto).
- **Gestione Identità di Sistema:** Accesso e modifica delle chiavi crittografiche GunDB e ActivityPub dell'istanza.
- **Manutenzione di Sistema:** 
  - Consolidamento dei file sul filesystem.
  - Pulizia globale della rete GunDB.
  - Sincronizzazione forzata della rete.
- **Visibilità Totale:** Accesso a tutte le release e statistiche globali di tutti gli artisti presenti nell'istanza.

### Vincoli di Sicurezza:
- Non può essere eliminato.
- Non può essere disabilitato.
- Non può essere declassato a un ruolo inferiore.

---

## 2. Admin (Amministratore Standard)
L'**Admin** è una figura con poteri amministrativi delegati, utile per gestire la comunità e i contenuti senza avere il controllo totale del server.

### Funzionalità:
- **Monitoraggio Utenti:** Può visualizzare la lista degli utenti registrati (ma non può modificarli o eliminarli).
- **Gestione della Rete Federata:**
  - Seguire o smettere di seguire altre istanze/attori ActivityPub.
  - Sincronizzare i contenuti dai peer federati.
- **Gestione Contenuti:** Può gestire le proprie release e i propri post social.
- **Supporto Artisti:** Se assegnato a un profilo artista, può operare come tale.
- **Moderazione Post:** Può visualizzare e gestire post e commenti (se implementato nel sistema di moderazione).

### Vincoli di Sicurezza:
- Non può modificare le impostazioni globali del sito.
- Non può accedere alle chiavi di identità del server.
- Non può resettare password altrui.

---

## 3. Artist / User (Utente Standard)
La figura dell'**Artist** (o utente standard) rappresenta l'utente che pubblica musica e interagisce con la piattaforma. Ogni utente in TuneCamp è associato a un profilo artista.

### Funzionalità:
- **Gestione Discografia:**
  - Caricamento di tracce audio (MP3, FLAC, ecc.).
  - Creazione e modifica di album e formal release.
  - Gestione dei metadati (titoli, generi, licenze).
  - Impostazione dei prezzi (ETH, USD, USDC, USDT) e visibilità (pubblico, privato, non in elenco).
- **Social Feed:** Creazione, modifica ed eliminazione di post per il proprio profilo.
- **Profilo Artista:** Modifica della biografia, link esterni, avatar e immagini di copertina.
- **Statistiche Personali:** Visualizzazione dei dati di ascolto e vendita relativi ai propri contenuti.
- **Accesso Subsonic:** Utilizzo delle credenziali per lo streaming tramite app compatibili con l'API Subsonic.
- **Gestione Password:** Modifica della propria password.

### Vincoli di Sicurezza:
- **Quota Disco:** È soggetto a un limite di spazio su disco (storage quota) configurato dall'amministratore.
- **Attivazione:** Deve essere attivato (`isActive`) da un amministratore per poter effettuare upload o modifiche (se la configurazione lo richiede).
- **Isolamento:** Non può visualizzare o modificare contenuti di altri artisti.
- **Chiavi Private:** Può visualizzare solo le proprie chiavi di identità artista.

---

## Matrice dei Permessi (Sintesi)

| Funzionalità | Root Admin | Admin | Artist/User |
| :--- | :---: | :---: | :---: |
| Modifica Impostazioni Sito | ✅ | ❌ | ❌ |
| Creazione/Eliminazione Utenti | ✅ | ❌ | ❌ |
| Reset Password Altrui | ✅ | ❌ | ❌ |
| Caricamento Musica | ✅ | ✅ | ✅ (se attivo) |
| Gestione Contenuti Propri | ✅ | ✅ | ✅ |
| Gestione Contenuti Altrui | ✅ | ❌ | ❌ |
| Seguire Istanze Remote (AP) | ✅ | ✅ | ❌ |
| Accesso Chiavi Server | ✅ | ❌ | ❌ |
| Gestione Quota Disco | ✅ | ❌ | ❌ |

---

## Verifica della Sicurezza

TuneCamp implementa questi controlli a livello di API:
1. **Middleware JWT:** Ogni richiesta autenticata verifica il ruolo (`isAdmin`) e l'identità (`userId`).
2. **Proprietà dei Contenuti:** Le API di modifica (`PUT`, `DELETE`) verificano che `owner_id` corrisponda al `userId` del richiedente, a meno che quest'ultimo non sia un amministratore.
3. **SSRF Protection:** Le operazioni di rete (ActivityPub follow) sono protette contro attacchi SSRF tramite validazione degli URL.
4. **Sanitizzazione:** I nomi dei file e i metadati vengono sanitizzati per prevenire Path Traversal e attacchi XSS.
5. **Quota Check:** Durante l'upload viene verificato dinamicamente lo spazio disponibile per l'utente prima di accettare i file.
