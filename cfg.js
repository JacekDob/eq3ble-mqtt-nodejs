// constants:
exports.mqttServer = { address: 'tcp://localhost', username: 'username', password: 'password' };
// exports.server = 1;
var servers = {};
servers['192.168.1.11'] = 1;
servers['192.168.1.12'] = 2;

// mapping
var btNames = {};
btNames['eq3_device1'] = { name: 'eq3_device1', friendlyname: 'device 1', address: '00:11:22:33:44:55', server: 1 };
exports.btNames = btNames;

exports.prefix = 'eq3_';
exports.serverChoiceMethod = 'manual';

exports.scanFrequency = 3 * 60 * 60 * 1000;
exports.scanStarted;
exports.scanTimeoutTime = 15 * 1000;
exports.connectTimeout = 15 * 1000;
exports.retries = 1;
exports.waitAfterFail = 5 * 60 * 1000;
