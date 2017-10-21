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
Copy eq3blemqtt to /etc/init.d/eq3blemqtt

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

```
/etc/openhab2/items/eq3.items
```

With following content:

```
Switch		eq3_device1_getInfo				"getInfo [%s]"                          (gEQ3_getInfo)				{mqtt=">[broker:/eq3_eq3_device1/outwish/getInfo:command:*:MAP(onoff.map)]"}
Switch		eq3_device1_turn					"turn [%s]"                             (gEQ3_turn)					{mqtt="<[broker:/eq3_eq3_device1/in/targetTemperature:state:MAP(temperature.map)], >[broker:/eq3_eq3_device1/outwish/turn:command:*:MAP(onoff.map)]"}
Switch		eq3_device1_mode					"automatic mode [%s]"                   (gEQ3_mode)					{mqtt="<[broker:/eq3_eq3_device1/in/mode:state:MAP(onoff.map)], >[broker:/eq3_eq3_device1/outwish/mode:command:*:MAP(onoff.map)]"}
Number		eq3_device1_targetTemperature		"target temperature [%.1f]"             (gEQ3_targetTemperature)	{mqtt="<[broker:/eq3_eq3_device1/in/targetTemperature:state:default], >[broker:/eq3_eq3_device1/outwish/targetTemperature:command:*:default]"}
Switch		eq3_device1_boost					"boost [%d]"							(gEQ3_boost)				{mqtt="<[broker:/eq3_eq3_device1/in/boost:state:MAP(onoff.map)], >[broker:/eq3_eq3_device1/outwish/boost:command:*:MAP(onoff.map)]"}

String		eq3_device1_address				"MAC address [%s]"                      							{mqtt="<[broker:/eq3_eq3_device1/in/address:state:default]"}
Number		eq3_device1_rssi					"RSSI [%d dbm]"                         (gPersist)					{mqtt="<[broker:/eq3_eq3_device1/in/rssi:state:default]"}
Number		eq3_device1_valvePosition			"valvePosition [%d %%]"                 (gPersist)					{mqtt="<[broker:/eq3_eq3_device1/in/valvePosition:state:default]"}
Switch		eq3_device1_openWindow				"openWindow [%s]"                       (gPersist)					{mqtt="<[broker:/eq3_eq3_device1/in/openWindow:state:MAP(onoff.map)]"}
Switch		eq3_device1_lowBattery				"lowBattery [%s]"                       (gPersist)					{mqtt="<[broker:/eq3_eq3_device1/in/lowBattery:state:MAP(onoff.map)]"}
Switch		eq3_device1_dst					"dst [%s]"                              							{mqtt="<[broker:/eq3_eq3_device1/in/dst:state:MAP(onoff.map)]"}
Switch		eq3_device1_holiday				"holiday [%s]"                          							{mqtt="<[broker:/eq3_eq3_device1/in/holiday:state:MAP(onoff.map)]"}

Switch		eq3_device1_needsHeating			"needsHeating [%s]"                     							{mqtt="<[broker:/eq3_eq3_device1/in/needsHeating:state:MAP(onoff.map)]"}
Number		eq3_device1_estimatedTemperature	"estimatedTemperature [%.1f °C]"        							{mqtt="<[broker:/eq3_eq3_device1/in/estimatedTemperature:state:default]"}
DateTime	eq3_device1_lastupdate				"last update [%1$ta %1$tR]"				(gPersist)					{mqtt="<[broker:/empty/empty:state:default],>[broker:/eq3_eq3_device1/outwish/getInfo:command:state:default]"}
Number		eq3_device1_fail					"fail [%d]"                             (gPersist)					{mqtt="<[broker:/eq3_eq3_device1/in/fail:state:default]"}
```
### Sitemap

```
/etc/openhab2/sitemaps/_default.items
```

With following content:

```
Text 			item=eq3_device1_valvePosition				label="Device 1 [%d %%]" 									icon="heating" 			labelcolor=[eq3_device1_lastupdate>1920="red",eq3_device1_lastupdate>960="orange"] 	valuecolor=[eq3_device1_mode==OFF="orange",eq3_device1_mode==ON="green"] {
	Selection 	item=eq3_device1_targetTemperature			label="Temperatura zadana"									icon="temperature"		mappings=[4.5="OFF", 5.0="5.0 °C", 5.5="5.5 °C", 6="6 °C", 6.5="6.5 °C", 7="7 °C", 7.5="7.5 °C", 8="8 °C", 8.5="8.5 °C", 9="9 °C", 10="10 °C", 10.5="10.5 °C", 11="11 °C", 11.5="11.5 °C", 12="12 °C", 12.5="12.5 °C", 13="13 °C", 13.5="13.5 °C", 14="14 °C", 14.5="14.5 °C", 15="15 °C", 15.5="15.5 °C", 16="16 °C", 16.5="16.5 °C", 17="17 °C", 17.5="17.5 °C", 18="18 °C", 18.5="18.5 °C", 19="19 °C", 19.5="19.5 °C", 20="20 °C", 20.5="20.5 °C", 21.5="21.5 °C", 22="22 °C", 22.5="22.5 °C", 23="23 °C", 23.5="23.5 °C", 24="24 °C", 24.5="24.5 °C", 25="25 °C", 25.5="25.5 °C", 26="26 °C", 26.5="26.5 °C", 27="27 °C", 27.5="27.5 °C", 28="28 °C", 29.5="29.5 °C", 30="ON"]	valuecolor=[>20="red",>=19.5="orange",==19="green",<18="blue"]
	Text 		item=eq3_device1_valvePosition				label="Połozenie głowicy [%d %%]"							icon="heating"
	Switch 		item=eq3_device1_mode						label="Tryb []"												icon="switch"			mappings=[OFF="Manual",ON="Auto"]
	Switch 		item=eq3_device1_turn						label="Włączenie []"										icon="fire"				mappings=[OFF="Wyłącz", ON="Włącz"]
	Switch 		item=eq3_device1_boost              		label="Boost []"		                        			icon="fire-on"          mappings=[OFF="Nie", ON="Tak"]				

	Text 		item=eq3_device1_openWindow				label="Okno [MAP(otwartezamkniete.map):%s]"					icon="window"			valuecolor=[==ON="red",==OFF="green"]
	Text 		item=eq3_device1_lowBattery				label="Niski poziom baterii [MAP(taknie.map):%s]"			icon="battery"			valuecolor=[==ON="red",==OFF="green"]
	Text 		item=eq3_device1_rssi						label="RSSI [-%d dbm]"										icon="qualityofservice"	valuecolor=[>=-80="green",>-90="orange",<90="red"]
	Text 		item=eq3_device1_lastupdate				label="Aktualizacja [%1$tY-%1$tm-%1$td %1$tH:%1$tM:%1$tS]"	icon="time"				valuecolor=[>1920="red",>960="orange",<=960="green"]
	Switch 		item=eq3_device1_getInfo					label="Status []"											icon="network-on"		mappings=[ON="Pobierz"]
	Text 		item=eq3_device1_estimatedTemperature		label="Szacowana temperatura [%.1f °C]"						icon="heating"
	Text 		item=eq3_device1_needsHeating				label="Powinno grzać [MAP(taknie.map):%s]"					icon="fire"
	Text 		item=eq3_device1_dst						label="Czas letni [MAP(taknie.map):%s]"						icon="sun"				
	Text 		item=eq3_device1_address																				icon="bluetooth"
}

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
