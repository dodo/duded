var EventEmitter = require('events').EventEmitter;
var inherits = require('util').inherits;
var config = require('jsconfig');
var async = require('async');
var DBus = require('ndbus');
var createInterface = require('../util').createInterface;

var NS = {
    duded: {
        daemon: 'org.duded.daemon',
        path: '/',
    },
};

module.exports = DBusAPI;
inherits(DBusAPI, EventEmitter);
function DBusAPI(opts) {
    opts = opts || {};
    this._cache = {};
    process.nextTick(function () {
        this.connect(opts.bus || DBus()); // duded is probably running as service/daemon
    }.bind(this));
}
var proto = DBusAPI.prototype;

proto.url = {
    name:  NS.duded.daemon,
    path:  NS.duded.path,
    iface: NS.duded.daemon,
};

proto.schema = {
    method: {
        connect: {},
    },
    signal: {
        connected: {},
    },
};

proto.connect = function connect(bus) {
    var that = this;
    this.bus = bus;
    this.ref = {};
    createInterface.call(this, this, function (err, iface) {
        if (err) return that.emit('error', 'connect:'+err);
        Object.keys(that.schema.method).forEach(function (name) {
            iface[name](that[name].bind(that));
        });
        that.emit('connect');
    });
};



// session.service('org.illumium', function(err, service){
//   if(err){
//     throw err;
//   }
//
//   service.node('/', function(err, node){
//     if(err){
//       throw err;
//     }
//
//     node.iface('org.illumium.TestService', {
//       method: {
//         TestMethod: {
//           arg: {
//             testString: 's',
//             testNumber: 'd',
//             testStruct: '(is)',
//             testArray:  'ad',
//             testObject: 'a{si}'
//           },
//           res: {
//             testString: 's',
//             testNumber: 'd',
//             testStruct: '(is)',
//             testArray:  'ad',
//             testObject: 'a{si}'
//           }
//         },
//         SyncMethod: {
//           res: {
//             testString: 's',
//             testComplex: 'a(ia{sv})'
//           }
//         }
//       },
//       signal: {
//         TestSignal: {
//           arg: {
//             a: 'ai'
//           }
//         }
//       }
//     }, function(err, iface){
//       if(err){
//         throw err;
//       }
//
//       iface.TestMethod(function(testString, testNumber, testStruct, testArray, testObject, result){
//         console.log('  method called');
//         setTimeout(function(){ /* fake timeout */
//           result(testString, testNumber, testStruct, testArray, testObject);
//         }, 100);
//       });
//
//       iface.SyncMethod(function(){
//         console.log('  sync method called');
//         return ['it works too', [
//           [4, {a: true, b: 'hello'}]
//         ]];
//       });




if (!module.parent) require('../config')(function () {
    var iface = 'wlan0';
    var inspect = require('eyes').inspector({maxLength:4096});
//     setInterval(function () {},10000)
    var api = new DBusAPI({ iface:iface });
    api.on('close', console.log.bind(console, 'close'));
    api.on('exit', console.log.bind(console, 'exit'));
    api.on('warn', console.warn.bind(console));
    api.on('error', console.error.bind(console));
    api.once('connect', function () {
        console.log("api connected …");
        setTimeout(function () {
            api.bus.explore(api.url.name, api.url.path, function (err, scan) {
                if (err) return console.error("expore:"+err);
                console.log("explored:", scan);
            });
        }, 555);
    });
});

