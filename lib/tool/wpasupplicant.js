var util = require('util');
var assert = require('assert');
var spawn = require('child_process').spawn;
var EventEmitter = require('events').EventEmitter;
var inherits = require('util').inherits;
var combine = require('stream-combiner');
var fs = require('fs');
var through = require('through');
var config = require('jsconfig');
var split = require('split');
var async = require('async');
var DBus = require('ndbus');

var dbusid = require('../util').dbusid;

var INTERFACE_SIGNALS = ['InterfaceAdded','InterfaceRemoved', 'PropertiesChanged']
var NS = {
    freedesktop: {
        DBusProps:'org.freedesktop.DBus.Properties',
    },
    wpa_supplicant: {
        daemon:'fi.w1.wpa_supplicant1',
        interface:'fi.w1.wpa_supplicant1.Interface',
        path:'/fi/w1/wpa_supplicant1',
        bss:'fi.w1.wpa_supplicant1.BSS',
    },
}

function clear_events() {
    var con = this;
    INTERFACE_SIGNALS.forEach(function(event) {
        con[event].off();
    });
}


module.exports = WPASupplicant;
inherits(WPASupplicant, EventEmitter);
function WPASupplicant(opts) {
    opts = opts || {};
    this.connected = false;
    this.driver = opts.driver || 'wext';
//     this.driver = opts.driver || 'nl80211';
    this.iface = opts.iface;
    this._cache = {};
    assert(this.iface, "interface needed!");
    // make sure log file exists
    fs.writeFileSync('/var/run/wpa_supplicant.log', "");
    // spawn that shit
    var args = ['-D' + this.driver, '-i' + this.iface, '-du',
        '-C/var/run/wpa_supplicant',
        '-f/var/run/wpa_supplicant.log',
        '-P/var/run/wpa_supplicant.pid',
    ];
    if (config.debug) console.log("wpa_supplicant", args.join(' ') );
    this.fd = spawn('wpa_supplicant', args, {
        stdio:['ignore', 'ignore', process.stderr],
    });
    this.fd.stdout = fs.createReadStream('/var/run/wpa_supplicant.log');
    this.fd.once('close', this.emit.bind(this, 'close'));
    this.fd.once('error', this.emit.bind(this, 'error'));
    this.fd.once('exit', this.emit.bind(this, 'exit'));
    process.once('exit', this.fd.kill.bind(this.fd));
    process.once('uncaughtError', this.fd.kill.bind(this.fd,'SIGKILL'));
    if (config.debug) this.fd.stdout.pipe(process.stdout, {end:false});
    this.fd.stdout.pipe(this._event_parser());
//     setTimeout(this.emit.bind(this, 'dbus'), 1000);
    this.once('dbus', function () {
        this.connect(opts.bus || DBus(true)); // wpa_supplicant is mostly always listening on system bus
    }.bind(this));
}
var proto = WPASupplicant.prototype;

proto.url = {
    name:  NS.wpa_supplicant.daemon,
    path:  NS.wpa_supplicant.path,
    iface: NS.wpa_supplicant.daemon,
};

proto._event_parser = function _event_parser() {
    var that = this;
    return combine(split(), through(write));

    function write(buf) {
        var line = buf.toString('utf8');
        if (/^dbus:/.test(line)) {
            if (/Register D-Bus object '\/fi\/w1\/wpa_supplicant1'/.test(line))
                that.emit('dbus');
        }
    }
};

proto.proxy = function proxy(id, callback) {
//     console.log("proxy", id, !!this._cache[id],id.split('>') )
    if (!this.bus) return this.emit('warn', "no bus to proxy an interface");
    if (this._cache[id]) return callback(null, this._cache[id]);
    var s = id.split('>');
    this.bus.proxy(s[0], s[1], s[2], function (err, con) {
        if (err) return callback('proxy:'+err);
        this._cache[id] = con;
        this.once('close', con.$.bind(con));
        callback(null, con);
    }.bind(this));
};

proto.connect = function connect(bus) {
    var that = this;
    this.bus = bus;
    this.ref = {};
    async.auto({
        get_iface:this.proxy.bind(this, dbusid(this.url)),
        set_iface:['get_iface', function (callback, results) {
            var con = results.get_iface;
            that.ref.face = con;
            that.once('exit', clear_events.bind(con));
            INTERFACE_SIGNALS.forEach(function(event) {
                con[event].on(that.emit.bind(that, event));
            });
            callback(null);
        }],
        get_props:this.proxy.bind(this, dbusid(this.url.name, this.url.path,
                                               NS.freedesktop.DBusProps)),
        set_props:['get_props', function (callback, results) {
            var con = results.get_props;
            that.ref.props = con;
            callback(null);
        }],
    }, function (err) {
        if (err) return that.emit('error', "connect:"+err);
        that.connected = true;
        if (config.debug) console.log('connected to dbus interface of wpa_supplicant');
        that.emit('connect', that.ref.face);
    });
};

proto.createInterface = function createInterface(callback, opts) {
    if (!this.connected) return this.emit('warn', "not connected to create an interface");
    var that = this;
    opts = opts || {};
    opts.autoRemove = opts.autoRemove !== false ? true : false;
    this.ref.face.CreateInterface({
        Ifname:this.iface,
        Driver:this.driver,
    }, function (err, path) {
        if (err && opts.autoRemove && /wpa_supplicant already controls this interface/.test(err)) {
            opts.autoRemove = false;
            async.waterfall([
                function (callback) {
                    that.ref.face.GetInterface(that.iface, callback);
                },
                function (path, callback) {
                    if (config.debug) console.log("remove existing interface", path);
                    that.ref.face.RemoveInterface(path, callback);
                },
            ], function (err) {
                if (err) return callback("createInterface:waterfall:"+err);
                that.createInterface(callback, opts);
            });
        } else callback(err ? "createInterface:"+err : null, path);
    });
};

proto.addNetwork = function addNetwork(opts, callback) {
    if (!this.connected) return this.emit('warn', "not connected to add a network");
    this.ref.face.AddNetwork(opts, callback);
};

proto.getBSSs = function getBSSs(node_path, ifname, callback) {
    var that = this;
    this.proxy(dbusid(this.url.name, node_path, ifname), function (err, area) {
        if (err) return callback("getBSSs:"+err);
        area.Scan({Type:'active'}, function (err) {
            if (err) return callback("getBSSs:scan:"+err);
            area.ScanDone.once(function (success) {
                if (!success) return callback("scan wasn't successful!");
                var id = dbusid(that.url.name, node_path, NS.freedesktop.DBusProps);
                that.proxy(id, function (err, props) {
                    if (err) return callback("getBSSs:scan:ScanDone:"+err);
                    props.Get(NS.wpa_supplicant.interface, 'BSSs', callback);
                });
            });
        });
    });
};

proto._norm_bss_scan = function _norm_bss_scan(results) {
    var res = {};
    res.mac = new Buffer(results[0])
        .toString('hex')
        .replace(/(\w{2})(?!\0|$)+/g,'$1\0')
        .split(/\0/).join(':');
    res.ssid = new Buffer(results[1], 'binary')
        .toString('ascii');
    res.mode    = results[2];
    res.signal  = results[3];
    res.freq    = results[4];
    var keyMgmt = (results[5].KeyMgmt || []).concat(results[6].KeyMgmt || []);
    res.wep     = keyMgmt.some(function(v) {return /wep/.test(v)});
    res.wpa     = keyMgmt.some(function(v) {return /wpa/.test(v)});
    return res;
};

proto.scan = function (ifpath, callback) {
    var that = this;
    this.getBSSs(ifpath, NS.wpa_supplicant.interface, function (err, bss) {
        if (err) return callback("scan:getBSSs:"+err);
        async.map(bss, function (bss_path, cb) {
            var id = dbusid(that.url.name, bss_path, NS.freedesktop.DBusProps);
            that.proxy(id, function (err, con) {
                var callback = function () {con&&con.$();return cb.apply(this, arguments)};
                if (err) return callback("bus.proxy:"+err);
                async.map(['BSSID','SSID','Mode','Signal','Frequency','RSN','WPA'],
                function (key, cb) {
                    con.Get(NS.wpa_supplicant.bss, key, function (err, prop) {
                        if (err && !/No such property/.test(err))
                            return cb("get.prop:"+err);
                        cb(null, prop);
                    });
                }, function (err, results) {
                    if (err) return callback("norm_map:"+err);
                    var signal = proto._norm_bss_scan(results);
                    callback(null, signal);
                });
            });
        }, function (err, results) {
            if (err) return callback("scan:"+err);
            var signals = {};
            results.forEach(function (signal) {
                signals[signal.mac] = signal;
            });
            callback(null, signals);
        });
    });
};

proto.close = function close() {
    if (this.closed) return;
    this.closed = true;
//     this.once('close', function () {
//         this.removeAllListeners();
//         delete this._cache;
//         delete this.bus;
//     }.bind(this));
    if (config.debug) console.log("kill")
    this.fd.kill();
};



if (!module.parent) require('../config')(function () {
    var iface = 'wlan0';
    var inspect = require('eyes').inspector({maxLength:4096});
//     setInterval(function () {},10000)
    var sup = new WPASupplicant({ iface:iface });
    sup.on('close', console.log.bind(console, 'close'));
    sup.on('exit', console.log.bind(console, 'exit'));
    sup.on('warn', console.warn.bind(console));
    sup.on('error', console.error.bind(console));
    sup.once('connect', function () {
        sup.ref.props.Get(sup.url.name, 'EapMethods', console.log.bind(console, 'EapMethods'))
        sup.createInterface(function (err, path) {
            if (err) return console.error(1,err);
            console.log('path', path);
            sup.scan(path, function (err, signals) {
                if (err) return console.error(err)
                inspect(signals)
//                 process.exit()
            });
        });
    });
    if (config.debug)
        INTERFACE_SIGNALS.forEach(function(event) {
            sup.on(event, console.log.bind(console,"#######", event));
        });
});

