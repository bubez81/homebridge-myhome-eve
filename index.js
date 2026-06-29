var path = require("path");	
var mh = require(path.join(__dirname,'/lib/mhclient'));
var sprintf = require("sprintf-js").sprintf, inherits = require("util").inherits, Promise = require('promise');
var events = require('events'), util = require('util'), fs = require('fs');
var Accessory, Characteristic, Service, UUIDGen, FakeGatoHistoryService, Formats, Perms;

module.exports = function (homebridge) {
	Service = homebridge.hap.Service;
	Characteristic = homebridge.hap.Characteristic;
	Accessory = homebridge.platformAccessory;
	UUIDGen = homebridge.hap.uuid;
	Formats = homebridge.hap.Formats;
	Perms = homebridge.hap.Perms;

	/*
	 * Some tooling (e.g. Homebridge UI's plugin-alias extraction, run in a
	 * sandboxed mock) calls this initializer with a fake `homebridge.hap`
	 * where Characteristic/Service are not real constructors. fakegato-history
	 * and our own custom characteristics both do `class X extends Characteristic`,
	 * which throws in that mock and aborts the whole initializer before
	 * registerPlatform() runs below, so the tool can never learn our
	 * plugin/platform alias. Guard this block so registerPlatform() always
	 * runs; the real HomeKit characteristics/history just won't be set up in
	 * that sandboxed context, which doesn't matter there.
	 */
	try {
		FakeGatoHistoryService = require('fakegato-history')(homebridge);

		/* Try to map Elgato's outlet custom vars */
		LegrandMyHome.CurrentPowerConsumption = class CurrentPowerConsumption extends Characteristic {
			constructor() {
				super('Consumption', 'E863F10D-079E-48FF-8F27-9C2605A29F52');
				this.setProps({
					format: Formats.FLOAT,
					unit: "Watts",
					maxValue: 100000,
					minValue: 0,
					minStep: 0.1,
					perms: [Perms.PAIRED_READ, Perms.NOTIFY]
				});
				this.value = this.getDefaultValue();
			}
		};
		LegrandMyHome.CurrentPowerConsumption.UUID = 'E863F10D-079E-48FF-8F27-9C2605A29F52';

		/* Eve Total Consumption (kWh) */
		LegrandMyHome.TotalConsumption = class TotalConsumption extends Characteristic {
			constructor() {
				super('Total Consumption', 'E863F10C-079E-48FF-8F27-9C2605A29F52');
				this.setProps({
					format: Formats.FLOAT,
					unit: "kWh",
					maxValue: 1000000,
					minValue: 0,
					minStep: 0.01,
					perms: [Perms.PAIRED_READ, Perms.NOTIFY]
				});
				this.value = this.getDefaultValue();
			}
		};
		LegrandMyHome.TotalConsumption.UUID = 'E863F10C-079E-48FF-8F27-9C2605A29F52';

		/* Eve Power Meter service custom */
		LegrandMyHome.PowerMeterService = class PowerMeterService extends Service {
			constructor(displayName, subtype) {
				super(displayName, '00000001-0000-1777-8000-775D67EC4377', subtype);
				this.addCharacteristic(LegrandMyHome.CurrentPowerConsumption);
				this.addCharacteristic(LegrandMyHome.TotalConsumption);
			}
		};
	} catch (e) {
		/* Sandboxed/mock homebridge.hap (e.g. alias extraction tooling): ignore and continue. */
	}

	process.setMaxListeners(0);
	homebridge.registerPlatform("homebridge-myhome", "LegrandMyHome", LegrandMyHome);

};

class LegrandMyHome {
	constructor(log, config, api) {
		this.log = log;
		this.config = config || {};
		this.api = api;
		this.ready = false;
		this.devices = [];
		this.lightBuses = [];
		this._powerIndex = new Map();
		this.controller = new mh.MyHomeClient(config.ipaddress, config.port, config.ownpassword, this);
		this.config.devices.forEach(function (accessory) {
			this.log.info("LegrandMyHome: adds accessory");
			accessory.parent = this;
			if (accessory.accessory == 'MHScene') this.devices.push(new MHScene(this.log,accessory))
			if (accessory.accessory == 'MHRelay') this.devices.push(new MHRelay(this.log,accessory))
			if (accessory.accessory == 'MHBlind') this.devices.push(new MHBlind(this.log,accessory))
			if (accessory.accessory == 'MHBlindAdvanced') this.devices.push(new MHBlindAdvanced(this.log,accessory))
			if (accessory.accessory == 'MHOutlet') this.devices.push(new MHRelay(this.log,accessory))
			if (accessory.accessory == 'MHRelayLight') this.devices.push(new MHRelay(this.log,accessory))
			if (accessory.accessory == 'MHDimmer') this.devices.push(new MHDimmer(this.log,accessory))
			if (accessory.accessory == 'MHThermostat') this.devices.push(new MHThermostat(this.log,accessory))
			if (accessory.accessory == 'MHExternalThermometer') this.devices.push(new MHThermometer(this.log,accessory))
			if (accessory.accessory == 'MHContactSensor') this.devices.push(new MHContactSensor(this.log,accessory))
			/* if (accessory.accessory == 'MHButton') this.devices.push(new MHButton(this.log,accessory)) */
			if (accessory.accessory == 'MHPowerMeter') this.devices.push(new MHPowerMeter(this.log,accessory))
		}.bind(this));
		this.log.info("LegrandMyHome for MyHome Gateway at " + config.ipaddress + ":" + config.port);
		this.controller.start();

		/* Centralized WHO=18 polling: a single timer refreshes all power meters,
		   instead of one setInterval per accessory hammering the gateway independently. */
		this._who18Timer = setInterval(function() {
			this._powerIndex.forEach(function(accessory) {
				try { this.controller.getInstantPower(accessory.address); } catch(e) {}
				try { this.controller.getEnergyTotal(accessory.address); } catch(e) {}
			}.bind(this));
		}.bind(this), 60000);
	}

	onMonitor(_frame) {

	}

	onConnect() {
		this.devices.forEach(function (accessory) {
			if (accessory.thermostatService !== undefined) this.controller.getThermostatStatus(accessory.address);
			if (accessory.contactSensorService !== undefined) this.controller.getContactState(accessory.address);
			if (accessory.windowCoveringPlusService !== undefined) this.controller.getAdvancedBlindSate(accessory.address);
		}.bind(this));
	}

	onRelay(_address,_onoff) {
		this.devices.forEach(function(accessory) {
			if (accessory.address == _address && accessory.lightBulbService !== undefined) {
				accessory.power = _onoff;
				accessory.lightBulbService.getCharacteristic(Characteristic.On).getValue(null);
			}
		}.bind(this));
	}

	onDimmer(_address,_level) {
		this.devices.forEach(function(accessory) {
			if (accessory.address == _address && accessory.lightBulbService !== undefined) {
				accessory.brightness = _level;
				accessory.lightBulbService.getCharacteristic(Characteristic.Brightness).getValue(null);
			}
		}.bind(this));		
	}

	onThermostat(_address,_measure,_level) {
		this.devices.forEach(function(accessory) {
			if (accessory.address == _address && accessory.thermostatService !== undefined) {
				switch(_measure) {
					case "AMBIENT": accessory.ambient = _level; accessory.thermostatService.getCharacteristic(Characteristic.CurrentTemperature).getValue(null); break;
					case "SETPOINT": accessory.setpoint = _level; accessory.thermostatService.getCharacteristic(Characteristic.TargetTemperature).getValue(null); break;
					case "HEATING": accessory.heating = _level; accessory.thermostatService.getCharacteristic(Characteristic.CurrentHeatingCoolingState).getValue(null); break;
					case "COOLING": accessory.cooling = _level; accessory.thermostatService.getCharacteristic(Characteristic.CurrentHeatingCoolingState).getValue(null); break;
				}
			}
		}.bind(this));		
	}	

	onThermometer(_address,_measure,_level) {
		this.devices.forEach(function(accessory) {
			if (accessory.address == _address && accessory.thermometerService !== undefined) {
				if (_measure == "AMBIENT") {
					accessory.ambient = _level;
					accessory.thermometerService.getCharacteristic(Characteristic.CurrentTemperature).getValue(null);
				}
			}
		}.bind(this));		
	}	

	/* WHO=18 callbacks (power / total energy) */
	onPower(_where, _watts) {
		if (this._powerIndex) {
			const acc = this._powerIndex.get(String(_where));
			if (acc && typeof acc.updatePower === 'function') acc.updatePower(_watts);
		}
	}
	onEnergyTotal(_where, _wh) {
		if (this._powerIndex) {
			const acc = this._powerIndex.get(String(_where));
			if (acc && typeof acc.updateEnergyWh === 'function') acc.updateEnergyWh(_wh);
		}
	}

	accessories(callback) {
		this.log.debug("LegrandMyHome (accessories readed)");
		callback(this.devices);
	}
}

class MHScene {
	constructor(log, config) {
		this.config = config || {};
		this.mh = config.parent.controller;
		this.name = config.name;
		this.address = config.address;
		this.displayName = config.name;
		this.UUID = UUIDGen.generate(sprintf("scene-%s-%d",config.address,config.scene));
		this.log = log;
		this.scene = config.scene;
		this.log.info(sprintf("LegrandMyHome::MHScene create object: %s", this.address));
	}

	getServices() {
		var service = new Service.AccessoryInformation();
		service
			.setCharacteristic(Characteristic.Name, this.name)
			.setCharacteristic(Characteristic.Manufacturer, "Legrand MyHome")
			.setCharacteristic(Characteristic.Model, "Scenario")
			.setCharacteristic(Characteristic.SerialNumber, "Address " + this.address);

		this.statelessSwitch = new Service.Switch(this.name);
		this.statelessSwitch.getCharacteristic(Characteristic.On)
			.on('set', (value,callback) => {
				this.log.info(sprintf("setOn %s = %s",this.address, value));

				if (value) {
					setTimeout(function() {
						this.mh.sceneCommand(this.address,this.scene);
					}.bind(this), 400);
				}
				setTimeout(function() {
					this.statelessSwitch.getCharacteristic(Characteristic.On).updateValue(0);
				}.bind(this), 500);
				callback(null);
			})
			.on('get', (callback) => {
				this.log.info(sprintf("getOn %s",this.address));
				callback(null,0);
			});
		return [service, this.statelessSwitch];
	}	
}

class MHRelay {
	constructor(log, config) {
		this.config = config || {};
		this.mh = config.parent.controller;
		this.name = config.name;
		this.address = config.address;
		this.displayName = config.name;
		this.UUID = UUIDGen.generate(sprintf("relay-%s",config.address));
		this.log = log;
		
		this.power = 0;
		this.log.info(sprintf("LegrandMyHome::MHRelay create object: %s", this.address));
	}

	getServices() {
		var service = new Service.AccessoryInformation();
		service
			.setCharacteristic(Characteristic.Name, this.name)
			.setCharacteristic(Characteristic.Manufacturer, "Legrand MyHome")
			.setCharacteristic(Characteristic.Model, "Relay")
			.setCharacteristic(Characteristic.SerialNumber, "Address " + this.address);

		this.lightBulbService = new Service.Lightbulb(this.name);
		this.lightBulbService.getCharacteristic(Characteristic.On)
			.on('set', (value,callback) => {
				this.log.info(sprintf("setOn %s = %s",this.address, value));
				this.mh.relayCommand(this.address,value);
				callback(null);
			})
			.on('get', (callback) => {
				this.log.info(sprintf("getOn %s",this.address));
				callback(null,this.power);
			});
		return [service, this.lightBulbService];
	}	
}

class MHBlind {
	constructor(log, config) {
		this.config = config || {};
		this.mh = config.parent.controller;
		this.name = config.name;
		this.address = config.address;
		this.displayName = config.name;
		this.UUID = UUIDGen.generate(sprintf("blind-%s",config.address));
		this.log = log;

		this.state = "STOP";
		this.log.info(sprintf("LegrandMyHome::MHBlind create object: %s", this.address));
	}

	getServices() {
		var service = new Service.AccessoryInformation();
		service
			.setCharacteristic(Characteristic.Name, this.name)
			.setCharacteristic(Characteristic.Manufacturer, "Legrand MyHome")
			.setCharacteristic(Characteristic.Model, "F411 - Simple Blind")
			.setCharacteristic(Characteristic.SerialNumber, "Address " + this.address);

		this.windowCoveringService = new Service.WindowCovering(this.name);
		this.windowCoveringService.getCharacteristic(Characteristic.CurrentPosition)
			.on('get', (callback) => {
				this.log.info(sprintf("position %s = %s",this.address, this.state));
				callback(null, 50);
			})
		this.windowCoveringService.getCharacteristic(Characteristic.TargetPosition)
			.on('set', (value,callback) => {
				this.log.info(sprintf("setTargetPosition %s = %s",this.address, value));
				this.mh.simpleBlindCommand(this.address, (value<50)?2:1);
				if (this.stopTimer != null) clearTimeout(this.stopTimer);
				this.stopTimer = setTimeout(function() {
					this.mh.simpleBlindCommand(this.address, 0);
				}.bind(this), 2000);
				callback(null);
			});
		this.windowCoveringService.getCharacteristic(Characteristic.PositionState)
			.on('get', (callback) => {
				callback(null, (this.state == "STOP")?Characteristic.PositionState.STOPPED:((this.state == "UP")?Characteristic.PositionState.INCREASING:Characteristic.PositionState.DECREASING));
			});
		return [service, this.windowCoveringService];
	}	
}

class MHBlindAdvanced {
	constructor(log, config) {
		this.config = config || {};
		this.mh = config.parent.controller;
		this.name = config.name;
		this.address = config.address;
		this.displayName = config.name;
		this.UUID = UUIDGen.generate(sprintf("blindadvanced-%s",config.address));
		this.log = log;

		this.state = "STOP";
		this.currentPosition = 0;
		this.targetPosition = 0;
		this.log.info(sprintf("LegrandMyHome::MHBlindAdvanced create object: %s", this.address));
	}

	getServices() {
		var service = new Service.AccessoryInformation();
		service
			.setCharacteristic(Characteristic.Name, this.name)
			.setCharacteristic(Characteristic.Manufacturer, "Legrand MyHome")
			.setCharacteristic(Characteristic.Model, "F401 - Advanced Blind")
			.setCharacteristic(Characteristic.SerialNumber, "Address " + this.address);

		this.windowCoveringPlusService = new Service.WindowCovering(this.name);
		this.windowCoveringPlusService.getCharacteristic(Characteristic.CurrentPosition)
			.on('get', (callback) => {
				this.log.info(sprintf("position %s = %s",this.address, this.currentPosition));
				callback(null, this.currentPosition);
			})
		this.windowCoveringPlusService.getCharacteristic(Characteristic.TargetPosition)
			.on('set', (value,callback) => {
				this.log.info(sprintf("setTargetPosition %s = %s",this.address, value));
				this.targetPosition = value;
				this.mh.advancedBlindCommand(this.address,value);
				callback(null);
			})
			.on('get', (callback) => {
				this.log.info(sprintf("getTargetPosition %s = %s",this.address, this.targetPosition));
				callback(null, this.targetPosition);
			});
		this.windowCoveringPlusService.getCharacteristic(Characteristic.PositionState)
			.on('get', (callback) => {
				callback(null, (this.state == "STOP")?Characteristic.PositionState.STOPPED:((this.state == "UP")?Characteristic.PositionState.INCREASING:Characteristic.PositionState.DECREASING));
			});
		return [service, this.windowCoveringPlusService];
	}	

	evaluatePosition() {
		this.windowCoveringPlusService.getCharacteristic(Characteristic.CurrentPosition).getValue(null);
		this.windowCoveringPlusService.getCharacteristic(Characteristic.TargetPosition).getValue(null);
	}	
}

class MHDimmer {
	constructor(log, config) {
		this.config = config || {};
		this.mh = config.parent.controller;
		this.name = config.name;
		this.address = config.address;
		this.displayName = config.name;
		this.UUID = UUIDGen.generate(sprintf("dimmer-%s",config.address));
		this.log = log;

		this.brightness = 0;
		this.power = 0;
		this.log.info(sprintf("LegrandMyHome::MHDimmer create object: %s", this.address));
	}

	getServices() {
		var service = new Service.AccessoryInformation();
		service
			.setCharacteristic(Characteristic.Name, this.name)
			.setCharacteristic(Characteristic.Manufacturer, "Legrand MyHome")
			.setCharacteristic(Characteristic.Model, "F417/418 - Dimmer")
			.setCharacteristic(Characteristic.SerialNumber, "Address " + this.address);

		this.lightBulbService = new Service.Lightbulb(this.name);
		this.lightBulbService.getCharacteristic(Characteristic.On)
			.on('set', (value,callback) => {
				this.log.info(sprintf("setOn %s = %s",this.address,  value));
				this.mh.dimmerCommand(this.address,(value)?this.brightness:0);
				callback(null);
			})
			.on('get', (callback) => {
				this.log.info(sprintf("getOn %s",this.address));
				callback(null,(this.brightness>0)?true:false);
			});
		this.lightBulbService.getCharacteristic(Characteristic.Brightness)
			.on('set', (value,callback) => {
				this.log.info(sprintf("setBrightness %s = %s",this.address,  value));
				this.brightness = value;
				this.mh.dimmerCommand(this.address,value);
				callback(null);
			})
			.on('get', (callback) => {
				this.log.info(sprintf("getBrightness %s",this.address));
				callback(null,this.brightness);
			});
		return [service, this.lightBulbService];
	}	
}

class MHThermostat {
	constructor(log, config) {
		this.config = config || {};
		this.mh = config.parent.controller;
		this.name = config.name;
		this.address = config.address;
		this.displayName = config.name;
		this.UUID = UUIDGen.generate(sprintf("thermostat-%s",config.address));
		this.log = log;

		this.ambient = 20;
		this.setpoint = 20;
		this.heating = false;
		this.cooling = false;
		this.log.info(sprintf("LegrandMyHome::MHThermostat create object: %s", this.address));
	}

	getServices() {
		var service = new Service.AccessoryInformation();
		service
			.setCharacteristic(Characteristic.Name, this.name)
			.setCharacteristic(Characteristic.Manufacturer, "Legrand MyHome")
			.setCharacteristic(Characteristic.Model, "F430 - Thermostat")
			.setCharacteristic(Characteristic.SerialNumber, "Address " + this.address);

		this.thermostatService = new Service.Thermostat(this.name);
		this.thermostatService.getCharacteristic(Characteristic.TargetHeatingCoolingState)
			.on('set', (value,callback) => {
				this.log.info(sprintf("setHeating %s = %s",this.address,  value));
				callback(null);
			})
			.on('get', (callback) => {
				let ret = Characteristic.TargetHeatingCoolingState.OFF;
				if (this.heating) ret = Characteristic.TargetHeatingCoolingState.HEAT;
				if (this.cooling) ret = Characteristic.TargetHeatingCoolingState.COOL;
				this.log.info(sprintf("getTargetHeatingCoolingState %s",this.address));
				callback(null,ret);
			});
		this.thermostatService.getCharacteristic(Characteristic.CurrentHeatingCoolingState)
			.on('get', (callback) => {
				let ret = Characteristic.CurrentHeatingCoolingState.OFF;
				if (this.heating) ret = Characteristic.CurrentHeatingCoolingState.HEAT;
				if (this.cooling) ret = Characteristic.CurrentHeatingCoolingState.COOL;
				this.log.info(sprintf("getCurrentHeatingCoolingState %s",this.address));
				callback(null,ret);
			});
		this.thermostatService.getCharacteristic(Characteristic.CurrentTemperature)
			.on('get', (callback) => {
				this.log.info(sprintf("getCurrentTemperature %s = %s",this.address, this.ambient));
				callback(null, this.ambient);
			});
		this.thermostatService.getCharacteristic(Characteristic.TargetTemperature)
			.on('set', (value,callback) => {
				this.log.info(sprintf("setTargetTemperature %s = %s",this.address, value));
				this.mh.setSetPoint(this.address,value);
				callback(null);
			})
			.on('get', (callback) => {
				this.log.info(sprintf("getTargetTemperature %s = %s",this.address, this.setpoint));
				callback(null, this.setpoint);
			});
		this.thermostatService.getCharacteristic(Characteristic.TemperatureDisplayUnits)
			.on('get', (callback) => {
				this.log.info(sprintf("getTemperatureDisplayUnits %s",this.address));
				callback(null, 0);
			});
		return [service, this.thermostatService];
	}	
}

class MHThermometer {
	constructor(log, config) {
		this.config = config || {};
		this.mh = config.parent.controller;
		this.name = config.name;
		this.address = config.address;
		this.displayName = config.name;
		this.UUID = UUIDGen.generate(sprintf("thermometer-%s",config.address));
		this.log = log;

		this.ambient = 20;
		this.log.info(sprintf("LegrandMyHome::MHThermometer create object: %s", this.address));
	}

	getServices() {
		var service = new Service.AccessoryInformation();
		service
			.setCharacteristic(Characteristic.Name, this.name)
			.setCharacteristic(Characteristic.Manufacturer, "Legrand MyHome")
			.setCharacteristic(Characteristic.Model, "External Thermometer")
			.setCharacteristic(Characteristic.SerialNumber, "Address " + this.address);

		this.thermometerService = new Service.TemperatureSensor(this.name);
		this.thermometerService.getCharacteristic(Characteristic.CurrentTemperature)
			.on('get', (callback) => {
				this.log.info(sprintf("getCurrentTemperature %s = %s",this.address, this.ambient));
				callback(null, this.ambient);
			});
		return [service, this.thermometerService];
	}	
}

class MHContactSensor {
	constructor(log, config) {
		this.config = config || {};
		this.mh = config.parent.controller;
		this.name = config.name;
		this.address = config.address;
		this.displayName = config.name;
		this.UUID = UUIDGen.generate(sprintf("sensor-%s",config.address));
		this.log = log;

		this.value = 0;
		this.log.info(sprintf("LegrandMyHome::MHContactSensor create object: %s", this.address));
	}

	getServices() {
		var service = new Service.AccessoryInformation();
		service
			.setCharacteristic(Characteristic.Name, this.name)
			.setCharacteristic(Characteristic.Manufacturer, "Legrand MyHome")
			.setCharacteristic(Characteristic.Model, "DryContact F428")
			.setCharacteristic(Characteristic.SerialNumber, "Address " + this.address);

		this.contactSensorService = new Service.ContactSensor(this.name);
		this.contactSensorService.getCharacteristic(Characteristic.ContactSensorState)
			.on('get', (callback) => {
				this.log.info(sprintf("getContactSensorState %s = %s",this.address, this.value));
				callback(null, (this.value)?Characteristic.ContactSensorState.CONTACT_NOT_DETECTED:Characteristic.ContactSensorState.CONTACT_DETECTED);
			});
		return [service, this.contactSensorService];
	}	
}

class MHPowerMeter {
	constructor(log, config) {
		this.config = config || {};
		this.mh = config.parent.controller;
		this.name = config.name;
		this.address = config.address;
		this.displayName = config.name;
		this.UUID = UUIDGen.generate(sprintf("powermeter-v2-%s",config.address));
		this.log = log;
		this.value = 0; // instant power in W
		this.energyKwh = 0; // total energy in kWh
		this.log.info(sprintf("LegrandMyHome::MHPowerMeter create object: %s", this.address));
		// register in platform index for WHO=18 updates (polling is centralized in LegrandMyHome)
		if (this.config && this.config.parent) {
			this.config.parent._powerIndex.set(String(this.address), this);
		}
		try { this.mh.getInstantPower(this.address); } catch(e) {}
		try { this.mh.getEnergyTotal(this.address); } catch(e) {}
	}
        getServices() {
                var service = new Service.AccessoryInformation();
                service
                        .setCharacteristic(Characteristic.Name, this.name)
                        .setCharacteristic(Characteristic.Manufacturer, this.config.manufacturer || "Legrand MyHome")
                        .setCharacteristic(Characteristic.Model, this.config.model || "Power Meter")
                        .setCharacteristic(Characteristic.SerialNumber, "Address " + this.address);

                // Servizio custom Eve Power Meter (layout originale)
                this.powerMeterService = new LegrandMyHome.PowerMeterService(this.name);
                this.powerMeterService.UUID = UUIDGen.generate(sprintf("powermeter-v2-%s", this.address));

                // Entrambe le caratteristiche vengono create subito, nello stesso ordine per ogni
                // accessorio (potenza istantanea prima, consumo totale dopo): l'ordine mostrato da Eve
                // viene fissato al primo pairing, quindi deve essere deterministico già da qui.
                this.currentChar = this.powerMeterService.getCharacteristic(LegrandMyHome.CurrentPowerConsumption)
                        || this.powerMeterService.addCharacteristic(LegrandMyHome.CurrentPowerConsumption);
                this.totalChar = this.powerMeterService.getCharacteristic(LegrandMyHome.TotalConsumption)
                        || this.powerMeterService.addCharacteristic(LegrandMyHome.TotalConsumption);
                this.powerMeterService.characteristics = [this.currentChar, this.totalChar];

                this.currentChar.on('get', (callback) => {
                        this.log.info(sprintf("getCurrentPower %s = %s W", this.address, this.value));
                        callback(null, this.value);
                });

                this.totalChar.on('get', (callback) => {
                        this.log.info(sprintf("getTotalEnergy %s = %s kWh", this.address, this.energyKwh));
                        callback(null, this.energyKwh);
                });

                // Storico per Eve (grafici/andamento nel tempo)
                this.loggingService = new FakeGatoHistoryService('energy', this, { storage: 'fs' });

                return [service, this.powerMeterService, this.loggingService];
        }

        updatePower(watts) {
                this.value = parseFloat(watts);
                if (this.currentChar) this.currentChar.updateValue(this.value);
                if (this.loggingService) this.loggingService.addEntry({ time: Math.round(Date.now() / 1000), power: this.value });
        }

        updateEnergyWh(wh) {
                const kwh = parseFloat(wh) / 1000.0;
                this.energyKwh = kwh;
                if (this.totalChar) this.totalChar.updateValue(kwh);
        }
}

class MHButton {
	constructor(log, config) {
		this.config = config || {};
		this.mh = config.parent.controller;
		this.name = config.name;
		this.address = config.address;
		this.displayName = config.name;
		this.UUID = UUIDGen.generate(sprintf("button-%s",config.address));
		this.log = log;

		this.value = 0;
		this.log.info(sprintf("LegrandMyHome::MHButton (CEN/CEN+) create object: %s", this.address));
	}

	getServices() {
		var service = new Service.AccessoryInformation();
		service
			.setCharacteristic(Characteristic.Name, this.name)
			.setCharacteristic(Characteristic.Manufacturer, "Legrand MyHome")
			.setCharacteristic(Characteristic.Model, "CEN/CEN+ Button")
			.setCharacteristic(Characteristic.SerialNumber, "Address " + this.address);

		this.statelessSwitch = new Service.Switch(this.name);
		this.statelessSwitch.getCharacteristic(Characteristic.On)
			.on('set', (value,callback) => {
				this.log.info(sprintf("setOn %s = %s",this.address, value));
				callback(null);
			})
			.on('get', (callback) => {
				this.log.info(sprintf("getOn %s",this.address));
				callback(null,0);
			});
		return [service, this.statelessSwitch];
	}	
}
