var config = require('jsconfig');

var wifi = module.exports;

wifi.getSignals = function getSignals(iface, callback, opts) {
    opts = opts || {};
    if (config.user === 'root') {
        var error;
        var done = false;
        var sup = opts.face || new (require('./tool/wpasupplicant'))({ iface:iface });
        if (opts.face && sup.connected)
            return onConnect();
        sup.once('connect', onConnect);
        sup.once('error',   onError);
        return;
        function onConnect() {
            if (error) return;
            sup.removeListener('error', onError)
            sup.createInterface(function (err, path) {
                if (err) return callback('onConnect:createInterface:'+err);
                sup.scan(path, function (err, signals) {
                    if (err) {
                        if (config.debug) console.error('iw scan', err)
                        require('./tool/iw').scan(iface, callback);
                    } else {
                        if (config.debug) console.log('wpasupplicant scan')
                        return callback(null, signals);
                    }
                });
            });
        }
        function onError(err) {
            error = true;
            callback(err);
            if (sup !== opts.face) sup.close();
        }

    } else {
        if (config.debug) console.log('iwlist scan')
        require('./tool/iwlist').scan(iface, callback);
    }
};

if (!module.parent) require('./config')(function () {
    wifi.getSignals('wlan0', function (err, signals) {
        if (err) console.error("getSignals:"+err)
        var Table = require('easy-table');
        var table = new Table;
        Object.keys(signals || {}).forEach(function (mac) {
            var signal = signals[mac];
// if (mac == '02:27:d7:ee:5f:ee')
// console.log(signal);
            table.cell('mac', mac);
            ['signal', 'ssid', 'freq', 'channel'].forEach(function (key) {
                var val = signal[key] === undefined ? "?" : "" + signal[key];
                table.cell(key, val);
            });
            table.cell('sec', signal.wpa ? 'WPA' : signal.wep ? 'WEP' : 'OPEN')
            table.newRow();
        });
        console.log(table.toString())
    });
});
