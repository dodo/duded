var config = require('jsconfig');
var whoami = require('./util').whoami;

module.exports = function (callback) {
    config.cli({
        debug: ['debug', [false, "debug mode", 'bool']],
    });
    config.load(function () {
        config.debug = true;
        whoami(function (err, me) {
            if (err) return console.error("While looking up whoami this happened:", err);
            config.user = me;
            callback();
        });
    });
};
