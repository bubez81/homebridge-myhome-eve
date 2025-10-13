# 🏠 MyHome Eve Power Meter

[![npm version](https://img.shields.io/npm/v/homebridge-myhome-eve.svg)](https://www.npmjs.com/package/homebridge-myhome-eve)
[![homebridge](https://badgen.net/badge/Homebridge/Plugin/green)](https://homebridge.io)
[![npm downloads](https://img.shields.io/npm/dt/homebridge-myhome-eve.svg)](https://www.npmjs.com/package/homebridge-myhome-eve)
[![License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

Plugin Homebridge per **BTicino MyHome OpenWebNet** (WHO=18, moduli **F520/F523**) con compatibilità **Eve**: visualizza **potenza istantanea (W)** e **consumo totale (kWh)** nell’app Eve con grafici e storico.

---

## ✨ Caratteristiche
- Potenza istantanea (W) e consumo totale (kWh)
- Compatibilità nativa con **Eve** (grafici/storico)
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

In **Eve** ogni accessorio mostra grafico storico e aggiornamento automatico dei consumi.

---

## ✅ Requisiti
| Componente     | Versione minima |
|----------------|------------------|
| Node.js        | ≥ 18.x           |
| Homebridge     | ≥ 1.6.x          |
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

