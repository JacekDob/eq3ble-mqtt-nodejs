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

npm --unsafe-perm install eq3ble mqtt sleep

```

## Changes in eq3ble library

Apply changes in files
* node_modules/eq3ble/dist/index.js
* node_modules/eq3ble/dist/interface.js

from [updated library](https://github.com/JacekDob/eq3ble-mqtt-nodejs/tree/master/library)

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
servers['ip'] = idx;
```     
servers['192.168.1.11'] = 1;
servers['192.168.1.12'] = 2;
```

## Mapping
Sample configuration for one device

* name - MQTT node name (/eq3_device1)
* friendlyame - user friendly name
* address - BT MAC address
* server - server to handle MQTT requests

```
btNames['eq3_device1'] = { name: 'eq3_device1', friendlyname: 'device 1', address: '00:11:22:33:44:55', server: 1 };
```

## Automatic scanning
Scans every 3 hours if there is any not discovered device.

```
var scanFrequency = 3 * 60 * 60 * 1000;
```

## Scan timeout
15 seconds waiting for device discovery, till that time MQTT requests are waiting in queue.
Timeout is cancelled if all defined devices are discovered earlier.

```
var scanTimoutTime = 15 * 1000;
```

## Connection timeout
15 seconds waiting for connect to device, then there is a retry (retries) and after that waiting (waitAfterFail).

```
var scanTimoutTime = 15 * 1000;
```

## Retries
Number of retries to connect.

```
var retries = 1;
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
## Autorun & Service

Put eq3blemqtt to /etc/init.d/eq3blemqtt

```
systemctl enable eq3blemqtt
systemctl start eq3blemqtt
systemctl status eq3blemqtt
```
# Usage

## MQTT requests

* /eq3_device1/outwish/getInfo - gets info from EQ3 (see below)
* /eq3_device1/outwish/targetTmperature [4.5-30] - sets temperature
* /eq3_device1/outwish/requestProfile
```
{"periods":[{"temperature":17,"from":0,"to":42,"fromHuman":0,"toHuman":7},{"temperature":18.5,"from":42,"to":129,"fromHuman":7,"toHuman":21.5},{"temperature":17,"from":129,"to":144,"fromHuman":21.5,"toHuman":24}],"dayOfWeek":0,"dayOfWeekName":"SATURDAY"}
```
* /eq3_device1/outwish/outwish/setProfile/[0-6] - 0-saturday, 1-sunday, 2-monday, ...
```
[{"temperature":17,"from":0,"to":42,"fromHuman":0,"toHuman":7},{"temperature":18.5,"from":42,"to":129,"fromHuman":7,"toHuman":21.5},{"temperature":17,"from":129,"to":144,"fromHuman":21.5,"toHuman":24}]
```
* /eq3_device1/outwish/boost [0|1]
* /eq3_device1/outwish/mode [0-manual|1-auto]
* /eq3_device1/outwish/ecoMode
* /eq3_device1/outwish/setLock [0|1]
* /eq3_device1/outwish/turn [0-off (4.5) | 1-on (30)]

## MQTT response

* /eq3_device1/in/rssi [0-1xx] - BT signal strength * -1
* /eq3_device1/in/targetTemperature [4.5-30]
* /eq3_device1/in/valvePosition [0-100]
* /eq3_device1/in/mode [0-manual, 1-automatic] - manual / automatic mode
* /eq3_device1/in/openWindow [0-closed, 1-opened] - closed / opened window
* /eq3_device1/in/needsHeating [0-not needing to heat (valvePosition == 0), 1-needsHeating (valvePosition > 0)]
* /eq3_device1/in/estimatedTemperature [1.5-29.5] - estimated temerature based on targetTemperature and valvePosition
* /eq3_device1/in/lowBattery [0-battery ok, 1-battery low] - battery status
* /eq3_device1/in/dst [0-no, 1-yes] - daylight saving time
* /eq3_device1/in/holiday [0-no, 1-yes] - holiday mode

For detailed description check [library node-eq3ble](https://github.com/maxnowack/node-eq3ble) specification.

# Integration with OPENHAB2

## Installation

## Integration

### Items

Put eq3.items to /etc/openhab2/items/eq3.items
Put eq3master.items to /etc/openhab2/items/eq3master.items

### Sitemap

Put eq3.sitemap to /etc/openhab2/sitemaps/_default.sitemap
Put eq3master.sitemap to /etc/openhab2/sitemaps/_default.sitemap

### Rules

Create new file
```
/etc/openhab2/rules/rules.items
```
With following content to get updates every 15 minutes:

```
rule "EQ-3 GetInfo"
when
        Time cron "15 0,15,30,45 * * * ?"
then
        eq3_device1_getInfo.sendCommand(ON) 
end

```

# Troubleshooting

Check if You have proper version of nodejs

```
node -v
```
For me works
```
v7.4.0
```

# License

Licensed under GPLv3 license. Copyright (c) 2017 Jacek Dobrowolski

# Contributions

Contributions are welcome. Please open issues and/or file Pull Requests.

# Maintainers

Jacek Dobrowolski (JacekDob)
