var spawn = require('child_process').spawn;
var combine = require('stream-combiner');
var through = require('through');
var split = require('split');

var iw = module.exports;

iw._parser = function parser(cb) {
    var signals = {};
    var current = [], prev;

    return combine(split(), through(write, end));

    function write (buf) {
        var line = buf.toString('utf8');
        var level = /^(\s*)/.exec(line)[1].length;

        if (/^BSS\s/.test(line)) {
            var mac = line.split(/\s+/)[1];
            signals[mac] = {
                associated: /-- associated$/.test(line),
            };
            current = [ signals[mac] ];
            current.__mac = mac;
            return;
        }
//         if (current.__mac == '2c:e6:cc:03:ce:3c') console.log(line)//current)

        if (level > current.length) {
            current.push({ _key: prev.key, _value: prev.value });
        }
        else if (level < current.length) {
            var c = current.pop();
//             console.error('POP',c,"==============================================")
            if (c && c._key) current[current.length - 1][c._key] = c;
//             else console.error("=========================================\ngets lost!\n\n",c,"\n\n=========================================")
//             console.log(current[current.length - 1])
        }

        var m = /^\s+([^:]+):\s*(.*)/.exec(line);
        require('colors')
//         console.log(line.bold.red, m && m[1].bold.green, current[current.length - 1])
        if (!m) return;

        var key = m[1].replace(/^\*\s*/, '').toLowerCase();
        var value = m[2].replace(/^\*\s*/, '');

        current[current.length - 1][key] = value;
        prev = { key: key, value: value };
    }

    function end () {
        cb(null, signals);
    }
}

iw.norm = function norm(callback, err, scan) {
    if (err) return callback(err);
    Object.keys(scan).forEach(function (mac) {
        var s = scan[mac];
        if (s['ds parameter set'])
            s.channel = parseInt(s['ds parameter set'].replace(/\D+/g, ''));
        if (!s.channel || isNaN(s.channel))
            if (s['ht operation'] && s['ht operation']['primary channel'])
                s.channel = parseInt(s['ht operation']['primary channel']._value);
    });
    callback(null, scan);
};

iw.scan = function scan(iface, cb) {
    var ps = spawn('iw', [ 'dev', iface, 'scan' ]);//, 'passive' ]);
    ps.once('exit', function (code) {
        if (code !== 0) cb(new Error('non-zero exit code running iw scan'));
        cb = function () {};
    });
    ps.stderr.pipe(process.stderr, {end:false});
    ps.stdout.pipe(iw._parser(iw.norm.bind(this, cb)));
};


if (!module.parent) {
   var inspect = require('eyes').inspector({maxLength:4096});
    inspect(iw.scan("wlan0", function (err, scan) {
        if (err) {
            console.error(err)
            return;
        }
        inspect(scan)
        console.log.apply(console, Object.keys(scan).map(function (x) {return "\n"+x+" :: "+scan[x].ssid} ))
        console.log("done.")
    }))
}