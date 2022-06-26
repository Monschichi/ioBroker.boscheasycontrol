'use strict';

/*
 * Created with @iobroker/create-adapter v2.1.1
 */

// The adapter-core module gives you access to the core ioBroker functions
// you need to create an adapter
const utils = require('@iobroker/adapter-core');

// Load your modules here, e.g.:
const { EasyControlClient } = require('bosch-xmpp');

class Boscheasycontrol extends utils.Adapter {

    /**
     * @param {Partial<utils.AdapterOptions>} [options={}]
     */
    constructor(options) {
        super({
            ...options,
            name: 'boscheasycontrol',
        });
        this.on('ready', this.onReady.bind(this));
        this.on('stateChange', this.onStateChange.bind(this));
        // this.on('objectChange', this.onObjectChange.bind(this));
        // this.on('message', this.onMessage.bind(this));
        this.on('unload', this.onUnload.bind(this));

        // own variables
        this.initializing = false;
        this.timers = [];
    }

    /**
     * Is called when databases are connected and adapter received configuration.
     */
    async onReady() {
        // Initialize your adapter here

        // Reset the connection indicator during startup
        this.setState('info.connection', false, true);

        // The adapters config (in the instance object everything under the attribute "native") is accessible via
        // this.config:
        this.log.debug('config serial: ' + this.config.serial);
        this.log.debug('config accesskey: ' + this.config.accesskey);
        this.log.debug('config password: ' + this.config.password);

        this.client = EasyControlClient({
            serialNumber: this.config.serial,
            accessKey: this.config.accesskey,
            password: this.config.password,
        });
        this.initializing = true;
        if (!(this.config.serial && this.config.accesskey && this.config.password)) {
            this.log.error('Serial, Access Key and Password needs to be defined for this adapter to work.');
        } else {
            this.log.debug('connecting');
            try {
                await this.client.connect();
            } catch (e) {
                this.log.error(e.stack || e);
            }
            this.log.debug('connected');
            this.setState('info.connection', true, true);
            await this.processurl('/');
            this.initializing = false;
        }
    }

    /**
     * @param {string} path
     */
    async processurl(path) {
        this.log.debug('processing url: ' + path);
        let data;
        try {
            data = await this.client.get(path);
        } catch (e) {
            this.log.error(e.stack || e);
            return;
        }
        this.log.debug('got data: ' + JSON.stringify(data));
        if (data.type === 'refEnum') {
            const s = data.id.split('/');
            if (s.length === 3 && /[0-9]$/.test(s[2])) {
                this.log.debug('creating device for ' + data.id);
                await this.setObjectAsync(data.id.substring(1).split('/').join('.'), {
                    type: 'device',
                    common: {
                        name: data.id.split('/')[-1],
                    },
                    native: {}
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
     * @param {{ id: string; type: string; writeable: string; recordable: string; value: string | number | object; used: string; unitOfMeasure: string; minValue: string; maxValue: string; stepSize: string; }} data
     */
    async processdata(data) {
        this.log.debug('Data: id:' + data.id + ' type:' + data.type + ' writeable:' + data.writeable + ' recordable:' + data.recordable + ' value:' + data.value + ' used: ' + data.used + ' unitOfMeasure:' + data.unitOfMeasure + ' minValue:' + data.minValue + ' maxValue: ' + data.maxValue + ' stepSize:' + data.stepSize);
        const name = data.id.substring(1).split('/').join('.');
        let mytype = null;
        let value = null;
        switch (data.type) {
            case 'stringValue':
            case 'stringArray':
                mytype = 'string';
                if (name.endsWith('.name') || name.endsWith('.email') || name.endsWith('.phone')) {
                    value = atob(String(data.value));
                } else {
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
                    data.value[i].name = atob(data.value[i].name);
                }
                value = JSON.stringify(data.value);
                break;
            case 'addressInfo':
                mytype = 'string';
                for (const i in data.value) {
                    for (const [key, value] of Object.entries(data.value[i])) {
                        data.value[i][key] = atob(value);
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
                await this.setObjectAsync(name, {
                    type: 'state',
                    common: {
                        name: data.id.split('/')[-1],
                        read: true,
                        write: Boolean(data.writeable),
                        type: mytype,
                        role: 'value',
                        min: data.minValue,
                        max: data.maxValue,
                        step: data.stepSize,
                        unit: data.unitOfMeasure,
                    },
                    native: {}
                });
            }
            await this.setStateAsync(name, value, true);
        } else {
            this.log.warn('got unknown data with id:' + data.id + ' type:' + data.type + ' writeable:' + data.writeable + ' recordable:' + data.recordable + ' value:' + JSON.stringify(data.value) + ' used: ' + data.used + ' unitOfMeasure:' + data.unitOfMeasure + ' minValue:' + data.minValue + ' maxValue: ' + data.maxValue + ' stepSize:' + data.stepSize);
        }
    }

    async run() {
        const data = await this.client.get('/');
        this.log.debug('got data: ' + data);

        /*await this.setObjectNotExistsAsync('testVariable', {
            type: 'state',
            common: {
                name: 'testVariable',
                type: 'boolean',
                role: 'indicator',
                read: true,
                write: false,
            },
            native: {},
        });

        // same thing, but the value is flagged "ack"
        // ack should be always set to true if the value is received from or acknowledged from the target system
        await this.setStateAsync('testVariable', { val: true, ack: true });
        */
    }

    /**
     * Is called when adapter shuts down - callback has to be called under any circumstances!
     * @param {() => void} callback
     */
    onUnload(callback) {
        try {
            // Here you must clear all timeouts or intervals that may still be active
            // clearTimeout(timeout1);
            // clearTimeout(timeout2);
            // ...
            // clearInterval(interval1);
            this.client.end();
            for (const timer in this.timers) {
                this.clearInterval(this.timers[timer]);
            }
            this.setState('info.connection', false, true);

            callback();
        } catch (e) {
            callback();
        }
    }

    // If you need to react to object changes, uncomment the following block and the corresponding line in the constructor.
    // You also need to subscribe to the objects with `this.subscribeObjects`, similar to `this.subscribeStates`.
    // /**
    //  * Is called if a subscribed object changes
    //  * @param {string} id
    //  * @param {ioBroker.Object | null | undefined} obj
    //  */
    // onObjectChange(id, obj) {
    //     if (obj) {
    //         // The object was changed
    //         this.log.info(`object ${id} changed: ${JSON.stringify(obj)}`);
    //     } else {
    //         // The object was deleted
    //         this.log.info(`object ${id} deleted`);
    //     }
    // }

    /**
     * Is called if a subscribed state changes
     * @param {string} id
     * @param {ioBroker.State | null | undefined} state
     */
    onStateChange(id, state) {
        if (state) {
            // The state was changed
            this.log.info(`state ${id} changed: ${state.val} (ack = ${state.ack})`);
        } else {
            // The state was deleted
            this.log.info(`state ${id} deleted`);
        }
    }

    // If you need to accept messages in your adapter, uncomment the following block and the corresponding line in the constructor.
    // /**
    //  * Some message was sent to this instance over message box. Used by email, pushover, text2speech, ...
    //  * Using this method requires "common.messagebox" property to be set to true in io-package.json
    //  * @param {ioBroker.Message} obj
    //  */
    // onMessage(obj) {
    //     if (typeof obj === 'object' && obj.message) {
    //         if (obj.command === 'send') {
    //             // e.g. send email or pushover or whatever
    //             this.log.info('send command');

    //             // Send response in callback if required
    //             if (obj.callback) this.sendTo(obj.from, obj.command, 'Message received', obj.callback);
    //         }
    //     }
    // }

}

if (require.main !== module) {
    // Export the constructor in compact mode
    /**
     * @param {Partial<utils.AdapterOptions>} [options={}]
     */
    module.exports = (options) => new Boscheasycontrol(options);
} else {
    // otherwise start the instance directly
    new Boscheasycontrol();
}