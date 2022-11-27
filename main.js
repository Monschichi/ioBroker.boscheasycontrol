'use strict';

/*
 * Created with @iobroker/create-adapter v2.1.1
 */

// The adapter-core module gives you access to the core ioBroker functions
// you need to create an adapter
const utils = require('@iobroker/adapter-core');

// Load your modules here, e.g.:
const {EasyControlClient} = require('bosch-xmpp');
const {setIntervalAsync, clearIntervalAsync} = require('set-interval-async/fixed');

class Boscheasycontrol extends utils.Adapter {

    /**
     * @param {Partial<utils.AdapterOptions>} [options={}]
     */
    constructor(options) {
        super({
            ...options, name: 'boscheasycontrol'
        });
        this.on('ready', this.onReady.bind(this));
        this.on('stateChange', this.onStateChange.bind(this));
        this.on('objectChange', this.onObjectChange.bind(this));
        // this.on('message', this.onMessage.bind(this));
        this.on('unload', this.onUnload.bind(this));

        // own variables
        this.initializing = false;
        this.timers = {};
        this.starttimers = {};
    }

    /**
     * Is called when databases are connected and adapter received configuration.
     */
    async onReady() {
        // Initialize your adapter here

        // Reset the connection indicator during startup
        this.setState('info.connection', false, true);

        this.client = EasyControlClient({
            serialNumber: this.config.serial, accessKey: this.config.accesskey, password: this.config.password
        });
        this.initializing = true;
        if (!(
            (
                (this.config.serial && this.config.accesskey && this.config.password)
            )
        )) {
            this.log.error('Serial, Access Key and Password needs to be defined for this adapter to work.');
        }
        else {
            this.log.debug('connecting');
            try {
                await this.client.connect();
            }
            catch (e) {
                this.log.error(e.stack || e);
            }
            this.setState('info.connection', true, true);
            await this.subscribeStatesAsync('*');
            await this.subscribeObjectsAsync('*');
            await this.processurl('/');
            this.initializing = false;
            this.log.info('startup ... done');
            this.startalltimers();
        }
    }

    /**
     * @param {string} path
     */
    async processurl(path) {
        // /devices/productLookup is not working, so skipping
        if (path === '/devices/productLookup') {
            return;
        }
        let data;
        this.log.debug('fetching new state for ' + path);
        try {
            data = await this.client.get(path);
        }
        catch (e) {
            this.log.error(e.stack || e);
            return;
        }
        this.log.debug('got data: ' + JSON.stringify(data));
        if (data.type === 'refEnum') {
            const s = data.id.split('/');
            if (s.length === 3 && /[0-9]$/.test(s[2])) {
                this.log.debug('creating device for ' + data.id);
                await this.setObjectAsync(data.id.substring(1).split('/').join('.'), {
                    type: 'device', common: {
                        name: s[s.length-1]
                    }, native: {}
                });
            }
            for (const ref in data.references) {
                await this.processurl(data.references[ref].id);
            }
        }
        if ('value' in data) {
            await this.processdata(data);
        }
    }

    /**
     * @param {{ id: string; type: string; writeable: string; recordable: string; value: string | number | object;
     *     used: string; unitOfMeasure: string; minValue: number; maxValue: number; stepSize: number; }} data
     */
    async processdata(data) {
        this.log.debug('Data: id:' + data.id + ' type:' + data.type + ' writeable:' + data.writeable + ' recordable:' +
            data.recordable + ' value:' + data.value + ' used: ' + data.used + ' unitOfMeasure:' + data.unitOfMeasure +
            ' minValue:' + data.minValue + ' maxValue: ' + data.maxValue + ' stepSize:' + data.stepSize);
        const name = data.id.substring(1).split('/').join('.');
        let mytype;
        let value;
        switch (data.type) {
            case 'stringValue':
            case 'stringArray':
                mytype = 'string';
                if (name.endsWith('.name') || name.endsWith('.email') || name.endsWith('.phone')) {
                    value = Buffer.from(data.value, 'base64').toString();
                }
                else {
                    value = data.value;
                }
                break;
            case 'floatValue':
                mytype = 'number';
                value = data.value;
                break;
            case 'systeminfo':
                mytype = 'string';
                value = JSON.stringify(data.value);
                break;
            case 'zoneConfigArray':
            case 'zoneArray':
            case 'deviceArray':
            case 'programArray':
                mytype = 'string';
                for (const i in data.value) {
                    data.value[i].name = Buffer.from(data.value[i].name, 'base64');
                }
                value = JSON.stringify(data.value);
                break;
            case 'addressInfo':
                mytype = 'string';
                for (const i in data.value) {
                    for (const [key, value] of Object.entries(data.value[i])) {
                        data.value[i][key] = Buffer.from(value, 'base64').toString();
                    }
                }
                value = JSON.stringify(data.value);
                break;
            case 'dhwProgram':
            case 'energyRecordings':
            case 'eventArray':
            case 'notificationStruct':
            case 'boostShortcutStruct':
            case 'boostZoneStruct':
            case 'errorList':
            case 'dayProgram':
            case 'weekProgram':
            case 'autoAwayArray':
                mytype = 'string';
                value = JSON.stringify(data.value);
                break;
        }
        if (mytype) {
            if (this.initializing) {
                const obj = await this.getObjectAsync(name);
                if (obj) {
                    await this.onObjectChange(obj._id, obj);
                }
                else {
                    let common;
                    if (mytype === 'string') {
                        common = {
                            name: data.id.split('/').slice(-1)[0],
                            type: 'string',
                            read: true,
                            write: Boolean(data.writeable),
                            role: 'value',
                            unit: data.unitOfMeasure,
                        };
                    }
                    else if (mytype === 'number') {
                        common = {
                            name: data.id.split('/').slice(-1)[0],
                            type: 'number',
                            read: true,
                            write: Boolean(data.writeable),
                            role: 'value',
                            min: Number(data.minValue),
                            max: Number(data.maxValue),
                            step: Number(data.stepSize),
                            unit: data.unitOfMeasure,
                        };
                    }
                    else {
                        common = {
                            name: data.id.split('/').slice(-1)[0],
                            type: 'string',
                            read: true,
                            write: Boolean(data.writeable),
                            role: 'value',
                            unit: data.unitOfMeasure,
                        };
                    }
                    this.log.info('creating new object with: ' + JSON.stringify(common));
                    await this.setObjectAsync(name, {
                        type: 'state', common: common, native: {}
                    });
                }
            }
            if (name.endsWith('.name')) {
                const parent_name = name.split('.').slice(0, -1).join('.');
                const parent = await this.getObjectAsync(parent_name);
                if (parent) {
                    parent.common.name = value;
                    await this.setObjectAsync(parent_name, parent);
                    this.log.debug('updated name of ' + parent_name + ' to: ' + JSON.stringify(parent));
                }
            }
            this.log.debug('updating ' + name + ' to ' + value);
            await this.setStateAsync(name, value, true);
        }
        else {
            this.log.warn(
                'got unknown data with id:' + data.id + ' type:' + data.type + ' writeable:' + data.writeable +
                ' recordable:' + data.recordable + ' value:' + JSON.stringify(data.value) + ' used: ' + data.used +
                ' unitOfMeasure:' + data.unitOfMeasure + ' minValue:' + data.minValue + ' maxValue: ' + data.maxValue +
                ' stepSize:' + data.stepSize);
        }
    }

    async startalltimers()  {
        for (const [key, value] of this.starttimers) {
            this.log.debug('calling starttimer for ' + key + ' interval ' + value);
            await this.starttimer(key, value);
        }
    }

    /**
     * @param {string} name
     * @param {number} interval
     */
    async starttimer(name, interval) {
        if (name.endsWith('.info.connection')) {
            return;
        }
        await this.stoptimer(name);
        const nslice = name.split('.');
        const path = '/' + nslice.slice(2).join('/');
        this.timers[name] = setIntervalAsync(this.processurl.bind(this, path), interval * 1000);
        this.log.debug('started update timer for ' + name + ' with interval ' + interval + 's');
    }

    /**
     * @param {string} name
     */
    async stoptimer(name) {
        if (name in this.timers) {
            this.log.debug('stopping timer for: ' + name);
            await clearIntervalAsync(this.timers[name]);
            delete this.timers[name];
            this.log.debug('stopped update timer for ' + name);
        }
    }

    /**
     * Is called when adapter shuts down - callback has to be called under any circumstances!
     * @param {() => void} callback
     */
    async onUnload(callback) {
        try {
            this.client.end();
            for (const name in this.timers) {
                await this.stoptimer(name);
            }
            this.setState('info.connection', false, true);
            callback();
        }
        catch (e) {
            callback();
        }
    }

    /**
     * Is called if a subscribed object changes
     * @param {string} id
     * @param {ioBroker.Object | null | undefined} obj
     */
    async onObjectChange(id, obj) {
        if (obj) {
            // The object was changed
            this.log.debug(`object ${id} changed: ${JSON.stringify(obj)}`);
            if (obj.common.custom && obj.common.custom[`${this.name}.${this.instance}`]) {
                if (obj.common.custom[`${this.name}.${this.instance}`].enabled) {
                    if (this.initializing) {
                        this.log.debug('adding timer for start ' + id);
                        this.starttimers[id] = obj.common.custom[`${this.name}.${this.instance}`].refresh;
                    }
                    else {
                        this.log.debug('calling starttimer for ' + id);
                        await this.starttimer(id, obj.common.custom[`${this.name}.${this.instance}`].refresh);
                    }
                } else {
                    this.log.debug('calling stoptimer 1 for ' + id);
                    await this.stoptimer(id);
                }
            } else {
                this.log.debug('calling stoptimer 2 for ' + id);
                await this.stoptimer(id);
            }
        } else {
            // The object was deleted
            this.log.debug(`object ${id} deleted`);
            await this.stoptimer(id);
        }
        this.log.debug('running timers: ' + Object.keys(this.starttimers));
    }

    /**
     * Is called if a subscribed state changes
     * @param {string} id
     * @param {ioBroker.State | null | undefined} state
     */
    async onStateChange(id, state) {
        if (state) {
            // The state was changed
            this.log.debug(`state ${id} changed: ${state.val} (ack = ${state.ack})`);
            if (state.ack === false) {
                try {
                    const nslice = id.split('.');
                    const path = '/' + nslice.slice(2).join('/');
                    const ret = this.client.put(path, {'value':state.val}); // not tested
                    this.log.debug('set state returned: ' + ret);
                    await this.processurl(path);
                }
                catch (e) {
                    this.log.error(e.stack || e);
                }
            }
        }
        else {
            // The state was deleted
            this.log.debug(`state ${id} deleted`);
        }
    }
}

if (require.main !== module) {
    // Export the constructor in compact mode
    /**
     * @param {Partial<utils.AdapterOptions>} [options={}]
     */
    module.exports = (options) => new Boscheasycontrol(options);
}
else {
    // otherwise start the instance directly
    new Boscheasycontrol();
}
