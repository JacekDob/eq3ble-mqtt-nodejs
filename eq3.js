#!/usr/bin/env node

// libraries:
var EQ3BLE = require('eq3ble').default;
var noble = require('noble');
var NobleDevice = require('noble-device');
var mqtt = require('mqtt');
var sleep = require('sleep');
var exec = require('child_process').exec;
var os = require('os');
var util = require('util');

// configuration:
var cfg = require('./cfg.js');

// bluetooth services
var serviceUUID = exports.serviceUuid = '3e135142654f9090134aa6ff5bb77046';
var serviceUUIDs = [serviceUUID];


// global variables
var scanStarted = new Date();

var btNames = cfg.btNames;

var discovered = {};
var servers = {};

var connectDate = new Date();
var publishOptions = {
	qos: 2,
	retain: true
};
var publishOptionsLow = {
	qos: 0,
	retain: false
};

var queue = [];
var queueFailed = [];

var processing = false;

var timeoutCount = 0;

var notDiscoveredCount = 0;

var timeoutId;

var scanTimeoutId;

var scanCount = 0;


function setServerIdx() {
	if (!cfg.server) {
		if (!cfg.servers) {
			cfg.server = 1;
		} else {
			var ifaces = os.networkInterfaces();

			for (var ifname in ifaces) {
				for (var ifaceidx in ifaces[ifname]) {
					var iface = ifaces[ifname][ifaceidx];
					if ('IPv4' !== iface.family || iface.internal !== false) {
						// skip over internal (i.e. 127.0.0.1) and non-ipv4 addresses
						break;
					}
					if (cfg.servers[iface.address]) {
						cfg.server = cfg.servers[iface.address];
						return;
					}
				}
			}
		}
	}
}

function getByAddress(address) {
	var p = btNames;
	for (var key in p) {
		if (p.hasOwnProperty(key)) {
			if (p[key].address == address) {
				return p[key];
			}
		}
	}
}

function processDiscovery(topic, message) {
	var name = (topic.split('/'))[1];
	var key = (topic.split('/'))[4];

	if (!btNames[name])
		btNames[name] = {};

	if (!key && btNames[name].discovery) {
		delete btNames[name].discovery.server;
		delete btNames[name].discovery.rssi;
		return;
	}

	message = message.toString();

	if (message == '' && btNames[name] && btNames[name].discovery) {
		delete btNames[name].discovery[key];
		return;
	}

	if (!btNames[name].discovery)
		btNames[name].discovery = {};

	btNames[name].discovery[key] = message;

	if (btNames[name].discovery.server && btNames[name].discovery.rssi) {
		//logV('['+name+'] ['+btNames[name].discovery.rssi+'dBm] Assigned server: ' + btNames[name].discovery.server);
	}
}

function processMaster(topic, message) {
	var server = (topic.split('/'))[2];
	var command = (topic.split('/'))[3];

	if (command == 'exec') {
		if (server == cfg.server) {
			processExec(message);
		}
		return;
	}
	if (command == 'command') {
		if (message == 'restart') {
			restart();
			return;
		}
	}
	if (command == 'command') {
		if (message == 'scan') {
			scanSequence();
			return;
		}
	}
	if (command == 'command') {
		if (message == 'btrestart') {
			restartBluetoothAdapter();
			return;
		}
	}

	var status = message.toString();
	servers[server] = {};
	servers[server].status = status;
	logV('Servers: ' + JSON.stringify(servers));
	if (status == 0 && server != cfg.server) {
		var p = btNames;
		for (var key in p) {
			if (p.hasOwnProperty(key)) {
				if (!key.includes(':')) {
					updateDiscovery(key, false);
				}
			}
		}
	}
}

function addToQueue(topic, message) {
	logV('New MQTT message: [topic=' + topic + '] [message=' + message.toString() + ']');
	var foundDevice = false;
	var foundDeviceLastIdx = -1;
	var foundFull = false
		for (var i = 0; i < queue.length; i++) {
			var task = queue[i];

			if (topic == task.topic) {
				task.message = message;
				foundFull = true;
			} else {
				var btName = topic.split('/')[1];
				var btNameQueue = task.topic.split('/')[1];

				if (btName == btNameQueue) {
					foundDevice = true;
					foundDeviceLastIdx = i;
				}
			}
		}

		if (!foundFull) {
			var newTask = {
				topic: topic,
				message: message
			};
			if (foundDevice) {
				queue.splice(foundDeviceLastIdx + 1, 0, newTask);
			} else {
				queue.push(newTask);
			}
		}

}

function processCommand(topic, message) {
	if (cfg.prefix && !topic.startsWith('/' + cfg.prefix))
		return;

	var d = new Date();

	if (d.getTime() - connectDate.getTime() > 500) {
		addToQueue(topic, message);

		if (d.getTime() - scanStarted.getTime() > cfg.scanTimeoutTime * scanCount || !scanTimeoutId)
			processQueue();
		else
			logV('Suspending processing until scan finished');
	}
}

function processExec(cmd) {
	function puts(error, stdout, stderr) {
		console.log(stdout);
		client.publish('/eq3_master/' + cfg.server + '/execResult', stdout, publishOptionsLow);

	}
	exec(cmd, puts);
}

function restart() {
	var cmd = 'sudo service eq3blemqtt restart';
	exec(cmd);
}


// QUEUE PROCESSING
function getFailedMessagesString() {
	var failedMessage = '';
	if (queueFailed.length > 0) {
		for (var m = 0; m < queueFailed.length; m++) {
			if (failedMessage != '')
				failedMessage += ', ';
			failedMessage += queueFailed[m].time.yyyymmddhhmmss + '|' + queueFailed[m].topic;
		}
	}
}

function processQueue() {
	logV('Queue [size=' + queue.length + '], [processing=' + processing + ']');
	if (queueFailed.length > 0) {
		for (var i = 0; i < queueFailed.length; i++) {
			var failed = queueFailed[i];
			if (new Date().getTime() - failed.time.getTime() > cfg.waitAfterFail) {
				logV('Adding failed task from failedQueue to queue: ' + JSON.stringify(failed));
				addToQueue(failed.task.topic, failed.task.message);

				queueFailed.splice(0, 1);
				client.publish('/eq3_master/' + cfg.server + '/queueFailed', queueFailed.length.toString(), publishOptions);
				client.publish('/eq3_master/' + cfg.server + '/queueFailedMessages', getFailedMessagesString(), publishOptions);
			}
		}
	}

	if (!processing && queue.length > 0) {
		processing = true;
		//client.publish('/eq3_master/' + cfg.server + '/processing', '1', publishOptions);

		var task = queue[0];
		var inFailed = false;
		for (var i = 0; i < queueFailed.length; i++) {
			if (queueFailed[i].task.topic.split('/')[1] == task.topic.split('/')[1] && new Date().getTime() - queueFailed[i].time.getTime() < cfg.waitAfterFail) {
				inFailed = true;
				logV('Message ' + task.topic + ' already in failed');
				failedProcessing(queueFailed[i].time);
				break;
			}
		}
		if (!inFailed) {
			processMessage(task.topic, task.message);
		}
	} else if (queue.length == 0 && notDiscoveredCount > 0 && (new Date()).getTime() - scanStarted > cfg.scanFrequency) {
		EQ3BLE.startScanning(serviceUUIDs, false);
		notDiscoveredCount = 0;
	}
	if (queue.length == 0)
		client.publish('/eq3_master/' + cfg.server + '/info', 'idle', publishOptions);
	client.publish('/eq3_master/' + cfg.server + '/queue', queue.length.toString(), publishOptions);
}

function finishedProcessing() {
	timeoutCount = 0;
	queue.splice(0, 1);
	processing = false;
	//client.publish('/eq3_master/' + cfg.server + '/processing', '0', publishOptions);
	processQueue();
}

function failedProcessing(time) {
	if (queue.length > 0) {
		if (!time)
			time = new Date();
		queueFailed.push({
			time: time,
			task: queue[0]
		});
	}
	client.publish('/eq3_master/' + cfg.server + '/queueFailed', queueFailed.length.toString(), publishOptions);
	client.publish('/eq3_master/' + cfg.server + '/queueFailedMessages', getFailedMessagesString(), publishOptions);
	queue.splice(0, 1);
	retryFailedTimeoutId = setTimeout(function () {
			logV('Retry Failed Timer');
			processQueue();
		}, cfg.waitAfterFail + 500);
	timeoutCount = 0;
	processing = false;
	processQueue();

}

function timeoutProcessing(connection) {
	timeoutCount++;
	client.publish('/' + connection.name + '/in/fail', timeoutCount.toString(), publishOptionsLow);
	if (timeoutCount > cfg.retries) {
		logE('[Timout=' + timeoutCount + '] Giving up');
		failedProcessing();
	} else {
		client.publish('/eq3_master/' + cfg.server + '/info', 'retrying ' + timeoutCount, publishOptions);
		logW('[Timout=' + timeoutCount + '] Restarting & Retrying');
		processing = false;
		processQueue();
		//restartBluetoothAdapter();
	}
}

function cancelConnect() {
	if (noble.cancelConnect) {
		logV('Cancelling all connections');
		noble.cancelConnect();
		sleep.sleep(1);
	} else {
		logW('Cancel not implemented! See: https://github.com/sandeepmistry/noble/issues/229');
	}
}

function getAllDiscovered() {
	var result = [];
	for (var key in discovered) {
		if (!key.includes(':')) {
			result.push(btNames[key].friendlyname + ' (' + discovered[key].deviceInfo.rssi + ')');
		}
	}
	return result;
}

function getDiscovered() {
	var result = [];
	for (var key in discovered) {
		if (!key.includes(':') && btNames[key].server == cfg.server) {
			result.push(btNames[key].friendlyname + ' (' + discovered[key].deviceInfo.rssi + ')');
		}
	}
	return result;
}

function getNotDiscovered() {
	var result = [];
	for (var key in btNames) {
		if (!key.includes(':') && btNames[key].server == cfg.server && !discovered[key]) {
			result.push(btNames[key].friendlyname);
		}
	}
	return result;
}


function areAllDiscovered() {
	var p = cfg.btNames;
	for (var key in p) {
		if (p.hasOwnProperty(key)) {
			if (!key.includes(':')) {
				if (!p[key].discovery.discovered && (p[key].server == cfg.server || !p[key].server)) {
					return false;
				}
			}
		}
	}
	return true;
}

function clearDiscovered() {
	logV('Clearing discovered');
	var p = cfg.btNames;
	for (var key in p) {
		if (p.hasOwnProperty(key)) {
			if (!key.includes(':')) {
				if (!p[key].discovery) {
					p[key].discovery = {};
				}
				if (typeof(p[key].discovery.discovered) !== undefined) {
					delete p[key].discovery.discovered;
				}
				//console.log('discovery to clear', p[key].discovery);
				var discovery = p[key].discovery;
				if (discovery && discovery.server && discovery.server == cfg.server || discovery.server && servers[discovery.server] == 0) {
					publishDiscovery(key, null, null);
				}
			}
		}
	}
	discovered = {};
}

function shouldHandle(btName) {
	if (cfg.serverChoiceMethod == 'auto' || servers[btNames[btName].server].status == 0) {
		var discovery = cfg.btNames[btName].discovery;
		if (!discovery) {
			notDiscoveredCount++;
		}
		return discovery && discovery.discovered && discovery.server == cfg.server;
	}
	// simple:

	return btNames[btName].server == cfg.server || !btNames[btName].server;
}

function processMessage(topic, message) {
	var m = message.toString();
	var i1 = topic.indexOf('/');
	var i2 = topic.indexOf('/', i1 + 1);
	var btName = topic.substring(i1 + 1, i2);
	var action = topic.substring(i2 + 1);

	var address;

	if (btName[2] == ':' && btName[5] == ':' && btName[8] == ':' && btName[11] == ':') {
		logE('Addresses [' + btName + ']  not supported, use names.');
		queue.splice(0, 1);
		timeoutCount = 0;
		processing = false;
		processQueue();
		return;
	}

	if (shouldHandle(btName)) {
		//if (cfg.btNames[btName].server == cfg.server || !cfg.btNames[btName].server) {

		var device = discovered[btName];
		if (!device) {
			logE('[' + address + '] [' + btName + '] Not discovered!');
			notDiscoveredCount++;
			failedProcessing();
			return;
		} else {
			//logV('Device is already discovered, [rssi=' + device._peripheral.rssi + ']');
		}

		device.btName = btName;

		if (timeoutCount > 0) {
			cancelConnect();
		}

		logV('[' + cfg.btNames[btName].address + '] [' + cfg.btNames[btName].name + '] ' + action);

		if (action == 'outwish/targetTemperature') {
			targetTemperature(device, m);
		} else if (action == 'outwish/getInfo') {
			getInfo(device);
		} else if (action == 'outwish/requestProfile') {
			requestProfile(device, m);
		} else if (action.indexOf('outwish/setProfile') >= 0) {
			var day = action.substring(action.lastIndexOf('/') + 1);
			var periods = JSON.parse(m);
			setProfile(device, day, periods);
		} else if (action == 'outwish/boost') {
			setBoost(device, m);
		} else if (action == 'outwish/mode') {
			if (m == '1')
				automaticMode(device);
			else if (m == '0')
				manualMode(device);
		} else if (action == 'outwish/eco') {
			eco(device);
		} else if (action == 'outwish/lock') {
			lock(device, m);
		} else if (action == 'outwish/turn') {
			turn(device, m);
                } else if (action == 'outwish/day') {
                        setDay(device);
                } else if (action == 'outwish/night') {
                        setNight(device);
		} else if (action == 'outwish/setOffset') {
			setOffset(device, m);
		} else {
			logW('[' + cfg.btNames[btName].address + '] [' + cfg.btNames[btName].name + '] [Command=' + action + '] not recognized');
			finishedProcessing();
		}
	} else {
		logV('[' + cfg.btNames[btName].address + '] [' + cfg.btNames[btName].name + '] To be processed by other server, skipping');
		finishedProcessing();
		return;
	}
}

function scanSequence() {
	if (scanTimeoutId) {
		clearTimeout(scanTimeoutId);
		scanTimeoutId = null;
	}

	scanCount++;

	if (scanCount >= 2)
		disconnectAll();

	client.publish('/eq3_master/' + cfg.server + '/info', 'scanning (' + scanCount + ')', publishOptions);
	cancelConnect();
	clearDiscovered();
	if (noble.state === 'poweredOn') {
		EQ3BLE.startScanning(serviceUUIDs, false);
		scanStarted = new Date();
		scanTimeoutId = setTimeout(function () {
				logV('Scan Timout');
				if (scanCount >= 1 && scanCount <= cfg.scanAtStartup) {
					scanSequence();
				} else {
					processQueue();
				}
			}, cfg.scanTimeoutTime);
	} else {
		client.publish('/eq3_master/' + cfg.server + '/info', 'bluetooth: off', publishOptions);
	}
}

function updateDiscovery(btName, clean) {
	var discovery = cfg.btNames[btName].discovery;
	var device = discovered[btName];
	if (device) {
		var rssi = device._peripheral.rssi * -1;
		if (!discovery.server || discovery.server != cfg.server && rssi < discovery.rssi || !servers[discovery.server] || !servers[discovery.server].status || servers[discovery.server].status == 0) {
			publishDiscovery(btName, null, null);
			publishDiscovery(btName, cfg.server, device._peripheral.rssi * -1);
		} else if (discovery.server == cfg.server) {
			publishDiscovery(btName, cfg.server, device._peripheral.rssi * -1);
		}
	} else if (discovery && discovery.server && !servers[discovery.server]) {
		publishDiscovery(btName, null, null);
	}
}

function publishDiscovery(name, server, rssi) {
	if (server != null)
		server = server.toString();
	if (rssi != null)
		rssi = rssi.toString();

	if (server == null && rssi == null) {
		client.publish('/' + name + '/in/discovery', null, publishOptions);
		client.publish('/' + name + '/in/discovery/server', null, publishOptions);
		client.publish('/' + name + '/in/discovery/rssi', null, publishOptions);
	} else {
		if (server != null)
			client.publish('/' + name + '/in/discovery/server', server, publishOptions);
		if (rssi != null)
			client.publish('/' + name + '/in/discovery/rssi', rssi, publishOptions);
	}
}

function onDiscover(device) {
	// called for all devices discovered
	var deviceInfo = {
		address: device.address,
		rssi: device._peripheral.rssi,
		uuid: device.uuid
	};
	device.deviceInfo = deviceInfo;

	var dev = getByAddress(device.address);

	if (dev) {
		var btName = dev.name;

		discovered[btName] = device;
		device.btName = btName;
		logI('[' + device.address + '] [' + btName + '] Discovered EQ3:' + JSON.stringify(deviceInfo));
		cfg.btNames[device.btName].discovery.discovered = true;
		updateDiscovery(device.btName, false);
	} else {
		device.btName = 'NOT MAPPED';
		logW('[' + device.address + '] [NOT MAPPED] Add mapping in cfg.js, discovered EQ3:' + JSON.stringify(deviceInfo));
		return;
	}
	var allDiscovered = areAllDiscovered();
	var discoveredNames = getDiscovered();
	var alldiscoveredNames = getAllDiscovered();
	var notdiscoveredNames = getNotDiscovered();
	client.publish('/' + device.btName + '/in/address', device.address, publishOptions);
	client.publish('/eq3_master/' + cfg.server + '/discovered', discoveredNames.toString().replaceAll(',', ' | '), publishOptionsLow);
	client.publish('/eq3_master/' + cfg.server + '/alldiscovered', alldiscoveredNames.toString().replaceAll(',', ' | '), publishOptionsLow);
	client.publish('/eq3_master/' + cfg.server + '/notdiscovered', notdiscoveredNames.toString().replaceAll(',', ' | '), publishOptionsLow);
	if (allDiscovered && scanTimeoutId) {
		logV('All discovered');

		if (scanTimeoutId) {
			clearTimeout(scanTimeoutId);
			scanTimeoutId = null;
		}
		processQueue();
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

	logV('[' + device.address + '] [' + device.btName + '] [' + device._peripheral.rssi + 'dBm] Publishing to MQTT:' + JSON.stringify(info));
	client.publish('/' + device.btName + '/in/rssi', (device._peripheral.rssi * -1).toString(), publishOptions);
	client.publish('/' + device.btName + '/in/targetTemperature', info.targetTemperature.toString(), publishOptions);
	client.publish('/' + device.btName + '/in/valvePosition', info.valvePosition.toString(), publishOptions);
	client.publish('/' + device.btName + '/in/mode', info.status.manual ? '0' : '1', publishOptions);
	client.publish('/' + device.btName + '/in/openWindow', info.status.openWindow ? '1' : '0', publishOptions);
	client.publish('/' + device.btName + '/in/needsHeating', info.valvePosition > 0 ? '1' : '0', publishOptions);
	client.publish('/' + device.btName + '/in/estimatedTemperature', estimatedTemperature.toString(), publishOptions);
	client.publish('/' + device.btName + '/in/lowBattery', info.status.lowBattery ? '1' : '0', publishOptions);
	client.publish('/' + device.btName + '/in/dst', info.status.dst ? '1' : '0', publishOptions);
	client.publish('/' + device.btName + '/in/holiday', info.status.holiday ? '1' : '0', publishOptions);
	client.publish('/' + device.btName + '/in/boost', info.status.boost ? '1' : '0', publishOptions);
	client.publish('/' + device.btName + '/in/lock', info.status.lock ? '1' : '0', publishOptions);
	var turn = '';
	if (info.targetTemperature == 4.5) turn = '0';
	if (info.targetTemperature == 30) turn = '1';

	client.publish('/' + device.btName + '/in/turn', turn, publishOptions);

	client.publish('/' + device.btName + '/in/try', (timeoutCount + 1).toString(), publishOptionsLow);
	client.publish('/' + device.btName + '/in/info', '0', publishOptionsLow);
	client.publish('/' + device.btName + '/in/server', cfg.server.toString(), publishOptionsLow);
}

function targetTemperature(device, t) {

	device.afterConnect(device.setTemperature.bind(device, t), (info) => {
		processInfo(device, info);
	});

}

function requestProfile(device, day) {

	device.afterConnect(device.requestProfile.bind(device, day), (profile) => {
		client.publish('/' + device.btName + '/in/profile/' + profile.dayOfWeek, JSON.stringify(profile.periods), publishOptions);
		logI('[' + device.address + '] [' + device.btName + '] Profile: ' + JSON.stringify(profile));
	});

}

function setProfile(device, day, periods) {

	device.afterConnect(device.setProfile.bind(device, day, periods), (result) => {
		if (result) {
			logI('[' + device.address + '] [' + device.btName + '] Setting profile OK.');
		} else {
			logE('[' + device.address + '] [' + device.btName + '] Setting profile failed!');
		}
	});

}

function setBoost(device, enable) {

	device.afterConnect(device.setBoost.bind(device, enable == '1' ? true : false), (result) => {
		processInfo(device, result);
	});

}

function manualMode(device) {

	device.afterConnect(device.manualMode.bind(device), (result) => {
		processInfo(device, result);
	});

}

function automaticMode(device) {

	device.afterConnect(device.automaticMode.bind(device), (result) => {
		processInfo(device, result);
	});

}

function lock(device, enable) {

	device.afterConnect(device.setLock.bind(device, enable == '1' ? true : false), (result) => {
		logI('Setting lock=' + JSON.stringify(result) + ' OK');
	});

}

function eco(device) {

	device.afterConnect(device.ecoMode.bind(device), (result) => {
		processInfo(device, result);
	});

}

function setDay(device) {

        device.afterConnect(device.setDay.bind(device), (result) => {
		processInfo(device, result);
        });
}

function setNight(device) {

        device.afterConnect(device.setNight.bind(device), (result) => {
		processInfo(device, result);
        });
}

function turn(device, turnOn) {

	if (turnOn == '1') {
		device.afterConnect(device.turnOn.bind(device), (result) => {
			processInfo(device, result);
		});
	} else if (turnOn == '0') {
		device.afterConnect(device.turnOff.bind(device), (result) => {
			processInfo(device, result);
		});
	}

}

function setOffset(device, offset) {

	device.afterConnect(device.setTemperatureOffset.bind(device, offset), (info) => {
		processInfo(device, info);
	});

}

function getInfo(device) {

	device.afterConnect(device.getInfo.bind(device), (info) => {
		processInfo(device, info);
	});

}

NobleDevice.prototype.afterConnect = NobleDevice.prototype.afterConnect = function (fn, callback) {
	performanceStart = new Date();
	timeoutId = setTimeout(function (name) {
			timeoutProcessing({
				name: name,
				connected: false,
				exception: false
			});
		}, cfg.connectTimeout, this.btName);

	var retainConnection = false;

	if (queue.length > 0) {
		var task = queue[0];
		var topic = task.topic;
		var i1 = topic.indexOf('/');
		var i2 = topic.indexOf('/', i1 + 1);
		var btName = topic.substring(i1 + 1, i2);
		var action = topic.substring(i2 + 1);
		if (this.btName == btName)
			retainConnection = true;
	}

	var friendlyname = btNames[this.btName].friendlyname;

	client.publish('/eq3_master/' + cfg.server + '/info', 'connecting to ' + friendlyname, publishOptions);

	if (this._peripheral.state === 'connected') {
		fn().then((result) => {
			//logI('['+ this.address +'] ['+this.btName+'] Function [result='+JSON.stringify(result)+']');
			callback(result);
			var performanceEnd = new Date();
			var took = performanceEnd.getTime() - performanceStart.getTime();
			logI('[' + this.address + '] [' + this.btName + '] Being connected and finished in ' + took + ' millis');
			if (!retainConnection && device && device.disconnect)
				device.disconnect();
			clearTimeout(timeoutId);
			finishedProcessing();
		}).catch (function (error) {
			logE('[' + this.address + '] [' + this.btName + '] Connecting failed! ' + error);
			if (this && this.disconnect)
				this.disconnect();
			clearTimeout(timeoutId);
			timeoutProcessing({
				name: this.btName,
				connected: true,
				exception: true
			});
		});

	} else {
		logV('[' + this.address + '] [' + this.btName + '] Connecting...');
		this.connectAndSetup().then(() => {
			logV('[' + this.address + '] [' + this.btName + '] Connected, running function');
			fn().then((result) => {
				//logI('['+ this.address +'] ['+this.btName+'] Function [result='+JSON.stringify(result)+']');
				callback(result);
				var performanceEnd = new Date();
				var took = performanceEnd.getTime() - performanceStart.getTime();
				logI('[' + this.address + '] [' + this.btName + '] New connection finished in ' + took + ' millis');
				if (!retainConnection && this && this.disconnect)
					this.disconnect();
				clearTimeout(timeoutId);
				finishedProcessing();
			}).catch (function (error) {
				logE('[' + this.address + '] [' + this.btName + '] Running function failed! ' + error);
				if (this && this.disconnect)
					this.disconnect();
				clearTimeout(timeoutId);
				timeoutProcessing({
					name: this.btName,
					connected: false,
					exception: true
				})
			});

		}).catch (function (error) {
			logE('[' + this.address + '] [' + this.btName + '] Connecting failed! ' + error);
			if (this && this.disconnect)
				this.disconnect();
			clearTimeout(timeoutId);
			timeoutProcessing({
				name: this.btName,
				connected: false,
				exception: true
			});
		});
	}
};

// rediscovering
function rediscover(device) {
	device._peripheral.discoverServices(null, function (error, services) {
		console.log('discovered the following services:');
		for (var i in services) {
			console.log('  ' + i + ' uuid: ' + services[i].uuid);
		}
	});
}


/* 
 * Console log
 */

function log(level, message) {
	var date = new Date();
	date.setTime(date.getTime() - date.getTimezoneOffset() * 60 * 1000);

	var d = '[' + cfg.server + '][' + date.toISOString().replace(/T/, ' ').replace(/\..+/, '') + ']';
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

function restartBluetoothAdapter() {
	//return;
	var cmd = "sudo service bluetooth stop && sleep 1 && sudo hciconfig hci0 down && sleep 1 && sudo hciconfig hci0 up && sudo service bluetooth start && sleep 1 && echo 'power on\nquit' | sudo bluetoothctl";

	function puts(error, stdout, stderr) {
		console.log(stdout);
		console.log(stderr);

	}
	exec(cmd, puts);
}

function disconnectAll() {
	var anyConnected = false;
	logV('Disconnecting all');
	for (var key in discovered) {
		if (discovered.hasOwnProperty(key)) {
			if (discovered[key]._peripheral.state === 'connected') {
				anyConnected = true;
				logV('Disconnecting ' + key);
				discovered[key].disconnect();
			}
		}
	}

	if (anyConnected)
		sleep.sleep(5);
}

/* 
 * Date formating
 */
 
Date.prototype.yyyymmdd = function () {
	var yyyy = this.getFullYear();
	var mm = this.getMonth() < 9 ? "0" + (this.getMonth() + 1) : (this.getMonth() + 1); // getMonth() is zero-based
	var dd = this.getDate() < 10 ? "0" + this.getDate() : this.getDate();
	return "".concat(yyyy).concat('-').concat(mm).concat('-').concat(dd);
};

Date.prototype.yyyymmddhhmm = function () {
	var yyyy = this.getFullYear();
	var mm = this.getMonth() < 9 ? "0" + (this.getMonth() + 1) : (this.getMonth() + 1); // getMonth() is zero-based
	var dd = this.getDate() < 10 ? "0" + this.getDate() : this.getDate();
	var hh = this.getHours() < 10 ? "0" + this.getHours() : this.getHours();
	var min = this.getMinutes() < 10 ? "0" + this.getMinutes() : this.getMinutes();
	return "".concat(yyyy).concat('-').concat(mm).concat('-').concat(dd).concat('T').concat(hh).concat(':').concat(min);
};

Date.prototype.yyyymmddhhmmss = function () {
	var yyyy = this.getFullYear();
	var mm = this.getMonth() < 9 ? "0" + (this.getMonth() + 1) : (this.getMonth() + 1); // getMonth() is zero-based
	var dd = this.getDate() < 10 ? "0" + this.getDate() : this.getDate();
	var hh = this.getHours() < 10 ? "0" + this.getHours() : this.getHours();
	var min = this.getMinutes() < 10 ? "0" + this.getMinutes() : this.getMinutes();
	var ss = this.getSeconds() < 10 ? "0" + this.getSeconds() : this.getSeconds();
	return "".concat(yyyy).concat('-').concat(mm).concat('-').concat(dd).concat('T').concat(hh).concat(':').concat(min).concat(':').concat(ss);
};

/* 
 * String functions
 */

String.prototype.replaceAll = function (search, replacement) {
	var target = this;
	return target.replace(new RegExp(search, 'g'), replacement);
};

/* 
 * Process exit handling
 */

process.stdin.resume(); //so the program will not close instantly

function exitHandler(options, err) {
	logV('exitHandler');
	if (options.cleanup) {
		logV('clean');
		logV(util.inspect(noble));
		disconnectAll();
		logV(util.inspect(noble));
	}
	if (err && err.stack)
		logE(err.stack);
	if (options.exit)
		process.exit();
}

//do something when app is closing
process.on('exit', exitHandler.bind(null, {
		cleanup: true
	}));

//catches ctrl+c event
process.on('SIGINT', exitHandler.bind(null, {
		exit: true
	}));

// catches "kill pid" (for example: nodemon restart)
process.on('SIGUSR1', exitHandler.bind(null, {
		exit: true
	}));
process.on('SIGUSR2', exitHandler.bind(null, {
		exit: true
	}));

//catches uncaught exceptions
process.on('uncaughtException', exitHandler.bind(null, {
		exit: true
	}));

process.on('beforeExit', function () {
	logV('beforeExit fired')
})
process.on('exit', function () {
	logV('exit fired')
})

// signals
process.on('SIGUSR1', function () {
	logV('SIGUSR1 fired')
	process.exit(1)
})
process.on('SIGTERM', function () {
	logV('SIGTERM fired')
	process.exit(1)
})
process.on('SIGPIPE', function () {
	logV('SIGPIPE fired')
})
process.on('SIGHUP', function () {
	logV('SIGHUP fired')
	process.exit(1)
})
process.on('SIGTERM', function () {
	logV('SIGTERM fired')
	process.exit(1)
})
process.on('SIGINT', function () {
	logV('SIGINT fired')
	process.exit(1)
})
process.on('SIGBREAK', function () {
	logV('SIGBREAK fired')
})
process.on('SIGWINCH', function () {
	logV('SIGWINCH fired')
})


/*
 * BEGIN:
 */

setServerIdx();


// MQTT

var client = mqtt.connect(cfg.mqttServer.address, {
		username: cfg.mqttServer.username,
		password: cfg.mqttServer.password,
		will: {
			topic: '/eq3_master/' + cfg.server + '/status',
			payload: '0',
			qos: 2,
			retain: true
		}
	});

client.on('connect', function () {
	logV('MQTT connected');

	client.subscribe('/eq3_master/+/status');
	client.subscribe('/eq3_master/+/processing');
	client.subscribe('/eq3_master/' + cfg.server + '/exec');
	client.subscribe('/eq3_master/' + cfg.server + '/command');
	client.subscribe('/+/in/discovery/#');
	client.subscribe('/+/outwish/+');
	client.publish('/eq3_master/' + cfg.server + '/status', '1', publishOptions);
	client.publish('/eq3_master/' + cfg.server + '/started', new Date().yyyymmddhhmmss(), publishOptions);
	client.publish('/eq3_master/' + cfg.server + '/info', 'initialized: ' + (noble.state === 'poweredOn' ? 'bluetooth on' : 'bluetooth off'), publishOptions);
	client.publish('/eq3_master/' + cfg.server + '/queue', '0', publishOptions);
	client.publish('/eq3_master/' + cfg.server + '/queueFailed', '0', publishOptions);
	client.publish('/eq3_master/' + cfg.server + '/queueFailedMessages', '', publishOptions);
	client.publish('/eq3_master/' + cfg.server + '/discovered', '', publishOptionsLow);
	client.publish('/eq3_master/' + cfg.server + '/alldiscovered', '', publishOptionsLow);
	client.publish('/eq3_master/' + cfg.server + '/notdiscovered', '', publishOptionsLow);

	logV('MQTT subscribed and published status');
});

client.on('message', function (topic, message) {
	if (topic.includes('/in/discovery')) {
		processDiscovery(topic, message);
		return;
	}
	if (topic.includes('/eq3_master/')) {
		processMaster(topic, message);
		return;
	}

	processCommand(topic, message);
});


// NOBLE

EQ3BLE.discoverAll(onDiscover);

logI("Waiting for bluetooth power on, if waiting more than couple seconds run 'bluetoothctl' and type 'power on'");

// wait for noble initialization:
noble.on('stateChange', function (state) {
	logV('noble.state: ' + state);
	if (state === 'poweredOn') {
		scanSequence();
	} else {
		EQ3BLE.stopScanning();
	}
});

noble.on('scanStart', function () {
	logV('Scan started');
});

noble.on('scanStop', function () {
	logV('Scan stopped');
});

noble.on('warning', function (message) {
	logW('NOBLE warning:', message);
});
