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

## 🆕 Novità della versione 1.1.15

- Ridotti i log degli aggiornamenti Matter riusciti: vengono mantenuti solo gli errori.
- Ricomposizione dei frame TCP WHO=18 e riconnessione più robusta.
- Il percorso Matter usa esclusivamente i cluster standard supportati dall'API Homebridge.

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
