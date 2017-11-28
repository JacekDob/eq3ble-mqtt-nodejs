'use strict';

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.parseInfo = parseInfo;
exports.parseProfile = parseProfile;

/* eslint no-bitwise: 0 */
var writeCharacteristic = exports.writeCharacteristic = '3fa4585ace4a3baddb4bb8df8179ea09';
var notificationCharacteristic = exports.notificationCharacteristic = 'd0e8434dcd290996af416c90f4e0eb2a';
var serviceUuid = exports.serviceUuid = '3e135142654f9090134aa6ff5bb77046';

var payload = exports.payload = {
  getInfo: function getInfo() {
    return new Buffer('03', 'hex');
  },
  activateBoostmode: function activateBoostmode() {
    return new Buffer('4501', 'hex');
  },
  deactivateBoostmode: function deactivateBoostmode() {
    return new Buffer('4500', 'hex');
  },
  setAutomaticMode: function setAutomaticMode() {
    return new Buffer('4000', 'hex');
  },
  setManualMode: function setManualMode() {
    return new Buffer('4040', 'hex');
  },
  setVacationMode: function setVacationMode(endTime, setPointTemperature) { // == vacation

/*
    public SetVacationModeCommand(Calendar endTime, Number setPointTemperature) {
        this.commandData = new byte[6];
        this.commandData[0] = (byte) 64;
        this.commandData[1] = Byte.MIN_VALUE;
        byte[] bArr = this.commandData;
        bArr[1] = (byte) (bArr[1] | ((byte) ((int) (setPointTemperature.doubleValue() * 2.0d))));
        this.commandData[2] = (byte) endTime.get(5);
        this.commandData[3] = (byte) (endTime.get(1) % 100);
        this.commandData[4] = (byte) ((endTime.get(11) * 2) + (endTime.get(12) / 30));
        this.commandData[5] = (byte) (endTime.get(2) + 1);
    }
*/
    var b = Buffer.alloc(6);
    b[0] = 0x40;
    b[1] = setPointTemperature * 2;
    b[2] = date.getDate(); // day
    b[3] = (date.getFullYear() % 100);
    b[4] = date.getHours() * 2 + date.getMinutes() / 30;
    b[5] = (date.getMonth() + 1);

    return b;

    //return new Buffer('4080', 'hex');
  },
  lockThermostat: function lockThermostat() {
    return new Buffer('8001', 'hex');
  },
  unlockThermostat: function unlockThermostat() {
    return new Buffer('8000', 'hex');
  },
  setTemperature: function setTemperature(temperature) {
    return new Buffer('41' + (temperature <= 7.5 ? '0' : '') + (2 * temperature).toString(16), 'hex');
  },
  setTemperatureOffset: function setTemperatureOffset(offset) {
    return new Buffer('13' + (2 * offset + 7).toString(16), 'hex');
  },
  setDay: function setDay() { // == comfort
    return new Buffer('43', 'hex');
  },
  setNight: function setNight() { // == eco
    return new Buffer('44', 'hex');
  },
  setComfortTemperatureForNightAndDay: function setComfortTemperatureForNightAndDay(night, day) {
    var tempNight = (2 * night).toString(16);
    var tempDay = (2 * day).toString(16);
    return new Buffer('11' + tempDay + tempNight, 'hex');
  },
  setWindowOpen: function setWindowOpen(temperature, minDuration) {
    var temp = (2 * temperature).toString(16);
    var dur = (minDuration / 5).toString(16);
    return new Buffer('11' + temp + dur, 'hex');
  },
  setDatetime: function setDatetime(date) {
    //date.setTime(date.getTime() + date.getTimezoneOffset() * 60 * 1000);

    var b = Buffer.alloc(7);
    b[0] = 3;
    b[1] = (date.getFullYear() % 100);
    b[2] = (date.getMonth() + 1);
    b[3] = date.getDate();
    b[4] = date.getHours();
    b[5] = date.getMinutes();
    b[6] = date.getSeconds();

//    console.log('Setting date', b);

    return b;
  },
  requestProfile: function requestProfile(day) {
    var b = Buffer.alloc(2);
    b[0] = 32;
    b[1] = day;
    return b;
  },
  setProfile: function setProfile(day, periods) {
    var b = Buffer.alloc(16);
    b[0] = 16;
    b[1] = day;
    for (var i=0;i<periods.length && i<7;i++) {
      b[(i*2)+2] = periods[i].temperature * 2;
      if (periods[i].toHHMM) {
        var hhmm = periods[i].toHHMM.split(':');
        var humanNumber = parseInt(hhmm[0]) + parseInt(hhmm[1]);
        b[(i*2)+3] = humanNumber / 10;
      } else if (periods[i].to) {
        b[(i*2)+3] = periods[i].to;
      }
    }
    return b;
  }
};

var status = {
  manual: 1,
  holiday: 2,
  boost: 4,
  dst: 8,
  openWindow: 16,
  lock: 32,
  unknown2: 64,
  lowBattery: 128
};

function parseInfo(info) {
  var statusMask = info[2];
  var valvePosition = info[3];
  var targetTemperature = info[5] / 2;

  return {
    status: {
      manual: (statusMask & status.manual) === status.manual,
      holiday: (statusMask & status.holiday) === status.holiday,
      boost: (statusMask & status.boost) === status.boost,
      dst: (statusMask & status.dst) === status.dst,
      openWindow: (statusMask & status.openWindow) === status.openWindow,
      lock: (statusMask & status.lock) === status.lock,
      unknown2: (statusMask & status.unknown2) === status.unknown2,
      lowBattery: (statusMask & status.lowBattery) === status.lowBattery
    },
    valvePosition: valvePosition,
    targetTemperature: targetTemperature
  };
}

var dayNames = [ 'SATURDAY', 'SUNDAY', 'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY' ];

function parseProfile(buffer) {
  var profile = {};
  var periods = [];
  profile.periods = periods;
  if (buffer[0] == 33) {
    profile.dayOfWeek = buffer[1]; // 0-saturday, 1-sunday
    profile.dayOfWeekName = dayNames[profile.dayOfWeek];
    for (var i=2; i<buffer.length;i+=2) {
      if (buffer[i] != 0) {
          var temperature = (buffer[i] / 2);
	  var to = buffer[i+1];
          var toHHMM = toHHMMString(to * 10 / 60);
	  var from = periods.length == 0 ? 0 : periods[periods.length-1].to;
	  var fromHHMM = periods.length == 0 ? '0:00' : periods[periods.length-1].toHHMM;
          periods.push({ idx: 'idx'+(i/2-1), temperature: temperature, from: from, to: to, fromHHMM: fromHHMM, toHHMM: toHHMM });
      }
    }
    for (var i=0; i<profile.periods.length;i++) {
//       delete profile.periods[i].from;
//       delete profile.periods[i].to;
    }
  }  
  return profile;
}

function toHHMMString(f) {
	var rounded = Math.floor(f);
	var rest = f - rounded;
	var h = rounded;
	var m = Math.round(rest * 60);
	var mm = m < 10 ? '0' + m : m;
	return h + ':' + mm;
}
