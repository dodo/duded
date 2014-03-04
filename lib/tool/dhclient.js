var assert = require('assert');
var spawn = require('child_process').spawn;
var EventEmitter = require('events').EventEmitter;
var inherits = require('util').inherits;
var config = require('jsconfig');
var async = require('async');



module.exports = DHClient;
inherits(DHClient, EventEmitter);
function DHClient(opts) {
    opts = opts || {};
    this.iface = opts.iface;
    assert(this.iface, "interface needed!");
    // spawn that shit
    this.fd = spawn('dhclient', ['-v', this.iface ]);
    this.fd.once('close', this.emit.bind(this, 'close'));
    this.fd.once('exit', this.emit.bind(this, 'exit'));
    process.once('exit', this.fd.kill.bind(this.fd));
    process.once('uncaughtError', this.fd.kill.bind(this.fd,'SIGKILL'));
    if (config.debug) {
        this.fd.stdout.pipe(process.stdout, {end:false});
        this.fd.stderr.pipe(process.stderr, {end:false});
    }
}
var proto = DHClient.prototype;

proto.close = function close() {
    if (this.closed) return;
    this.closed = true;
    this.once('close', function () {
        this.removeAllListeners();
    }.bind(this));
    this.fd.kill();
};


if (!module.parent) require('../config')(function () {
    new DHClient({ iface:'eth0' })
});