var spawn = require('child_process').spawn;
var combine = require('stream-combiner');
var through = require('through');
var split = require('split');

var ip = module.exports;

ip._parser = function parser(cb) {
    var interfaces = {};
    var current = [], prev;

    return combine(split(), through(write, end));

    function write (buf) {
        var line = buf.toString('utf8');
        if (/^(\d+):\s(\w+):\s/.test(line)) {
            current = {
                v4:[], v6:[],
                mode: line.split(/[<>]/)[1].split(','),
            };
            interfaces[line.split(/:\s/)[1]] = current;
            var key;
            line.split(/>\s/)[1].split(/\s+/).forEach(function (tok) {
                if (key) {
                    current[key] = tok;
                    key = null;
                } else {
                    key = tok;
                }
            })
        } else if (/^(\s+)link\/ether\s/.test(line)) {
            var part = line.split(/\s+/);
            current.link = { mac:part[2], brd:part[4] };
        } else if (/^(\s+)inet6\s/.test(line)) {
            var part = line.split(/\s+/);
            current.v6.push({
                addr: part[2].split(/\//)[0],
                range:part[2].split(/\//)[1],
                brd:part[4],
            });
        } else if (/^(\s+)inet\s/.test(line)) {
            var part = line.split(/\s+/);
            current.v4.push({
                addr: part[2].split(/\//)[0],
                range:part[2].split(/\//)[1],
                brd:part[4],
            });
        }
    }

    function end () {
        cb(null, interfaces);
    }
}


ip.scan = function scan(iface, cb) {
    var ps = spawn('ip', [ 'addr', 'show'].concat(iface ? ['dev', iface] : []));
    ps.once('exit', function (code) {
        if (code !== 0) cb(new Error('non-zero exit code running ip addr show'));
        cb = function () {};
    });
    ps.stderr.pipe(process.stderr, {end:false})
    ps.stdout.pipe(ip._parser(cb));
};


if (!module.parent) {
   var inspect = require('eyes').inspector({maxLength:4096});
    inspect(ip.scan(null, function (err, scan) {
        if (err) {
            console.error(err)
            return;
        }
        inspect(scan)
        console.log("done.")
    }))
}