var EventEmitter = require('events').EventEmitter
var inherits = require('util').inherits
var dbus = require('dbus-native')


inherits(DBusInterface, EventEmitter)
function DBusInterface() {
    this.bus = dbus.sessionBus() // FIXME systembus when running as service
}
var proto = DBusInterface.prototype;


proto.schema = {
    name: 'org.wicd2.daemon',
    methods: {
       AutoConnect: ['fresh'],
       CancelConnect: [],
       CheckIfConnecting: [],
    },
    signals: {
        DaemonClosing: [],
        DaemonStarting: [],
    },
    properties: {
    },
};

proto.connect = function connect() {
    this.bus.exportInterface(this, '/org/wicd2/daemon', this.schema)
}

proto.CheckIfConnecting = function CheckIfConnecting() {
    require('colors')
    console.log('tadadadadadaaa!'.rainbow)
};





function main() {
    var bus = new DBusInterface()

    bus.connect()
}

main()