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
Set to 1 if only one used, if not defined, 1 will be used.
```
exports.server = 1;
```

## Automatic server assignment
Set to 'file' if there should be config file used for server assignment.
Otherewise set to false (or remove) so server assignment will be done automatically based on RSSI.

```
exports.serverChoiceMethod = 'file';
```

## Mapping
Sample configuration for one device

* name - user friendly name and MQTT node (/eq3/device1)
* address - BT MAC address
* server - server to handle MQTT requests

```
exports.btNames['eq3_device1'] = { name: 'eq3_device1', address: '00:11:22:33:44:55', server: 1 };
```

## Automatic scanning (eq3.js)
Scans every 3 hours if there is any not discovered device.

```
var scanFrequency = 3 * 60 * 60 * 1000;
```

## Scan timeout (eq3.js)
30 seconds waiting for device discovery, till that time MQTT requests are waiting in queue.
Timeout is cancelled if all defined devices are discovered earlier.

```
var scanTimoutTime = 30000;
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
## Autorun

```
sudo crontab -e
#add at the end of file
@reboot /usr/bin/node /home/pi/eq3.js | /usr/bin/tee -a /home/pi/eq3.log
```
# Usage

## MQTT requests

* /eq3_device1/outwish/getInfo - gets info from EQ3 (see below)
* /eq3_device1/outwish/wishedTemperature [4.5-30] - sets temperature
* /eq3_device1/outwish/requestProfile
```
{"periods":[{"temperature":17,"from":0,"to":42,"fromHuman":0,"toHuman":7},{"temperature":18.5,"from":42,"to":129,"fromHuman":7,"toHuman":21.5},{"temperature":17,"from":129,"to":144,"fromHuman":21.5,"toHuman":24}],"dayOfWeek":0,"dayOfWeekName":"SATURDAY"}
```
* /eq3_device1/outwish/outwish/setProfile/[0-6] - 0-saturday, 1-sunday, 2-monday, ...
```
[{"temperature":17,"from":0,"to":42,"fromHuman":0,"toHuman":7},{"temperature":18.5,"from":42,"to":129,"fromHuman":7,"toHuman":21.5},{"temperature":17,"from":129,"to":144,"fromHuman":21.5,"toHuman":24}]
```
* /eq3_device1/outwish/boost [0|1]
* /eq3_device1/outwish/manualMode
* /eq3_device1/outwish/automaticMode
* /eq3_device1/outwish/ecoMode
* /eq3_device1/outwish/setLock [0|1]
* /eq3_device1/outwish/turn [0-off (4.5) | 1-on (30)]

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

# Integration with OPENHAB2

## Installation



## Integration

### Items

Create new file
```
/etc/openhab2/items/eq3.items
```
With following content:
```
Number eq3_device1_getInfo                "getInfo [%d]"                          (eq3_device1_gValues)     {mqtt=">[broker:/eq3_device1/outwish/getInfo:command:*:default]"}
Number eq3_device1_setTemperature         "setTemperature [%.1f °C]"              (eq3_device1_gValues)     {mqtt=">[broker:/eq3_device1/outwish/wishedTemperature:command:*:default]"}
Number eq3_device1_boost                  "boost [%d]"                            (eq3_device1_gValues)     {mqtt=">[broker:/eq3_device1/outwish/boost:command:*:default]"}
Number eq3_device1_manualMode             "manualMode [%d]"                       (eq3_device1_gValues)     {mqtt=">[broker:/eq3_device1/outwish/manualMode:command:*:default]"}
Number eq3_device1_automaticMode          "automaticMode [%d]"                    (eq3_device1_gValues)     {mqtt=">[broker:/eq3_device1/outwish/automaticMode:command:*:default]"}
Number eq3_device1_ecoMode                "ecoMode [%d]"                          (eq3_device1_gValues)     {mqtt=">[broker:/eq3_device1/outwish/ecoMode:command:*:default]"}
Number eq3_device1_setLock                "setLock [%d]"                          (eq3_device1_gValues)     {mqtt=">[broker:/eq3_device1/outwish/setLock:command:*:default]"}
Number eq3_device1_turn                   "turn [%d]"                             (eq3_device1_gValues)     {mqtt=">[broker:/eq3_device1/outwish/turn:command:*:default]"}

Number eq3_device1_rssi                   "RSSI [%d dbm]"                         (eq3_device1_gValues)     {mqtt="<[broker:/eq3_device1/in/rssi:state:default]"}
Number eq3_device1_targetTemperature      "targetTemperature [%.1f °C]"           (eq3_device1_gValues)     {mqtt="<[broker:/eq3_device1/in/targetTemperature:state:default]"}
Number eq3_device1_valvePosition          "valvePosition [%d %%]"                 (eq3_device1_gValues)     {mqtt="<[broker:/eq3_device1/in/valvePosition:state:default]"}
Number eq3_device1_manual                 "manual [%d]"                           (eq3_device1_gValues)     {mqtt="<[broker:/eq3_device1/in/manual:state:default]"}
Number eq3_device1_openWindow             "openWindow [%d]"                       (eq3_device1_gValues)     {mqtt="<[broker:/eq3_device1/in/openWindow:state:default]"}
Number eq3_device1_needsHeating           "needsHeating [%d]"                     (eq3_device1_gValues)     {mqtt="<[broker:/eq3_device1/in/needsHeating:state:default]"}
Number eq3_device1_estimatedTemperature   "estimatedTemperature [%.1f °C]"        (eq3_device1_gValues)     {mqtt="<[broker:/eq3_device1/in/estimatedTemperature:state:default]"}
Number eq3_device1_lowBattery             "lowBattery [%d]"                       (eq3_device1_gValues)     {mqtt="<[broker:/eq3_device1/in/lowBattery:state:default]"}
Number eq3_device1_dst                    "dst [%d]"                              (eq3_device1_gValues)     {mqtt="<[broker:/eq3_device1/in/dst:state:default]"}
Number eq3_device1_holiday                "holiday [%d]"                          (eq3_device1_gValues)     {mqtt="<[broker:/eq3_device1/in/holiday:state:default]"}

```

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
        eq3_device1_getInfo.sendCommand(0)        
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
