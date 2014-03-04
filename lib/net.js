var fs = require('fs');
var async = require('async');
var ip = require('./tool/ip');

var net = module.exports;

net.getAllInterfaces = function getAllInterfaces(callback) {
    ip.scan(null, function (err, scan) {
        if (err) return callback(err);
        callback(null, Object.keys(scan));
    });
};

net.getHWInterfaces = function getHWInterfaces(callback) {
    net.getAllInterfaces(function (err, interfaces) {
        if (err) return callback(err);
        async.filter(interfaces, function (iface, cb) {
            fs.exists("/sys/class/net/" + iface + "/device", cb);
        }, function (result) {callback(null, result)});
    });
};

net.getInterfaces = net.getHWInterfaces; // alias


if (!module.parent) {
    net.getInterfaces(function (err, interfaces) {
        if (err) console.error(err)
        else console.log(interfaces)
    });
    net.getAllInterfaces(function (err, interfaces) {
        if (err) console.error(err)
        else console.log(interfaces)
    });
}