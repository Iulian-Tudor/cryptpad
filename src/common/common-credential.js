// SPDX-FileCopyrightText: 2023 XWiki CryptPad Team <contact@cryptpad.org> and contributors
//
// SPDX-License-Identifier: AGPL-3.0-or-later

(function () {
var factory = function (AppConfig = {}, Scrypt) {
    var Cred = {};

    Cred.setCustomize = data => {
        AppConfig = data.AppConfig;
    };

    Cred.MINIMUM_PASSWORD_LENGTH = typeof(AppConfig.minimumPasswordLength) === 'number'?
        AppConfig.minimumPasswordLength: 8; // TODO 14 or higher is a decent default for 2023

    Cred.MINIMUM_NAME_LENGTH = 1;
    Cred.MAXIMUM_NAME_LENGTH = 64;

    // https://stackoverflow.com/questions/46155/how-to-validate-an-email-address-in-javascript
    Cred.isEmail = function (email) {
        var re = /^(([^<>()\[\]\\.,;:\s@"]+(\.[^<>()\[\]\\.,;:\s@"]+)*)|(".+"))@((\[[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\])|(([a-zA-Z\-0-9]+\.)+[a-zA-Z]{2,}))$/;
        return re.test(String(email).toLowerCase());
    };

    Cred.isLongEnoughPassword = function (passwd) {
        return passwd.length >= Cred.MINIMUM_PASSWORD_LENGTH;
    };

    var isString = Cred.isString = function (x) {
        return typeof(x) === 'string';
    };

    // Maximum username length is enforced at registration time
    // rather than in this function
    // in order to maintain backwards compatibility with accounts
    // that might have already registered with a longer name.
    Cred.isValidUsername = function (name) {
        return !!(isString(name) && name.length >= Cred.MINIMUM_NAME_LENGTH);
    };

    Cred.isValidPassword = function (passwd) {
        return !!(passwd && isString(passwd));
    };

    Cred.passwordsMatch = function (a, b) {
        return isString(a) && isString(b) && a === b;
    };

    Cred.customSalt = function () {
        return typeof(AppConfig.loginSalt) === 'string'?
            AppConfig.loginSalt: '';
    };

    Cred.deriveFromPassphrase = function (username, password, len, cb) {
        Scrypt(password,
            username + Cred.customSalt(), // salt
            8, // memoryCost (n)
            1024, // block size parameter (r)
            len || 128, // dkLen
            200, // interruptStep
            cb,
            undefined); // format, could be 'base64'
    };

    Cred.dispenser = function (bytes) {
        var entropy = {
            used: 0,
        };

        // crypto hygeine
        var consume = function (n) {
            // explode if you run out of bytes
            if (entropy.used + n > bytes.length) {
                throw new Error('exceeded available entropy');
            }
            if (typeof(n) !== 'number') { throw new Error('expected a number'); }
            if (n <= 0) {
                throw new Error('expected to consume a positive number of bytes');
            }

            // grab an unused slice of the entropy
            // Note: Internet Explorer doesn't support .slice on Uint8Array
            var A;
            if (bytes.slice) {
                A = bytes.slice(entropy.used, entropy.used + n);
            } else {
                A = bytes.subarray(entropy.used, entropy.used + n);
            }

            // account for the bytes you used so you don't reuse bytes
            entropy.used += n;

            //console.info("%s bytes of entropy remaining", bytes.length - entropy.used);
            return A;
        };

        return consume;
    };

    return Cred;
};

    if (typeof(module) !== 'undefined' && module.exports) {
        module.exports = factory(
            undefined, //require("../../customize.dist/application_config.js"),
            require("scrypt-async")
        );
    } else if ((typeof(define) !== 'undefined' && define !== null) && (define.amd !== null)) {
        define([
            '/customize/application_config.js',
            '/components/scrypt-async/scrypt-async.min.js',
        ], function (AppConfig) {
            return factory(AppConfig, window.scrypt);
        });
    }
}());
