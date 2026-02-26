# Roadmap: TuneCamp

Questo documento traccia l'evoluzione di TuneCamp, dai traguardi raggiunti alle visioni future per la piattaforma.

## 🏁 Traguardi Raggiunti (Core)

- **Architettura Ibrida**: Supporto completo per la generazione di siti statici (SSG) e modalità server streaming dinamico.
- **Motore di Parsing**: Estrazione automatica di metadati e generazione di waveform visive.
- **Interfaccia Moderna**: Frontend in React (webapp) con Tailwind CSS 4 e DaisyUI 5.
- **Supporto Subsonic**: Compatibilità con client mobili di terze parti (DSub, Symfonium).
- **Federazione (Base)**: Integrazione iniziale con ActivityPub tramite `fedify`.
- **Sistemi di Accesso**: Supporto per codici di sblocco e download gratuiti gestiti tramite GunDB.

## 🚀 Miglioramenti Recenti (Ultima Fase)

- **Gestione Tracce Esterne**:
  - Implementazione di un layer player invisibile per YouTube/SoundCloud che non blocca le interazioni dell'utente (scrolling).
  - Supporto per servizi esterni generici tramite URL.
  - Sincronizzazione dello stato di riproduzione tra player locale e player esterni.
- **Ottimizzazione Streaming Lossless**:
  - Transcodifica automatica forzata (WAV/FLAC -> MP3) per lo streaming web.
  - Sistema di fallback intelligente: se l'MP3 non è ancora pronto, il server transcodifica il file originale al volo.
  - Separazione chiara tra file di streaming (MP3 ottimizzato) e file di download (WAV alta qualità).
- **Scanner & Parser**:
  - Miglioramento della logica di "pairing" tra file MP3 e WAV.
  - Aggiornamento automatico dei metadati nello static site generator per preferire l'MP3 nel player e il WAV nel tasto download.

## 🛠️ In Sviluppo (Focus Prossimo)

- **Social & Community (GunDB Refinement)**:
  - Potenziamento dei commenti decentralizzati e dei "mi piace".
  - Gestione profili utente estesa (avatar, bio, link social).
- **Federazione Avanzata (ActivityPub)**:
  - Possibilità per gli utenti di seguire artisti direttamente da Mastodon.
  - Notifiche cross-platform per le nuove release.
  - Login tramite account Mastodon/Fediverse esistente (Social Auth).
- **User Experience Webapp**:
  - Supporto PWA (Progressive Web App) completo per installazione su smartphone.
  - Gestione code di riproduzione (Playlist) lato utente persistenti.
  - Traduzione completa dell'interfaccia (I18n).

## 🔮 Visione Futura (Roadmap a Lungo Termine)

- **Pagamenti Diretti**: Integrazione di gateway di pagamento (Stripe/PayPal) per la vendita diretta di album e tracce senza intermediari.
- **Label Mode Avanzato**: Strumenti per etichette discografiche per gestire multipli artisti con dashboard dedicate.
- **Mobile App Native**: Sviluppo di applicazioni native per iOS/Android tramite Capacitor o React Native.
- **Edge Streaming**: Supporto per la distribuzione dei contenuti audio tramite CDN o sistemi di storage S3 compatibili per scalabilità globale.
- **AI-Powered Discovery**: Sistema di raccomandazione locale basato sui gusti dell'utente per scoprire nuovi artisti all'interno della propria rete federata.

---

*Ultimo aggiornamento: Febbraio 2026*
