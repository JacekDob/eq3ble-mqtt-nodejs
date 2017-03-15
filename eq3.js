// console log

function log(level, message) {
    var date = new Date();
    date.setTime(date.getTime() - date.getTimezoneOffset() * 60 * 1000);

    var d = '[' + cfg.server + '][' + date.toISOString().replace(/T/, ' ').replace(/\..+/, '') + ']';
    var l = '[' + level + ']';
    console.log(d + ' ' + l + ' ' + message);
}

function logL(message) {
    log('LOG ', message);
}

function logI(message) {
    log('INFO', message);
}

function logV(message) {
    log('VERB', message);
}

function logE(message) {
    log('ERRO', message);
}

function logW(message) {
    log('WARN', message);
}
