// SPDX-FileCopyrightText: 2023 XWiki CryptPad Team <contact@cryptpad.org> and contributors
//
// SPDX-License-Identifier: AGPL-3.0-or-later

(function () {
// add your module to this map so it gets used
var map = {
    'ar': 'اَلْعَرَبِيَّةُ',
    'ca': 'Català',
    'cs': 'Čeština',
    'de': 'Deutsch',
    //'el': 'Ελληνικά',
    'es': 'Español',
    'es_CU': 'Español cubano',
    'eu': 'Euskara',
    'fi': 'Suomi',
    'fr': 'Français',
    //'hi': 'हिन्दी',
    'id': 'Bahasa Indonesia',
    'it': 'Italiano',
    'ja': '日本語',
    'nb': 'Norwegian Bokmål',
    //'nl': 'Nederlands'
    'pl': 'Polski',
    'pt-br': 'Português do Brasil',
    'pt-pt': 'Português do Portugal',
    //'ro': 'Română',
    'ru': 'Русский',
    'sv': 'Svenska',
    //'te': 'తెలుగు',
    'uk': 'Українська',
    'zh': '中文(簡體)',
};

var Messages = {};
var LS_LANG = "CRYPTPAD_LANG";
var getStoredLanguage = function () { return localStorage && localStorage.getItem(LS_LANG); };
var getBrowserLanguage = function () { return navigator.language || navigator.userLanguage || ''; };
var getLanguage = Messages._getLanguage = function () {
    if (window.cryptpadLanguage) { return window.cryptpadLanguage; }
    try {
        if (getStoredLanguage()) { return getStoredLanguage(); }
    } catch (e) { console.log(e); }
    var l = getBrowserLanguage();
    // Edge returns 'fr-FR' --> transform it to 'fr' and check again
    return map[l] ? l :
            (map[l.split('-')[0]] ? l.split('-')[0] :
                (map[l.split('_')[0]] ? l.split('_')[0] : 'en'));
};
var language = getLanguage();
window.cryptpadLanguage = language;

// Translations files were migrated from requirejs modules to json.
// To avoid asking every administrator to update their customized translation files,
// we use a requirejs map to redirect the old path to the new one and to use the
// requirejs json plugin
var reqPaths = {
    "/common/translations/messages.js":"json!/common/translations/messages.json"
};
Object.keys(map).forEach(function (k) {
    reqPaths["/common/translations/messages."+k+".js"] = "json!/common/translations/messages."+k+".json";
});
require.config({
    map: {
        "*": reqPaths
    }
});

var req = [
    '/customize/application_config.js',
    '/customize/translations/messages.js'
];
if (language && map[language]) { req.push('/customize/translations/messages.' + language + '.js'); }

define(req, function(AppConfig, Default, Language) {
    map.en = 'English';
    var defaultLanguage = 'en';

    if (AppConfig.availableLanguages) {
        if (AppConfig.availableLanguages.indexOf(language) === -1) {
            language = defaultLanguage;
            Language = Default;
            try {
                localStorage.setItem(LS_LANG, language);
            } catch (e) { console.log(e); }
        }
        Object.keys(map).forEach(function (l) {
            if (l === defaultLanguage) { return; }
            if (AppConfig.availableLanguages.indexOf(l) === -1) {
                delete map[l];
            }
        });
    }

    let html = typeof(document) !== "undefined" && document.documentElement;
    if (html) { html.setAttribute('lang', language); }

    var extend = function (a, b) {
        for (var k in b) {
            if (Array.isArray(b[k])) {
                a[k] = b[k].slice();
                continue;
            }
            if (b[k] && typeof(b[k]) === "object") {
                a[k] = (a[k] && typeof(a[k]) === "object" && !Array.isArray(a[k])) ? a[k] : {};
                extend(a[k], b[k]);
                continue;
            }
            a[k] = b[k] || a[k];
        }
    };

    extend(Messages, Default);
    if (Language && language !== defaultLanguage) {
        // Add the translated keys to the returned object
        extend(Messages, Language);
    }

    Messages._languages = map;
    Messages._languageUsed = language;

    // Get keys with parameters
    Messages._getKey = function (key, argArray) {
        if (!Messages[key]) { return '?'; }
        var text = Messages[key];
        if (typeof(text) === 'string') {
            return text.replace(/\{(\d+)\}/g, function (str, p1) {
                if (typeof(argArray[p1]) === 'string' || typeof(argArray[p1]) === "number") {
                    return argArray[p1];
                }
                console.error("Only strings and numbers can be used in _getKey params!");
                return '';
            });
        } else {
            return text;
        }
    };

        // XXX
        Messages.admin_cat_admins = "Administrators";
        Messages.admin_admin = "Admin";
        Messages.admin_listAdminsTitle = "Current administrators";
        Messages.admin_listAdminsHint = "View and remove administrators";
        Messages.admin_addAdminsTitle = "Add administrators";
        Messages.admin_addAdminsHint = "Add administrators from their public key or from your contacts list";
        Messages.admin_addAdminsAdd = "Promote a contact to admin";
        Messages.admin_addKeyLabel = "Add an admin using their public key";

        Messages.admin_listName = "Admin name";
        Messages.admin_listKey = "Admin key";
        Messages.admin_listAction = "Remove admin rights";

        Messages.admin_listHardcoded = "Admin added into config.js. Can only be removed by editing the config file.";
        Messages.admin_listConfirm = "Are you sure you want to remove the admin rights of this user?";

    //NOTE: these keys are also added to the Kanban mobile UI PR #1727
    Messages.moveItemUp = 'Move item up'; // XXX
    Messages.moveItemDown = 'Move item down'; // XXX
    Messages.toggleArrows = 'Switch to arrow view'; // XXX
    Messages.toggleDrag = 'Switch to drag view'; // XXX


    Messages.kanban_moveitemLeft = 'Move item left'; // XXX
    Messages.kanban_moveitemRight = 'Move item right'; // XXX
    Messages.kanban_moveBoardLeft = 'Move board left'; // XXX
    Messages.kanban_moveBoardRight = 'Move board right'; // XXX

    return Messages;

});
}());
