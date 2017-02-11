// constants:
exports.mqttServer = { address: 'tcp://localhost', username: 'user', password: 'pass' };
exports.server = 1;

// mapping
exports.btNames = {};

exports.btNames['00:11:22:33:44:55'] = { name: 'eq3_device1', address: '00:11:22:33:44:55', server: 1 };
exports.btNames['eq3_device1'] = exports.btNames['00:11:22:33:44:55'];
