# eq3ble-mqtt-nodejs
Handles EQ3 Bluetooth thermostats via mqtt in nodejs.
For Raspberry Pi 3.

## eq3ble
Code uses [library node-eq3ble](https://github.com/maxnowack/node-eq3ble). Many thanks to author for developing it.

# Installation
On clean (x/rasp)bian

## NodeJs and EQ3BLE
```
sudo su

apt-get update

apt-get install build-essential curl

curl -sL https://deb.nodesource.com/setup_7.x | sudo -E bash -

apt-get install nodejs

ln -s /usr/bin/nodejs /usr/bin/node 

npm --unsafe-perm install eq3ble mqtt

```

## Changes in eq3ble library

### node_modules/eq3ble/dist/index.js

* getInfo - current implementation crashes automatic mode
```
key: 'getInfo',
    value: function getInfo() {
      return this.writeAndGetNotification(_interface.payload.setDatetime(new Date())).then(function (info) {
        return (0, _interface.parseInfo)(info);
      });
    }
```

* setTemperature - getting and parsing response
```
    key: 'setTemperature',
    value: function setTemperature(temperature) {
      return this.writeAndGetNotification(_interface.payload.setTemperature(temperature)).then(function (info) {
        return (0, _interface.parseInfo)(info);
      });
    }
```

### node_modules/eq3ble/dist/interface.js

```
  setDatetime: function setDatetime(date) {
    var b = Buffer.alloc(7);
    b[0] = 3;
    b[1] = (date.getFullYear() % 100);
    b[2] = (date.getMonth() + 1);
    b[3] = date.getDate();
    b[4] = date.getHours();
    b[5] = date.getMinutes();
    b[6] = date.getSeconds();
    return b;
  }
```

# Configuration
Configuration done in
```
cfg.js
```
## MQTT Server
Address, username and password
```
exports.mqttServer = { address: 'tcp://localhost', username: 'user', password: 'pass' };
```
## Multiple servers
Set to 1 if only one used
```
exports.server = 1;
```

## Mapping
Sample configuration for one device

* name - user friendly name and MQTT node (/eq3/device1)
* address - BT MAC address
* server - server to handle MQTT requests

```
exports.btNames['00:11:22:33:44:55'] = { name: 'eq3_device1', address: '00:11:22:33:44:55', server: 1 };
exports.btNames['eq3_device1'] = exports.btNames['00:11:22:33:44:55'];
```

# Running
Needs root privilages to access Bluetooth module

## Without logging
```
sudo node eq3.js
```

## With logging

```
sudo node eq3.js | tee -a eq3.log
```

# Usage

## MQTT requests

* /eq3_device1/getInfo - gets info from EQ3 (see below)
* /eq3_device1/outwish/wishedTemperature [4.5-30] - sets temperature
* /eq3_device1/outwish/outwish/requestProfile
```
{"periods":[{"temperature":17,"from":0,"to":42,"fromHuman":0,"toHuman":7},{"temperature":18.5,"from":42,"to":129,"fromHuman":7,"toHuman":21.5},{"temperature":17,"from":129,"to":144,"fromHuman":21.5,"toHuman":24}],"dayOfWeek":0,"dayOfWeekName":"SATURDAY"}
```
* /eq3_device1/outwish/outwish/setProfile/[0-6] - 0-saturday, 1-sunday, 2-monday, ...
```
[{"temperature":17,"from":0,"to":42,"fromHuman":0,"toHuman":7},{"temperature":18.5,"from":42,"to":129,"fromHuman":7,"toHuman":21.5},{"temperature":17,"from":129,"to":144,"fromHuman":21.5,"toHuman":24}]
```
* /eq3_device1/outwish/outwish/boost [0|1]
* /eq3_device1/outwish/outwish/manualMode
* /eq3_device1/outwish/outwish/automaticMode
* /eq3_device1/outwish/outwish/ecoMode
* /eq3_device1/outwish/outwish/setLock [0|1]
* /eq3_device1/outwish/outwish/turn [0-off (4.5) | 1-on (30)]

## MQTT response

* /eq3_device1/in/rssi [0-1xx] - BT signal strength * -1
* /eq3_device1/in/targetTemperature [4.5-30]
* /eq3_device1/in/valvePosition [0-100]
* /eq3_device1/in/manual [0-automatic, 1-manual] - manual / automatic mode
* /eq3_device1/in/openWindow [0-closed, 1-opened] - closed / opened window
* /eq3_device1/in/needsHeating [0-not needing to heat (valvePosition == 0), 1-needsHeating (valvePosition > 0)]
* /eq3_device1/in/estimatedTemperature [1.5-29.5] - estimated temerature based on targetTemperature and valvePosition
* /eq3_device1/in/lowBattery [0-battery ok, 1-battery low] - battery status
* /eq3_device1/in/dst [0-no, 1-yes] - daylight saving time
* /eq3_device1/in/holiday [0-no, 1-yes] - holiday mode

For detailed description check [library node-eq3ble](https://github.com/maxnowack/node-eq3ble) specification.

# License

Licensed under GPLv3 license. Copyright (c) 2017 Jacek Dobrowolski

# Contributions

Contributions are welcome. Please open issues and/or file Pull Requests.

# Maintainers

Jacek Dobrowolski (JacekDob)
