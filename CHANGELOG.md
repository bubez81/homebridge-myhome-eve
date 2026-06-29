# Changelog

## 1.1.9
- Trovata e corretta la causa reale per cui Homebridge UI non riconosceva il blocco di configurazione del plugin (sia nel form che nell'editor JSON grezzo): l'estrazione dell'alias del plugin, che Homebridge UI esegue eseguendo il nostro `index.js` dentro un ambiente fittizio ("mock"), andava in crash perché sia il nostro codice che `fakegato-history` fanno `class X extends Characteristic`, e in quel mock `Characteristic` non è una vera classe. Il crash impediva a Homebridge UI di scoprire che il blocco con `"platform": "LegrandMyHome"` appartiene a questo plugin. Ora l'inizializzazione di queste classi custom è protetta, così la registrazione della piattaforma avviene comunque. Verificato sia contro il mock di estrazione reale sia contro `@homebridge/hap-nodejs` reale.

## 1.1.8
- Rimosso di nuovo `config.schema.json`: anche dopo aver eliminato le `condition` sui campi opzionali (1.1.6), il form di Homebridge UI continuava a non caricare i valori reali della configurazione esistente. Non è stato possibile riprodurre il problema in un ambiente di test completo per individuare la causa esatta nel codice del frontend di Homebridge UI. Per evitare ulteriori tentativi rischiosi, si torna alla modalità di editing manuale del JSON, l'unica verificata sicura. Si valuterà di riprovare in futuro con un ambiente di test più adeguato.

## 1.1.7
- Aggiunto questo file CHANGELOG.md, così Homebridge UI può mostrarlo nel popup di aggiornamento.

## 1.1.6
- Ripristinato `config.schema.json` (form di configurazione in Homebridge UI), questa volta senza `condition` sui campi opzionali dentro l'array `devices` (`scene`/`time`/`manufacturer`/`model` sono ora sempre visibili invece che condizionali), per eliminare un possibile punto di fallimento nel caricamento dei valori esistenti riscontrato in 1.1.3/1.1.4.
- Verificata di nuovo la logica di matching della configurazione lato Homebridge UI.

## 1.1.5
- Rimosso `config.schema.json`: il form introdotto in 1.1.3 non caricava correttamente i valori della configurazione esistente (mostrava i default invece dei dati reali). Nessun dato è andato perso, ma per sicurezza lo schema è stato rimosso fino a una versione verificata.

## 1.1.4
- `MHPowerMeter` usa ora i campi opzionali `manufacturer`/`model` dalla configurazione per popolare `Manufacturer`/`Model` nell'app Home, invece dei valori fissi `"Legrand MyHome"`/`"Power Meter"`.

## 1.1.3
- Aggiunto `config.schema.json` per il form di configurazione in Homebridge UI (poi rivisto in 1.1.5/1.1.6).

## 1.1.2
- Fix crash `Cannot read properties of undefined (reading 'FLOAT')` alla creazione di ogni `MHPowerMeter`: nel fork `@homebridge/hap-nodejs` usato realmente da Homebridge, `Formats` e `Perms` non sono proprietà statiche di `Characteristic`, ma solo export a livello di modulo. Inoltre `Perms` non ha le costanti `READ`/`WRITE` ma solo `PAIRED_READ`/`PAIRED_WRITE`.

## 1.1.1
- Fix crash `Class constructor Service cannot be invoked without 'new'`: i custom Service/Characteristic per Eve sono stati riscritti come vere classi ES6 invece del vecchio pattern `Service.call()` + `util.inherits`, non più compatibile con hap-nodejs moderno.

## 1.1.0
- Fix ordine delle caratteristiche potenza/totale in Eve (creazione sincrona invece della race condition con `setTimeout`).
- Aggiunto storico consumi in Eve tramite `fakegato-history` (dipendenza già presente ma non usata).
- Polling WHO=18 centralizzato in un unico timer sul platform invece di uno per ogni accessorio.
- `_powerIndex` inizializzato una sola volta nel costruttore del platform.
- Riconnessione immediata su fallimento autenticazione OWN/HMAC.
- Fix regex ambient temperature: `[0|14]` → `(?:0|14)`.
