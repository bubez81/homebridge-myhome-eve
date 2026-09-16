# 🏠 MyHome Eve Power Meter

[![npm version](https://img.shields.io/npm/v/homebridge-myhome-eve.svg)](https://www.npmjs.com/package/homebridge-myhome-eve)
[![homebridge](https://badgen.net/badge/Homebridge/Plugin/green)](https://homebridge.io)
[![npm downloads](https://img.shields.io/npm/dt/homebridge-myhome-eve.svg)](https://www.npmjs.com/package/homebridge-myhome-eve)
[![Pull Request #25](https://img.shields.io/github/pulls/detail/state/angeloxx/homebridge-myhome/25?label=PR%20%2325%20status)](https://github.com/angeloxx/homebridge-myhome/pull/25)
[![License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

Plugin Homebridge per **BTicino MyHome OpenWebNet** (WHO=18, moduli **F520/F523**). In modalità HAP espone i misuratori con le caratteristiche Eve per potenza, consumo totale e storico; in modalità Matter espone i cluster standard di potenza ed energia.

---

## ✨ Caratteristiche

- Potenza istantanea (W) e consumo totale (kWh)
- Compatibilità HAP con **Eve** (grafici/storico)
- Supporto **Matter** per i misuratori, con aggiornamenti di potenza ed energia
- Protocollo **OpenWebNet** (MyHomeServer1 / F454 / MH200N)
- Supporto multiplo per moduli F520/F523 (WHO=18)
- Nessuna dipendenza da Home Assistant o bridge esterni

---

## ⚙️ Installazione
**Homebridge UI** → Plugins → cerca: `homebridge-myhome-eve`  
oppure CLI:
```bash
npm install -g homebridge-myhome-eve
```
Riavvia Homebridge dopo l’installazione.

---

## 🆕 Novità della versione 1.1.16

- Topologia elettrica Matter configurabile per ogni misuratore: predefinita, NODE, SET o TREE.
- Ruoli espliciti nella configurazione, indipendenti dal nome e dall'indirizzo OpenWebNet.
- Log degli aggiornamenti di potenza attivabili per diagnosi e confronti.
- La prova NODE/SET non ha risolto il doppio conteggio in Apple Casa: questa versione espone la topologia e non promette l'esclusione di misuratori dal badge Energia.

## Novità della versione 1.1.13

I misuratori BTicino/MyHome possono essere esposti tramite Matter come `OnOffOutlet`, con i cluster `electricalPowerMeasurement` e `electricalEnergyMeasurement`. La potenza istantanea è stata verificata in Apple Casa; storico ed energia totale in Casa restano da verificare.

Richiede **Homebridge 2.4.0 o successivo**. Abilita Matter sul child bridge del plugin e abbinalo al controller tramite il relativo QR/codice Matter. Gli accessori rappresentano misuratori sempre accesi: i comandi on/off non controllano il carico elettrico.

Dettagli nel [changelog](CHANGELOG.md#1113).

---

## 🧩 Configurazione (`config.json`)
```json
{
  "platform": "LegrandMyHome",
  "ipaddress": "gatewayip",
  "port": 20000,
  "ownpassword": "yourpassword",
  "discovery": false,
  "devices": [
    { "accessory": "MHPowerMeter", "name": "Consumo Generale", "address": "51", "manufacturer": "BTicino", "model": "F523" },
    { "accessory": "MHPowerMeter", "name": "Consumo Lavatrice", "address": "54", "manufacturer": "BTicino", "model": "F520" },
    { "accessory": "MHPowerMeter", "name": "Consumo Forno", "address": "58", "manufacturer": "BTicino", "model": "F520" },
    { "accessory": "MHPowerMeter", "name": "Consumo Lavastoviglie", "address": "510", "manufacturer": "BTicino", "model": "F520" }
  ]
}
```

---

## Topologia elettrica Matter

Nel pannello Homebridge UI, aprire **Dispositivi → misuratore → Topologia elettrica Matter**.
La proprietà `matterPowerTopology` vale solo per `MHPowerMeter`:

| Valore | Significato |
| --- | --- |
| `default` o assente | Scelta standard di Homebridge; nella 2.4.0 viene usata TREE. |
| `node` | Misura riferita all'intero nodo Matter. Non comprende automaticamente altri bridge. |
| `set` | Misura riferita soltanto al proprio endpoint, inserito in `availableEndpoints` durante l'inizializzazione. |
| `tree` | Misura riferita al proprio endpoint e ai suoi endpoint figli; senza figli riguarda soltanto sé stesso. |

Per applicare le scelte individuali attivare **Abilita topologie Matter configurate**
(`matterPowerTopologyExperiment: true`) a livello di piattaforma. Il nome JSON
conserva quello della prova iniziale. Con il flag disattivato (valore predefinito),
Homebridge usa la topologia standard. Non esistono indirizzi o nomi riservati:
anche il ruolo del misuratore generale deve essere configurato esplicitamente.

Esempio, da integrare nella propria piattaforma:

```json
{
  "matterPowerTopologyExperiment": true,
  "matterPowerTopologyDiagnostics": false,
  "devices": [
    { "accessory": "MHPowerMeter", "name": "Consumo Generale", "address": "51", "matterPowerTopology": "node" },
    { "accessory": "MHPowerMeter", "name": "Consumo Lavatrice", "address": "54", "matterPowerTopology": "set" }
  ]
}
```

Riavviare il child bridge del plugin dopo le modifiche. I numeri endpoint vengono
assegnati da Matter e possono cambiare; non vanno inseriti manualmente al posto
degli indirizzi OpenWebNet. SET in questa versione indica solo il proprio endpoint,
non un elenco arbitrario di altri dispositivi.

`matterPowerTopologyDiagnostics: true` abilita i log `[PowerTopology reading]`
con nome, indirizzo, watt e timestamp dopo l'invio all'API Homebridge. Non sono
una conferma di ricezione del controller. Il flag diagnostico è indipendente dalla
topologia e può essere spento mantenendo attive le scelte individuali.
Le righe `[PowerTopology experiment]` all'avvio riportano la topologia configurata.

La topologia descrive l'ambito delle misure, **non è un comando per escluderle dal
totale di Apple Casa**. Nella prova con Generale NODE e sottomisuratori SET il
doppio conteggio è rimasto osservabile. Gli accessori di altri plugin non vengono
modificati. I percorsi HAP/Eve, gli UUID e le unità di misura restano invariati.

---

## 🧠 Come funziona
Il plugin estende la piattaforma `LegrandMyHome` aggiungendo caratteristiche **Eve Power Meter**:
- `CurrentPowerConsumption` → potenza istantanea (W)
- `TotalConsumption` → energia totale (kWh)

In **Eve**, quando il percorso HAP è attivo, ogni accessorio mostra grafico storico e aggiornamento automatico dei consumi. Il percorso Matter espone i valori standard a controller Matter; nella prova con Eve 6.5.1 i consumi Matter non vengono mostrati. Questa versione non implementa lo storico proprietario Eve via Matter.

---

## ✅ Requisiti
| Componente     | Versione minima |
|----------------|------------------|
| Node.js        | ≥ 18.x           |
| Homebridge     | ≥ 2.4.0          |
| MyHomeServer   | Porta 20000      |
| Moduli BTicino | F520 / F523      |

---

## 🧰 Sviluppo
```bash
git clone https://github.com/bubez81/homebridge-myhome-eve.git
cd homebridge-myhome-eve
npm install
npm link
hb-service restart
```

---

## 📜 Licenza
[MIT](LICENSE) © 2025 [Michele Galanti](mailto:bubez81@me.com)

---

## 💬 Supporto
Apri una issue: https://github.com/bubez81/homebridge-myhome-eve/issues

## Test

`npm test` esegue i test di connessione. Per includere il test delle topologie con
le librerie Homebridge installate, indicare la directory del pacchetto:

```sh
HOMEBRIDGE_TEST_ROOT=/percorso/node_modules/homebridge npm test
```

Il test Matter usa storage temporaneo separato dai pairing reali; senza la
variabile viene segnalato come saltato. Verificato con Homebridge 2.4.0 e matter.js 0.17.9.
