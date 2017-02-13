// eq3ble library location:
// node_modules/eq3ble/dist

// set time zone
process.env.TZ = 'Europe/Amsterdam'; 

// libraries:
var EQ3BLE = require('eq3ble').default;
var noble = require('noble');
var mqtt = require('mqtt');
var cfg = require('./cfg.js');

var discovered = {};

var connectDate = new Date();
var publishOptions = { qos: 2, retain: true };

var client = mqtt.connect(cfg.mqttServer.address, { username: cfg.mqttServer.username, password: cfg.mqttServer.password, will: { topic: '/eq3_master/status', payload: '0', qos: 2, retain: true } });
client.publish('/eq3_master/status', '1', publishOptions);
client.subscribe('/+/outwish/+');

client.on('message', function (topic, message) {
	logV('New MQTT message: [topic=' + topic + '] [message=' + message.toString() + ']');
	
	var d = new Date();
	if (d.getTime() - connectDate.getTime() > 5000)
		processMessage(topic, message);
});

function processMessage(topic, message) {
	var m = message.toString();
	var i1 = topic.indexOf('/');
	var i2 = topic.indexOf('/', i1+1);
	var btName = topic.substring(i1+1, i2);
	var action = topic.substring(i2+1);

	if (action != 'outwish/wishedTemperature' && action != 'outwish/getInfo')
		return;


	var address;

	if (btName[2] == ':') {
		address = btName;
	} else {
		address = cfg.btNames[btName].address;
		if (!address) {
			logE('[name=' + btName + '] not mapped to address');
			return;
		} else {
	                //logV('[name=' + btName + '] mapped to [address=' + address + ']');
	        }
	}

        if (cfg.btNames[btName].server == cfg.server || !cfg.btNames[btName].server) {

	        var device = discovered[address];
        	if (!device) {
	                logE('Device with [address=' + address + '] not discovered');
	                return;
	        } else {
        	        //logV('Device is already discovered, [rssi=' + device._peripheral.rssi + ']');
	        }

                device.btName = btName;
                if (action == 'outwish/wishedTemperature') {
                        setTemperature(device, m);
                } if (action == 'outwish/getInfo') {
                        getInfo(device);
                }
        } else {
                logV('['+cfg.btNames[btName].address +'] ['+cfg.btNames[btName].name+'] Skipping');
                return;
        }
}

// wait for noble initialization:
noble.on('stateChange', function(state) {
	logV('noble.state: ' + state);
	if (state === 'poweredOn') {
		EQ3BLE.startScanning();
		EQ3BLE.discoverAll(onDiscover);
	} else {
		EQ3BLE.stopScanning();
	}
});


function onDiscover(device) {
	// called for all devices discovered
        var deviceInfo = { address: device.address, rssi: device._peripheral.rssi, uuid: device.uuid };
        device.deviceInfo = deviceInfo;
        discovered[device.address] = device;

	
	var btName = cfg.btNames[device.address].name;
        if (btName) {
		device.btName = btName;
	        logI('['+ device.address +'] ['+ btName +'] Discovered EQ3:' + JSON.stringify(deviceInfo));
        } else {
		device.btName = 'NOT MAPPED';
	        logW('['+ device.address +'] [NOT MAPPED] Discovered EQ3:' + JSON.stringify(deviceInfo));
        }
}

function calcEstimatedTemperature(targetTemperature, valvePosition) {
	var estimatedTemperature = targetTemperature;
	if (valvePosition >= 100)
		estimatedTemperature = targetTemperature - 2.5;
	else if (valvePosition >= 82)
		estimatedTemperature = targetTemperature - 2.0;
	else if (valvePosition >= 60)
		estimatedTemperature = targetTemperature - 1.5;
	else if (valvePosition >= 43)
		estimatedTemperature = targetTemperature - 1.0;
	else if (valvePosition >= 25)
		estimatedTemperature = targetTemperature - 0.5;

	return estimatedTemperature;
}

function processInfo(device, info) {
	var estimatedTemperature = calcEstimatedTemperature(info.targetTemperature);

	logV('['+ device.address +'] ['+device.btName+'] Publishing to MQTT:' + JSON.stringify(info), publishOptions);
	client.publish('/' + device.btName + '/in/rssi', (device._peripheral.rssi * -1).toString(), publishOptions);
	client.publish('/' + device.btName + '/in/targetTemperature', info.targetTemperature.toString(), publishOptions);
	client.publish('/' + device.btName + '/in/valvePosition', info.valvePosition.toString(), publishOptions);
	client.publish('/' + device.btName + '/in/manual', info.status.manual ? '1' : '0', publishOptions);
	client.publish('/' + device.btName + '/in/openWindow', info.status.openWindow ? '1' : '0', publishOptions);
	client.publish('/' + device.btName + '/in/needsHeating', info.valvePosition > 0 ? '1' : '0', publishOptions);
	client.publish('/' + device.btName + '/in/estimatedTemperature', estimatedTemperature.toString(), publishOptions);
	client.publish('/' + device.btName + '/in/lowBattery', info.status.lowBaterry ? '1' : '0', publishOptions);
	client.publish('/' + device.btName + '/in/dst', info.status.dst ? '1' : '0', publishOptions);
	client.publish('/' + device.btName + '/in/holiday', info.status.holiday ? '1' : '0', publishOptions);

	var performanceEnd = new Date();
	var took = performanceEnd.getTime() - device.performanceStart.getTime();
	logI('[' + device.address +'] ['+device.btName+'] Finished in ' + took + ' millis');
	device.disconnect();
}


function setTemperature(device, t) {
	device.performanceStart = new Date();
	logV('['+ device.address +'] ['+device.btName+'] Connecting...');

	device.connectAndSetup().then(() => {
		logV('[VERB]: Setting [temperature=' + t + ']');
		device.setTemperature(t).then((info) => {
                	processInfo(device, info);
                });
        }).catch(function(error) {
            logE('['+ device.address +'] Set Temperature failed! ' + error);
        });        
}

function getInfo(device) {
        device.performanceStart = new Date();
        logV('['+ device.address +'] ['+device.btName+'] Connecting...');

	device.connectAndSetup().then(() => {
		logV('['+ device.address +'] ['+device.btName+'] Getting info...');
        	device.getInfo().then((info) => {
			processInfo(device, info);
		});                
        }).catch(function(error) {
            logE('['+ device.address +'] ['+device.btName+'] Get Info failed! ' + error);
        });
}

// console login

function log(level, message) {
	var date = new Date();
	date.setTime(date.getTime() - date.getTimezoneOffset()*60*1000);

	var d = '['+cfg.server+'][' + date.toISOString().replace(/T/, ' ').replace(/\..+/, '') + ']';
	var l = '[' + level + ']';
	console.log(d + ' ' + l + ' ' + message);
}

function logL(message) {
	log('LOG ', message);
}

function logI(message) {
        log('INFO', message);
}

function logV(message) {
        log('VERB', message);
}

function logE(message) {
        log('ERRO', message);
}

function logW(message) {
        log('WARN', message);
}
