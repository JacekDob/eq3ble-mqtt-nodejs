# eq3ble-mqtt-nodejs
Handles EQ3 Bluetooth thermostats via mqtt in nodejs.
For Raspberry Pi 3.

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
Changes to be made in
```
node_modules/eq3ble/dist/index.js
```
* getInfo - current implementation crashes automatic mode
```
key: 'getInfo',
    value: function getInfo() {
      return this.writeAndGetNotification(_interface.payload.setAutomaticMode()).then(function (info) {
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
node eq3.js | tee -a eq3.log
```

# Usage

## MQTT requests

* /eq3_device1/getInfo - get info from EQ3
* /eq3_device1/outwish/wishedTemperature/ - sets temperature

## MQTT response

* /eq3_device1/in/rssi [0-1xx] - BT signal strength * -1
* /eq3_device1/in/targetTemperature [4.5-29.5]
* /eq3_device1/in/valvePosition [0-100]
* /eq3_device1/in/manual [0-automatic, 1-manual] - manual / automatic mode
* /eq3_device1/in/openWindow [0-closed, 1-opened] - closed / opened window
* /eq3_device1/in/needsHeating [0-not needing to heat (valvePosition == 0), 1-needsHeating (valvePosition > 0)]
* /eq3_device1/in/estimatedTemperature [1.5-29.5] - estimated temerature based on targetTemperature and valvePosition
