// SPDX-FileCopyrightText: 2023 XWiki CryptPad Team <contact@cryptpad.org> and contributors
//
// SPDX-License-Identifier: AGPL-3.0-or-later

const factory = (Hash, Util, UserObject, Cache,
             nThen, Crypto, Listmap, ChainPad) => {
    var SF = {};

    /* load
        create and load a proxy using listmap for a given shared folder
        - config: network and "manager" (either the user one or a team manager)
        - id: shared folder id
    */

    var allSharedFolders = {};

    // No version: visible edit
    // Version 2: encrypted edit links
    SF.checkMigration = function (secondaryKey, proxy, uo, _cb) {
        var cb = Util.once(Util.mkAsync(_cb));
        if (!proxy) { return void cb(); }
        // View access: can't migrate
        if (!secondaryKey) { return void cb(); }
        // Already migrated: nothing to do
        if (proxy.version >= 2) { return void cb(); }
        // Not yet migrating: migrate
        if (!proxy.migrateRo) { return void uo.migrateReadOnly(cb); }
        // Already migrating: wait for the end...
        var done = false;
        var to;
        var it = setInterval(function () {
            if (proxy.version >= 2) {
                done = true;
                clearTimeout(to);
                clearInterval(it);
                return void cb();
            }
        }, 100);
        to = setTimeout(function () {
            clearInterval(it);
            uo.migrateReadOnly(function () {
                done = true;
                cb();
            });
        }, 20000);
        var path = ['version'];
        proxy.on('change', path, function () {
            if (done) { return; }
            if (proxy.version >= 2) {
                done = true;
                clearTimeout(to);
                clearInterval(it);
                cb();
            }
        });
    };

    // SFMIGRATION: only needed if we want a manual migration from the share modal...
    SF.migrate = function (channel) {
        var sf = allSharedFolders[channel];
        if (!sf) { return; }
        var clients = sf.teams;
        if (!Array.isArray(clients) || !clients.length) { return; }
        var c = clients[0];
        // No secondaryKey? ==> already migrated ==> abort
        if (!c.secondaryKey) { return; }
        var f = Util.find(c, ['store', 'manager', 'folders', c.id]);
        // Can't find the folder: abort
        if (!f) { return; }
        // Already migrated: abort
        if (!f.proxy || f.proxy.version) { return; }
        f.userObject.migrateReadOnly(function () {
            clients.forEach(function (obj) {
                var uo = Util.find(obj, ['store', 'manager', 'folders', obj.id, 'userObject']);
                uo.setReadOnly(false, obj.secondarykey);
            });
        });
    };

    SF.load = function (config, id, data, _cb) {
        var cb = Util.once(Util.mkAsync(_cb));
        var network = config.network;
        var store = config.store;
        var isNew = config.isNew;
        var isNewChannel = config.isNewChannel;
        var teamId = store.id;
        var handler = store.handleSharedFolder;

        var href = store.manager.user.userObject.getHref(data);

        var parsed = Hash.parsePadUrl(href);
        var secret = Hash.getSecrets('drive', parsed.hash, data.password);
        // If we don't have valid keys, abort and remove the proxy to make sure
        // we don't block the drive permanently
        if (!secret.keys) {
            store.manager.deprecateProxy(id);
            return void cb(null);
        }
        var secondaryKey = secret.keys.secondaryKey;

        // If we try to load an existing shared folder (isNew === false) but this folder
        // doesn't exist in the database, abort and cb
        nThen(function (waitFor) {
            // If we're in onCacheReady, make sure we have a cache for this shared folder
            if (config.cache) {
                Cache.getChannelCache(secret.channel, waitFor(function (err) {
                    if (err === "EINVAL") { // Cache not found
                        waitFor.abort();
                        store.manager.restrictedProxy(id, secret.channel);
                        return void cb(null);
                    }
                }));
            }
        }).nThen(function (waitFor) {
            isNewChannel(null, { channel: secret.channel }, waitFor(function (obj) {
                if (obj.isNew && !isNew) {
                    store.manager.deprecateProxy(id, secret.channel, obj.reason);
                    waitFor.abort();
                    return void cb(null);
                }
            }));
        }).nThen(function () {
            var sf = allSharedFolders[secret.channel];
            if (sf && sf.readOnly && secondaryKey) {
                // We were in readOnly mode and now we know the edit keys!
                SF.upgrade(secret.channel, secret);
            }
            if (sf && sf.ready && sf.rt) {
                // The shared folder is already loaded, return its data
                setTimeout(function () {
                    var leave = function () { SF.leave(secret.channel, teamId); };
                    /*
                    var uo = store.manager.addProxy(id, sf.rt, leave, secondaryKey);
                    // NOTE: Shared folder migration, disable for now
                    SF.checkMigration(secondaryKey, sf.rt.proxy, uo, function () {
                        cb(sf.rt);
                    });
                    */
                    store.manager.addProxy(id, sf.rt, leave, secondaryKey);
                    cb(sf.rt);
                });
                sf.teams.push({
                    cb: cb,
                    store: store,
                    id: id
                });
                if (handler) { handler(id, sf.rt); }
                return;
            }
            if (sf && !sf.ready && sf.rt) {
                // The shared folder is loading, add our callbacks to the queue
                sf.teams.push({
                    cb: cb,
                    store: store,
                    secondaryKey: secondaryKey,
                    id: id
                });
                if (handler) { handler(id, sf.rt); }
                return;
            }

            sf = allSharedFolders[secret.channel] = {
                teams: [{
                    cb: cb,
                    store: store,
                    secondaryKey: secondaryKey,
                    id: id
                }],
                readOnly: !Boolean(secondaryKey)
            };

            var owners = data.owners;
            var listmapConfig = {
                data: {},
                channel: secret.channel,
                readOnly: !Boolean(secondaryKey),
                crypto: Crypto.createEncryptor(secret.keys),
                userName: 'sharedFolder',
                logLevel: 1,
                ChainPad: ChainPad,
                classic: true,
                network: network,
                Cache: Cache, // shared-folder cache
                metadata: {
                    validateKey: secret.keys.validateKey || undefined,
                    owners: owners
                },
                onRejected: config.Store && config.Store.onRejected
            };
            var rt = sf.rt = Listmap.create(listmapConfig);
            rt.proxy.on('cacheready', function () {
                if (!sf.teams) {
                    return;
                }
                sf.teams.forEach(function (obj) {
                    var leave = function () { SF.leave(secret.channel, obj.store.id); };

                    // We can safely call addProxy and obj.cb here because
                    // 1. addProxy won't re-add the same folder twice on 'ready'
                    // 2. obj.cb is using Util.once
                    rt.cache = true;

                    // If we're updating the password of an existing folder, force the creation
                    // of a new userobject in proxy-manager. Once it's done, remove this flag
                    // to make sure we won't create a second new userobject on 'ready'
                    obj.store.manager.addProxy(obj.id, rt, leave, obj.secondaryKey, config.updatePassword);
                    config.updatePassword = false;
                    obj.cb(sf.rt);
                });
                sf.ready = true;
            });
            rt.proxy.on('ready', function () {
                if (isNew && !Object.keys(rt.proxy).length) {
                    // New Shared folder: no migration required
                    rt.proxy.version = 2;
                }
                if (!sf.teams) {
                    return;
                }
                sf.teams.forEach(function (obj) {
                    var leave = function () { SF.leave(secret.channel, obj.store.id); };
                    /*
                    var uo = obj.store.manager.addProxy(obj.id, rt, leave, obj.secondaryKey);
                    // NOTE: Shared folder migration, disable for now
                    SF.checkMigration(secondaryKey, rt.proxy, uo, function () {
                        obj.cb(sf.rt);
                    });
                    */
                    rt.cache = false;
                    obj.store.manager.addProxy(obj.id, rt, leave, obj.secondaryKey, config.updatePassword);
                    obj.cb(sf.rt);
                });
                sf.ready = true;
            });
            rt.proxy.on('error', function (info) {
                if (info && info.error) {
                    if (info.error === "EDELETED" ) {
                        try {
                            // Deprecate the shared folder from each team
                            // We can only hide it
                            sf.teams.forEach(function (obj) {
                                obj.store.manager.deprecateProxy(obj.id, secret.channel, info.message);
                                if (obj.store.handleSharedFolder) {
                                    obj.store.handleSharedFolder(obj.id, null);
                                }
                                obj.cb();
                            });
                        } catch (e) {}
                        delete allSharedFolders[secret.channel];
                        // This shouldn't be called on init because we're calling "isNewChannel" first,
                        // but we can still call "cb" just in case. This wait we make sure we won't block
                        // the initial "waitFor"
                        return void cb();
                    }
                    if (info.error === "ERESTRICTED" ) {
                        sf.teams.forEach(function (obj) {
                            obj.store.manager.restrictedProxy(obj.id, secret.channel);
                            obj.cb();
                        });
                        delete allSharedFolders[secret.channel];
                        return void cb();
                    }
                }
            });

            if (handler) { handler(id, rt); }
        });
    };


    SF.upgrade = function (channel, secret) {
        var sf = allSharedFolders[channel];
        if (!sf || !sf.readOnly) { return; }
        if (!sf.rt.setReadOnly) { return; }

        if (!secret.keys || !secret.keys.editKeyStr) { return; }
        var crypto = Crypto.createEncryptor(secret.keys);
        sf.readOnly = false;
        sf.rt.setReadOnly(false, crypto);
    };

    SF.leave = function (channel, teamId) {
        var sf = allSharedFolders[channel];
        if (!sf) { return; }
        var clients = sf.teams;
        if (!Array.isArray(clients)) { return; }
        // Remove the shared folder from the client's store and
        // remove the client/team from our list
        var idx;
        clients.some(function (obj, i) {
            if (obj.store.id === teamId) {
                if (obj.store.handleSharedFolder) {
                    obj.store.handleSharedFolder(obj.id, null);
                }
                idx = i;
                return true;
            }
        });
        if (typeof (idx) === "undefined") { return; }
        // Remove the selected team
        clients.splice(idx, 1);

        //If all the teams have closed this shared folder, stop it
        if (clients.length) { return; }
        if (sf.rt && sf.rt.stop) {
            sf.rt.stop();
        }
    };

    // Update the password locally
    SF.updatePassword = function (Store, data, network, cb) {
        var oldChannel = data.oldChannel;
        var href = data.href;
        var password = data.password;
        var parsed = Hash.parsePadUrl(href);
        var secret = Hash.getSecrets(parsed.type, parsed.hash, password);
        var sf = allSharedFolders[oldChannel];
        if (!sf) { return void cb({ error: 'ENOTFOUND' }); }
        if (sf.rt && sf.rt.stop) {
            try { sf.rt.stop(); } catch (e) {}
        }
        var nt = nThen;
        sf.teams.forEach(function (obj) {
            nt = nt(function (waitFor) {
                var s = obj.store;
                var sfId = obj.id;
                var shared = Util.find(s.proxy, ['drive', UserObject.SHARED_FOLDERS]) || {};
                if (!sfId || !shared[sfId]) { return; }
                var sf = JSON.parse(JSON.stringify(shared[sfId]));
                sf.password = password;
                SF.load({
                    network: network,
                    store: s,
                    updatePassword: true,
                    Store: Store,
                    isNewChannel: Store.isNewChannel
                }, sfId, sf, waitFor());
                if (!s.rpc) { return; }
                s.rpc.unpin([oldChannel], waitFor());
                s.rpc.pin([secret.channel], waitFor());
            }).nThen;
        });
        nt(function () {
            cb();
        });
    };

    /* loadSharedFolders
        load all shared folder stored in a given drive
        - store: user or team main store
        - userObject: userObject associated to the main drive
        - handler: a function (sfid, rt) called for each shared folder loaded
    */
    SF.loadSharedFolders = function (Store, network, store, drive, userObject, waitFor, progress, cache) {
        var shared = drive[UserObject.SHARED_FOLDERS] || {};
        var steps = Object.keys(shared).length;
        var i = 1;
        var w = waitFor();
        progress = progress || function () {};
        nThen(function (waitFor) {
            Object.keys(shared).forEach(function (id) {
                var sf = shared[id];
                SF.load({
                    network: network,
                    store: store,
                    Store: Store,
                    cache: cache,
                    isNewChannel: Store.isNewChannel
                }, id, sf, waitFor(function () {
                    progress({
                        progress: i,
                        max: steps
                    });
                    i++;
                }));
            });
        }).nThen(function () {
            setTimeout(w);
        });
    };

    SF.isSharedFolderChannel = function (chanId) {
        return Object.keys(allSharedFolders).includes(chanId);
    };

    return SF;
};

module.exports = factory(
    require('../../common/common-hash'),
    require('../../common/common-util'),
    require('../../common/user-object'),
    require('../../common/cache-store'),
    require('nthen'),
    require('chainpad-crypto'),
    require('chainpad-listmap'),
    require('chainpad')
);

