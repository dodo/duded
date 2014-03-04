var exec = require('child_process').exec;
var async = require('async');

module.exports.whoami = function whoami(callback) {
    exec('whoami', function (err, name) {
        if (err) return callback(err);
        callback(null, name.toString('utf8').trim());
    });
};

function dbusid(name, node, iface) {
    if (name && typeof name === 'object')
         return dbusid(name.name, name.path, name.iface);
    else return [name, node, iface].join('>');
}; module.exports.dbusid = dbusid;


module.exports.createInterface = function createInterface(opts, callback) {
    opts = opts || {}; opts.url = opts.url || {};
    var that = this;
    async.waterfall([
        function (callback) {
            var id = dbusid(opts.url.name);
            console.log(1, id)
            if (that._cache[id]) return callback(null, that._cache[id]);
            that.bus.service(opts.url.name, function (err, service) {
                if (err) return callback('service:'+err);
                that.ref.service = service;
                that._cache[id] = service;
                callback(null, service);
            });
        },
        function (service, callback) {
            var id = dbusid(opts.url.name, opts.url.path);
            console.log(2, id)
            if (that._cache[id]) return callback(null, that._cache[id]);
            service.node(opts.url.path, function (err, node) {
                if (err) return callback('node:'+err);
                that._cache[id] = node;
                that.ref.node = node;
                service.node = node;
                callback(null, node);
            });
        },
        function (node, callback) {
            var id = dbusid(opts.url.name, opts.url.path, opts.url.iface);
            console.log(3, id)
            if (that._cache[id]) return callback(null, that._cache[id]);
            node.iface(opts.url.iface, opts.schema, function (err, face) {
                if (err) return callback('face:'+err);
                that._cache[id] = face;
                that.ref.face = face;
                node.face = face;
                callback(null, face);
            });
        },
    ], function (err, face) {
        if (err) return callback('ref:'+err);
        callback(null, face);
    });
};

// module.exports.interface = function interface()
