// constants:
exports.mqttServer = { address: 'tcp://localhost', username: 'user', password: 'pass' };
exports.server = 1;

// mapping
var btNames = {};

exports.btNames['eq3_device1'] = { name: 'eq3_device1', address: '00:11:22:33:44:55', server: 1 };

exports.btNames = btNames;

// uncomment if there is prefix for mqtt name
//exports.prefix = 'eq3_';
