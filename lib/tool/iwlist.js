var spawn = require('child_process').spawn;
var combine = require('stream-combiner');
var through = require('through');
var Iwlist = require('iwlist');
var split = require('split');

var iwlist = module.exports;
iwlist.if = {};


iwlist._parser = function parser(iface, cb) {
    var signals = {};
    var current = [], prev;
    var ended = false, pending = 0, error = null;
    return combine(split(), through(write, end));

    function write (buf) {
        if (error || ended) return;
        var line = buf.toString('utf8');

        if (/No scan results$/.test(line)) {
            ended = true;
            return;
        } else if (/^\s+Cell \d+ - Address: (\S+)/.test(line)) {
            var mac = line.split(/\s+/)[5];
            signals[mac] = {
//                 associated: false
            };
            pending++;
            iface.associated(function (err, associated) {
                pending--;
                if (err) return error = err;
                signals[mac].associated = associated;
                if (ended && !pending)
                    cb(error, signals);
            });
            current = [ signals[mac] ];
            return;
        }

        var m = /^\s+([^:]+):\s*(.*)/.exec(line);
//         require('colors')
//         console.log(line.bold.red, m && m[1].bold.green)
        if (!m) return;

        var key = m[1].replace(/^\*\s*/, '').toLowerCase();
        var value = m[2].replace(/^\*\s*/, '');
        if (/^Unknown:\s/.test(value)) return;

        var cur = current[current.length - 1][key];
        if (cur) {
            if (Array.isArray(cur)) cur.push(value);
            else current[current.length - 1][key] = [cur, value];
        }   else current[current.length - 1][key] = value;
        prev = { key: key, value: value };
    }

    function end () {
        ended = true;
        if (!pending){
            cb(error, signals);}
    }
}

iwlist.norm = function norm(callback, err, scan) {
    if (err) return callback(err);
    var res = {};
    Object.keys(scan).forEach(function (mac) {
        var s = scan[mac];
        console.log(s)
        res[mac] = {
            associated:s.associated,
            ssid:s.essid,
            freq:s.frequency,
            channel:s.channel,
            wep:s['encryption key'] === 'on',
        };
        var ie = !s.ie ? [] : Array.isArray(s.ie) ? s.ie : [s.ie];
        if (ie.length)
            if (ie.some(function(v) {return /wpa_ie/.test(v)}))
                res[mac].wpa = 'alt';
            else if (ie.some(function(v) {return /WPA Version 1/.test(v)}))
                res[mac].wpa = 1;
            else if (ie.some(function(v) {return /WPA2/.test(v)}))
                res[mac].wpa = 2;
    });
    callback(null, res);
};

iwlist.scan = function scan(iface, cb) {
    if (!iwlist.if[iface]) {
        iwlist.if[iface] = Iwlist(iface);
    }

    var ps = spawn('iwlist', [ iface, 'scan' ]);
    ps.once('exit', function (code) {
        if (code !== 0) cb(new Error('non-zero exit code running iwlist scan'));
        cb = function () {};
    });
    ps.stderr.pipe(process.stderr, {end:false});
    ps.stdout.pipe(iwlist._parser(iwlist.if[iface], iwlist.norm.bind(this,cb)));
};


if (!module.parent) {
   var inspect = require('eyes').inspector({maxLength:4096});
    inspect(iwlist.scan("wlan0", function (err, scan) {
        if (err) {
            console.error(err)
            return;
        }
        inspect(scan)
        console.log("done.")
    }))
}