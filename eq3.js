#!/usr/bin/env node

// eq3ble library location:
// node_modules/eq3ble/dist

// libraries:
var EQ3BLE = require('eq3ble').default;
var noble = require('noble');
var NobleDevice = require('noble-device');
var mqtt = require('mqtt');
var cfg = require('./cfg.js');

var scanFrequency = 3 * 60 * 60 * 1000;
var scanStarted;
var scanTimoutTime = 30000;


// defaults:
if (!cfg.server)
    cfg.server = 1;

var btNames = cfg.btNames;

var discovered = {};
var servers = {};

var connectDate = new Date();
var publishOptions = {
    qos: 2,
    retain: true
};

// MQTT

var queue = [];

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

client.on('connect', function() {
    logV('MQTT connected');

    client.subscribe('/eq3_master/+/status');
    client.subscribe('/+/in/discovery/#');
    client.subscribe('/+/outwish/+');
    client.publish('/eq3_master/' + cfg.server + '/status', '1', publishOptions);

    logV('MQTT subscribed and published status');
});

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
    //console.log(topic+'='+message);
    var name = (topic.split('/'))[1];
    var key = (topic.split('/'))[4];
    //console.log('key', key);

    if (!btNames[name])
        btNames[name] = {};

    if (!key && btNames[name].discovery) {
        delete btNames[name].discovery.server;
        delete btNames[name].discovery.rssi;
        return;
    }

    message = message.toString();

    if (message == '') {
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

function processCommand(topic, message) {
    if (cfg.prefix && !topic.startsWith('/' + cfg.prefix))
        return;

    var d = new Date();
    if (d.getTime() - connectDate.getTime() > 500) {
        logV('New MQTT message: [topic=' + topic + '] [message=' + message.toString() + ']');
        queue.push({
            topic: topic,
            message: message
        });
        if (d.getTime() - scanStarted.getTime() > scanTimoutTime || !scanTimeoutId)
            processQueue();
        else
            logV('Suspending processing until scan finished');
    }
}

client.on('message', function(topic, message) {
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

// QUEUE PROCESSING

var processing = false;

function processQueue() {
    logV('Queue [size=' + queue.length + '], [processing=' + processing + ']');
    if (!processing && queue.length > 0) {
        processing = true;
        task = queue[0];
        processMessage(task.topic, task.message);
    } else if (queue.length == 0 && notDiscoveredCount > 0 && (new Date()).getTime() - scanStarted > scanFrequency) {
        EQ3BLE.startScanning();
        notDiscoveredCount = 0;
    }
}

var timeoutCount = 0;

function finishedProcessing() {
    timeoutCount = 0;
    queue.splice(0, 1);
    processing = false;
    processQueue();
}

function failedProcessing() {
    timeoutCount = 0;
    queue.splice(0, 1);
    processing = false;
    processQueue();
}

function timeoutProcessing() {
    timeoutCount++;
    if (timeoutCount >= 3) {
        logE('[Timout=' + timeoutCount + '] Giving up');
        queue.splice(0, 1);
        timeoutCount = 0;
    } else {
        logW('[Timout=' + timeoutCount + '] Retrying');
    }
    processing = false;
    processQueue();
}

function cancelConnect() {
    if (noble.cancelConnect) {
        logV('Cancelling all connections');
        noble.cancelConnect();
    } else {
        logW('Cancel not implemented!');

    }
}

var notDiscoveredCount = 0;

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
    // simple:
    if (!cfg.serverChoiceMethod) {
        var discovery = cfg.btNames[btName].discovery;
        return discovery && discovery.discovered && discovery.server == cfg.server;
    }

    return cfg.btNames[btName].server == cfg.server || !cfg.btNames[btName].server;
}

function processMessage(topic, message) {
    var m = message.toString();
    var i1 = topic.indexOf('/');
    var i2 = topic.indexOf('/', i1 + 1);
    var btName = topic.substring(i1 + 1, i2);
    var action = topic.substring(i2 + 1);

    var address;

    if (btName[2] == ':' && btName[5] == ':' && btName[8] == ':' && btName[11] == ':') {
        address = btName;
    } else {
        if (!cfg.btNames[btName]) {
            logE('[name=' + btName + '] not mapped to address');
            failedProcessing();
            return;
        } else {
            address = cfg.btNames[btName].address;
            //logV('[name=' + btName + '] mapped to [address=' + address + ']');
        }
    }
    if (shouldHandle(btName)) {
        //if (cfg.btNames[btName].server == cfg.server || !cfg.btNames[btName].server) {

        var device = discovered[address];
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

        logV(action);
        if (action == 'outwish/wishedTemperature') {
            setTemperature(device, m);
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
        } else if (action == 'outwish/manualMode') {
            manualMode(device);
        } else if (action == 'outwish/automaticMode') {
            automaticMode(device);
        } else if (action == 'outwish/ecoMode') {
            ecoMode(device);
        } else if (action == 'outwish/setLock') {
            setLock(device, m);
        } else if (action == 'outwish/turn') {
            turn(device, m);
        } else if (action == 'outwish/setOffset') {
            setOffset(device, m);
        } else {
            logW('[' + cfg.btNames[btName].address + '] [' + cfg.btNames[btName].name + '] [Command=' + action + '] not recognized');
        }
    } else {
        logV('[' + cfg.btNames[btName].address + '] [' + cfg.btNames[btName].name + '] To be processed by other server, skipping');
        finishedProcessing();
        return;
    }
}

var scanTimeoutId;

// wait for noble initialization:
noble.on('stateChange', function(state) {
    logV('noble.state: ' + state);
    if (state === 'poweredOn') {
        cancelConnect();
        clearDiscovered();
        EQ3BLE.startScanning();
        EQ3BLE.discoverAll(onDiscover);
        scanStarted = new Date();
        scanTimeoutId = setTimeout(function() {
            logV('Scan Timout');
            processQueue();
        }, scanTimoutTime);
    } else {
        EQ3BLE.stopScanning();
    }
});

noble.on('scanStart', function() {
    logV('Scan started');
});

noble.on('scanStop', function() {
    logV('Scan stopped');
});

noble.on('warning', function(message) {
    logW('NOBLE warning:', message);
});

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
    if (server != null) server = server.toString();
    if (rssi != null) rssi = rssi.toString();

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
    discovered[device.address] = device;

    var dev = getByAddress(device.address);
    if (!dev)
        btNames[device.address] = {
            address: device.address,
            name: device.address,
            discovery: {}
        };

    if (dev) {
        var btName = dev.name;

        discovered[btName] = device;
        device.btName = btName;
        logI('[' + device.address + '] [' + btName + '] Discovered EQ3:' + JSON.stringify(deviceInfo));
        cfg.btNames[device.btName].discovery.discovered = true;
        updateDiscovery(device.btName, false);
    } else {
        device.btName = 'NOT MAPPED';
        logW('[' + device.address + '] [NOT MAPPED] Discovered EQ3:' + JSON.stringify(deviceInfo));
    }
    var allDiscovered = areAllDiscovered();
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
    client.publish('/' + device.btName + '/in/manual', info.status.manual ? '1' : '0', publishOptions);
    client.publish('/' + device.btName + '/in/openWindow', info.status.openWindow ? '1' : '0', publishOptions);
    client.publish('/' + device.btName + '/in/needsHeating', info.valvePosition > 0 ? '1' : '0', publishOptions);
    client.publish('/' + device.btName + '/in/estimatedTemperature', estimatedTemperature.toString(), publishOptions);
    client.publish('/' + device.btName + '/in/lowBattery', info.status.lowBattery ? '1' : '0', publishOptions);
    client.publish('/' + device.btName + '/in/dst', info.status.dst ? '1' : '0', publishOptions);
    client.publish('/' + device.btName + '/in/holiday', info.status.holiday ? '1' : '0', publishOptions);
}


function setTemperature(device, t) {

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

function setLock(device, enable) {

    device.afterConnect(device.setLock.bind(device, enable == '1' ? true : false), (result) => {
        logI('Setting lock=' + JSON.stringify(result) + ' OK');
    });

}

function ecoMode(device) {

    device.afterConnect(device.ecoMode.bind(device), (result) => {
        logI('Setting eco mode=' + JSON.stringify(result) + ' OK');
    });

}

function turn(device, turnOn) {

    if (turnOn == '1') {
        device.afterConnect(device.turnOn.bind(device), (result) => {
            logI('Turning on=' + JSON.stringify(result) + ' OK');
        });
    } else if (turnOn == '0') {
        device.afterConnect(device.turnOff.bind(device), (result) => {
            logI('Turning off=' + JSON.stringify(result) + ' OK');
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


var timeoutId;

NobleDevice.prototype.afterConnect = NobleDevice.prototype.afterConnect = function(fn, callback, retainConnection) {
    performanceStart = new Date();
    timeoutId = setTimeout(function() {
        timeoutProcessing();
    }, 30000);

    if (this._peripheral.state === 'connected') {
        fn().then((result) => {
            //logI('['+ this.address +'] ['+this.btName+'] Function [result='+JSON.stringify(result)+']');
            callback(result);
            var performanceEnd = new Date();
            var took = performanceEnd.getTime() - performanceStart.getTime();
            logI('[' + this.address + '] [' + this.btName + '] Finished in ' + took + ' millis');
            if (!retainConnection)
                device.disconnect();
            clearTimeout(timeoutId);
            finishedProcessing();
        }).catch(function(error) {
            logE('[' + this.address + '] [' + this.btName + '] Connecting failed! ' + error);
            clearTimeout(timeoutId);
            timeoutProcessing();
            //failedProcessing();
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
                logI('[' + this.address + '] [' + this.btName + '] Finished in ' + took + ' millis');
                if (!retainConnection)
                    this.disconnect();
                clearTimeout(timeoutId);
                finishedProcessing();
            }).catch(function(error) {
                logE('[' + this.address + '] [' + this.btName + '] Running function failed! ' + error);
                failedProcessing();
            });

        }).catch(function(error) {
            logE('[' + this.address + '] [' + this.btName + '] Connecting failed! ' + error);
            failedProcessing();
        });
    }
};

// console log

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
