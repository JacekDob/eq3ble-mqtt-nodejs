'use strict';

Object.defineProperty(exports, "__esModule", {
  value: true
});

var _createClass = function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; }();

var _nobleDevice = require('noble-device');

var _nobleDevice2 = _interopRequireDefault(_nobleDevice);

var _interface = require('./interface');

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

var EQ3BLE = function () {
  function EQ3BLE(device) {
    _classCallCheck(this, EQ3BLE);

    _nobleDevice2.default.call(this, device);
    this.notificationCallbacks = [];
  }

  _createClass(EQ3BLE, [{
    key: 'onNotify',
    value: function onNotify() {
      var callback = this.notificationCallbacks.shift();

      for (var _len = arguments.length, args = Array(_len), _key = 0; _key < _len; _key++) {
        args[_key] = arguments[_key];
      }

      if (!callback) {
        this.emit.apply(this, ['unhandledNotification'].concat(args));
        return;
      }
      callback.apply(undefined, args);
    }
  }, {
    key: 'getNextNotification',
    value: function getNextNotification() {
      var _this = this;

      return new Promise(function (resolve, reject) {
        var timeoutId = void 0;
        var removeCallback = void 0;
        var callback = function callback() {
          clearTimeout(timeoutId);
          removeCallback();
          resolve.apply(undefined, arguments);
        };
        removeCallback = function removeCallback() {
          _this.notificationCallbacks = _this.notificationCallbacks.filter(function (cb) {
           return cb !== callback;
          });
        };
        _this.notificationCallbacks.push(callback);
        setTimeout(function () {
          removeCallback();
          reject();
        }, 1000);
      });
    }
  }, {
    key: 'writeAndGetNotification',
    value: function writeAndGetNotification(data) {
      var _this2 = this;

      return new Promise(function (resolve, reject) {
        _this2.getNextNotification().then(resolve, reject);
        _this2.writeDataCharacteristic(_interface.serviceUuid, _interface.writeCharacteristic, data, function (err) {
          if (err) reject(err);
        });
      });
    }
  }, {
    key: 'connectAndSetup',
    value: function connectAndSetup() {
      var _this3 = this;

      return new Promise(function (resolve, reject) {
        _nobleDevice2.default.prototype.connectAndSetup.call(_this3, function (error) {
          if (error) {
            reject(error);
            return;
          }
          _this3.notifyCharacteristic(_interface.serviceUuid, _interface.notificationCharacteristic, true, _this3.onNotify.bind(_this3), function (err) {
            if (err) {
              reject(err);
              return;
            }
            resolve();
          });
        });
      });
    }
  }, {
    key: 'getInfo',
    value: function getInfo() {
      return this.writeAndGetNotification(_interface.payload.setDatetime(new Date())).then(function (info) {
        return (0, _interface.parseInfo)(info);
      });
    }
  }, {
    key: 'setBoost',
    value: function setBoost(enable) {
      if (enable) {
        return this.writeAndGetNotification(_interface.payload.activateBoostmode()).then(function (info) {
        return (0, _interface.parseInfo)(info);
      });

      }
      return this.writeAndGetNotification(_interface.payload.deactivateBoostmode()).then(function (info) {
        return (0, _interface.parseInfo)(info);
      });
    }
  }, {
    key: 'automaticMode',
    value: function automaticMode() {
      return this.writeAndGetNotification(_interface.payload.setAutomaticMode()).then(function (info) {
        return (0, _interface.parseInfo)(info);
      });
    }
  }, {
    key: 'manualMode',
    value: function manualMode() {
      return this.writeAndGetNotification(_interface.payload.setManualMode()).then(function (info) {
        return (0, _interface.parseInfo)(info);
      });
    }
  }, {
    key: 'ecoMode',
    value: function ecoMode() {
      return this.writeAndGetNotification(_interface.payload.setEcoMode()).then(function (info) {
        return (0, _interface.parseInfo)(info);
      });
    }
  }, {
    key: 'setLock',
    value: function setLock(enable) {
      if (enable) {
        return this.writeAndGetNotification(_interface.payload.lockThermostat()).then(function (info) {
        return (0, _interface.parseInfo)(info);
      });
      }
      return this.writeAndGetNotification(_interface.payload.unlockThermostat()).then(function (info) {
        return (0, _interface.parseInfo)(info);
      });
    }
  }, {
    key: 'turnOff',
    value: function turnOff() {
      return this.setTemperature(4.5);
    }
  }, {
    key: 'turnOn',
    value: function turnOn() {
      return this.setTemperature(30);
    }
  }, {
    key: 'setTemperature',
    value: function setTemperature(temperature) {
      return this.writeAndGetNotification(_interface.payload.setTemperature(temperature)).then(function (info) {
        return (0, _interface.parseInfo)(info);
      });
    }
  }, {
    key: 'requestProfile',
    value: function requestProfile(day) {
      return this.writeAndGetNotification(_interface.payload.requestProfile(day)).then(function (profile) {
        return (0, _interface.parseProfile)(profile);
      });
    }
  }, {
    key: 'setProfile',
    value: function setProfile(day, periods) {
      return this.writeAndGetNotification(_interface.payload.setProfile(day, periods)).then(function (result) {
        return result[0] == 2 && result[1] == 2;
      });
    }
  }, {
    key: 'setTemperatureOffset',
    value: function setTemperatureOffset(offset) {
      return this.writeAndGetNotification(_interface.payload.setTemperatureOffset(offset));
    }
  }, {
    key: 'updateOpenWindowConfiguration',
    value: function updateOpenWindowConfiguration(temperature, duration) {
      return this.writeAndGetNotification(_interface.payload.setWindowOpen(temperature, duration));
    }
  }, {
    key: 'setDateTime',
    value: function setDateTime(date) {
      return this.writeAndGetNotification(_interface.payload.setDatetime(date));
    }
  }]);

  return EQ3BLE;
}();

EQ3BLE.SCAN_UUIDS = [_interface.serviceUuid];

EQ3BLE.is = function (peripheral) {
  return peripheral.advertisement.localName === 'CC-RT-BLE';
};

_nobleDevice2.default.Util.inherits(EQ3BLE, _nobleDevice2.default);

exports.default = EQ3BLE;
