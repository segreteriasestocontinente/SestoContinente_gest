# Fase 5 — Correzioni funzionali e gate di verifica
Ramo: feature/gestionale-2.0-redesign. PR #4 in bozza. Nessun merge, rilascio o SQL di produzione.

## Copertura della Fase 5 (MASTER_SPEC.md §40)
| Requisito | Implementazione | Prova / limite |
|---|---|---|
| Duplicazioni | Identità di cataloghi/edizioni 0019; chiavi idempotenti incassi e revisioni, controllo similarità e prestiti; niente cancellazione storica | CI PostgreSQL con richieste concorrenti e retry; audit storico da eseguire su staging |
| Salvataggi | Risposte verificabili, protezione doppio invio, stati precedenti per iscrizioni, notifiche confermate sotto RLS, caricamenti con esito incerto e protezione scelta obsoleta | Test applicativi e database; Storage/Auth reali ancora da provare |
| Coerenza | Protezione delle date di revisione, prenotazioni parziali, annullamento/presenze, incarichi didattici allineati esplicitamente | CI PostgreSQL; allineamento e ultime modifiche da confermare al nuovo head |
| Permessi | Guard esistenti, RLS e RPC, ruoli espliciti, route e download anonimi negati, isolamento anteprime | Test SQL per socio/staff/istruttore/consigliere e browser anonimi; matrice autenticata end-to-end su Supabase separato resta F7 |
| Contabilità | Saldi autorevoli, pagamento idempotente, capienza del debito e rettifica; nessuna modifica storica implicita | PostgreSQL: concorrenza, eccedenza, saldo e movimento unico |
| Scadenze | Report su fonti complete, conteggi errore distinti da zero, finestre temporali e promemoria condizionali | Test di report e nuova prova idempotenza promemoria/residui; consegna email reale esclusa |
| Registrazione e dichiarazioni | Versioni esatte dei moduli, casella immagini facoltativa, provenienza nuove scelte, confronto atomico, separazione modalità | CI dichiarazioni; nuova domanda positiva da confermare; testi ufficiali e rappresentanza minori da verificare |
| Direttori e allievi | Divieto bidirezionale 0019, nuovo vincolo direttore/responsabile, allineamento esplicito, firma brevetto storica immutata | Test SQL di concorrenza/permessi e azione server; CI nuovo head |
| Calendario | EXCLUDE, rollback atomico, tutela parziali, lock presenze/annullamento | CI PostgreSQL con blocchi realmente rilevati e test adiacenza |
| Inventario e revisioni | RPC idempotente, similarità e conferma distinta, cronologia e stato coerente | CI PostgreSQL, test UI statici; anomalie reali non corrette automaticamente |
| Prestiti | Unicità prestito aperto, restituzione condizionale e stato disponibilità | CI PostgreSQL concorrente |
| Notifiche | Segna letta solo se confermata, idempotenza, isolamento account, cron/email live bloccati nelle anteprime | CI SQL, test mock; nessuna email inviata |

## Migrazioni nuove, in ordine (oltre alle 19 canoniche già presenti)
1. `20261126160000_registra_revisione.sql`
2. `20261126162500_proteggi_prenotazioni_parziali.sql`
3. `20261126163000_coerenza_lezioni_presenze.sql`
4. `20261126163410_dichiarazioni_verificate.sql`
5. `20261126163420_coerenza_direzione.sql`
6. `20261126171000_anteprima_importazione_atomica.sql` (F7)
7. `20261126172500_serializza_prenotazioni_guidate.sql` (F7: lock ordinati sulle corsie)
8. `20261126213000_deroga_istruttori_corsi.sql` (intervento successivo 3.0; dopo il pacchetto unico 2.0, solo su staging autorizzato prima del rilascio del codice). La migrazione introduce audit delle deroghe, RLS staff, RPC e trigger reciproci; non modifica iscrizioni o qualifiche storiche. La CI applica esplicitamente questa migrazione dopo il pacchetto 2.0 e prima del test di integrazione. Non fa parte dello SQL unico 2.0.

Applicare solo dopo verifica staging e backup, nell'ordine canonico e prima di distribuire il codice che usa le nuove RPC. Le vecchie RPC dichiarative sono mantenute per la compatibilità della versione 0019 e il rollback applicativo; le nuove pagine richiedono le nuove RPC e il campo origine. Non rieseguire copie SQL root. Nessuna migrazione di questa lista applicata sul database reale.

## Rollback e conservazione
- Preferire rollback applicativo al commit precedente, lasciando intatte nuove righe, origini dichiarative e audit; verificare la compatibilità con i vincoli nuovi. Le vecchie RPC dichiarative restano disponibili. Non eliminare la colonna origine dopo l'acquisizione di nuove scelte.
- Se occorre ripristinare il comportamento SQL delle nuove dichiarazioni, mantenere la colonna origine e le righe storiche, ripristinare il solo corpo trigger registrazione 0019 solo previa verifica; rimuovere le nuove RPC esclusivamente quando nessun client le usa.
- Per la direzione, ripristino tecnico: rimuovere i trigger coerenza_direttore, coerenza_responsabile, blocca_incarico_responsabile e la RPC allinea_direttore_responsabile solo dopo rollback del client. Non annullare automaticamente gli incarichi confermati.
- Per revisione, prenotazioni e presenze: riferimenti ai corpi originali e istruzioni nel tracker; il rollback riapre le anomalie individuate, va autorizzato e provato su copia. Non rieseguire migrazioni intere per ripristinare funzioni.
- `F5_HISTORICAL_AUDIT.sql` esegue una transazione read-only con conteggi aggregati; non è una migrazione e non elimina nulla. Gli indicatori di revisione simile, prenotazione parziale, più persone collegate e origine sconosciuta richiedono interpretazione, non sono automaticamente errori.

## Limiti non risolvibili dal repository
- Il database PostgreSQL CI emula Auth/Storage, non prova le risposte del servizio Supabase reale o i JWT e la consegna email. Necessari staging isolato, credenziali/ruoli sintetici e collaudo F7.
- I testi approvati e le regole sulla rappresentanza dei minori non sono forniti: le scelte rimangono a livello account, non rappresentano automaticamente un consenso per ciascuna persona. Le origini storiche ignote rimangono NULL. Non attivare raccolta reale senza documenti e decisioni approvate.
- Dati storici reali non accessibili; eseguire audit su copia autorizzata prima di una riconciliazione manuale. Nessuna bonifica distruttiva.
- Upload con esito incerto può lasciare file transitori; nessun processo di cancellazione non autorizzato. Procedura amministrativa da definire dopo verifica Storage.
- Anteprime Vercel non equivalgono a staging isolato; non usare un ambiente collegato a dati reali per test mutanti. Nessuna pubblicazione automatica.

## Evidenze
- CI 45859746348 (checkpoint 53c2f55): entrambi i job success, inclusi test documentali e database consolidato.
- CI 45860457868 (checkpoint bfdb4af): entrambi i job success, inclusi confronto scelta, origine, revoca, retry e separazione modalità. Il precedente errore di fixture registrazione senza marcatori di versione era corretto in 5be5eeb.
- Ultime modifiche direzione, audit storico, scadenze e prova positiva domanda: verificare CI dell'ultimo commit funzionale prima di chiudere il gate automatico. Aggiornare esito effettivo nel tracker. Nessuno screenshot autenticato disponibile.

## Integrazione F7 — anteprima importazioni
La nuova RPC `crea_anteprima_importazione` conserva RLS e inserisce lotto e righe in una sola transazione; nessuna modifica alle importazioni esistenti. I lotti legacy possono essere incompleti: verificare il file originale prima di confermarli, non bonificare automaticamente. La nuova anteprima segnala in quarantena i brevetti storici: 0019 richiede l'edizione e la firma del direttore; non si può dedurre l'effettivo firmatario storico dal direttore odierno. Occorre la verifica documentale e una procedura autorizzata. Rollback: ripristinare il client precedente lasciando la RPC disponibile; rimuoverla solo se inutilizzata. Il precedente flusso non offre atomicità tra batch e righe. Test CI aggiunti; non applicata al DB reale.


## Integrazione F7 — concorrenza calendario
La migrazione `20261126172500_serializza_prenotazioni_guidate.sql` aggiorna esclusivamente quattro corpi funzione esistenti: crea/modifica/annulla lezione e valida_prenotazione_corsia. Nessun aggiornamento righe, schema applicativo, concessione o modifica EXCLUDE. I lock transazionali sulle corsie sono acquisiti in ordine deterministico nei percorsi guidati; il vincolo resta la barriera definitiva. Scritture dirette o combinazioni arbitrarie di transazioni possono ancora ricevere un conflitto temporaneo e devono ricaricare lo stato; nessun retry cieco. Per un rollback SQL autorizzato su copia, ricostruire solo i corpi precedenti con CREATE OR REPLACE: crea da 20261111210400_corsi_guidati.sql, modifica da 20261126162500_proteggi_prenotazioni_parziali.sql, annulla da 20261111210500_calendario_economico.sql, valida da 20261126163000_coerenza_lezioni_presenze.sql. Non rieseguire file interi, non rimuovere EXCLUDE o trigger. Verificare che il rollback non riapra la regressione 40P01; preferire rollback applicativo compatibile.

## Migrazione strutturale 3.1 — solo collaudo
`20261127122235_structural_read_snapshots.sql`: sette nuove RPC di sola lettura, SECURITY INVOKER, search_path vuoto, grant autenticati e revoke anon/PUBLIC. Nessuna modifica alle tabelle, ai dati, ai trigger o alle policy. Applicazione esclusivamente nei database effimeri CI e Supabase locale, con flag SC_STRUCTURAL_RPC=true e tutti i gate di isolamento. Fuori da QA il percorso legacy resta attivo. Nessuna autorizzazione al rilascio o all'applicazione su produzione.

## Seconda migrazione strutturale 3.1 — solo collaudo
`20261127125108_course_calendar_read_snapshots.sql`: due RPC additive di sola lettura per corsi e calendario, SECURITY INVOKER, is_staff, search_path vuoto, grant autenticati e revoke anon/PUBLIC. Nessuna modifica alle tabelle, ai dati, ai trigger o alle policy. SHA256 552dfa8bef6b616c518a195795452e0c41bc12a04c6776b1e88c4092a36acf09 verificato nella CI 46002419418; parità SQL, RLS e restore verificati. Attivazione confinata al QA loopback; fallback legacy e recupero pagine obsolete conservati. Rapporto dettagliato: docs/performance/COURSE_CALENDAR_MIGRATION_3.1.md. Nessuna autorizzazione al rilascio o all'applicazione su produzione.

## Migrazione sicurezza 3.2 — AUD-006 (solo laboratorio)
`20261127225433_audit006_private_medical_classification.sql`: classificatori interni in schema sesto_internal non esposto da PostgREST, OID delle policy preservati, RPC pubblica compatibile con controllo autorizzazioni, protezione trigger invariata. SQL identico al candidato verificato nella CI 46079202987 e replay della migrazione canonica 46079873318, installazione locale e mutazioni 46079873336; job database 46079873280 inclusi applicazione e restore superato. Nessuna modifica alle righe o ai file. Non applicata al database reale. Prima del rilascio verificare Data API hosted, escludere sesto_internal dagli schemi esposti, eseguire backup autorizzato e verificare accessi sanitari/ordinari dopo migrazione. Non ripristinare il vecchio classificatore pubblico come rollback ordinario: riaprirebbe AUD-006; rollback applicativo mantiene compatibilità. Registro e procedura di verifica in docs/audit-3.2/REGISTER.md.

## PR #16 — area personale, corsi e brevetti esterni

- `20261128190043_area_personale_iscrizioni_brevetti.sql`: migrazione generata con CLI e consolidata sul ramo di collaudo; preserva dati storici e colonna capienza legacy, rimuove i soli trigger di capienza, separa richieste e conferme, introduce rettifiche con RLS e controllo di revisione, amplia i brevetti senza alterare la firma interna. Da applicare soltanto in ambiente locale effimero durante il gate; nessuna modifica al database di produzione autorizzata. Verifica su baseline 3.2 con registro certificati, RPC OFF/OFF. Rilascio bloccato fino a esito di tutti i test e approvazione esplicita.
