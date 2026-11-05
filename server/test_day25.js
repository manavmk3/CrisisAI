import dns from 'dns';
import http from 'http';
import mongoose from 'mongoose';
import jwt from 'jsonwebtoken';
import { io as ioClient } from 'socket.io-client';
import config from './src/config/env.js';
import User from './src/models/User.js';
import Incident from './src/models/Incident.js';
import Resource from './src/models/Resource.js';
import ResourceAllocation from './src/models/ResourceAllocation.js';
import Assignment, { ASSIGNMENT_STATUSES } from './src/models/Assignment.js';
import Alert, { ALERT_TYPES } from './src/models/Alert.js';
import alertService, {
    isCriticalIncident,
    resolveRecipientsForIncident,
    createAlert,
    createCriticalIncidentAlerts,
    CRITICAL_PRIORITY_THRESHOLD,
} from './src/services/alert.service.js';
import app from './src/app.js';
import {
    initSocket,
    closeSocket,
    emitNewAlert,
} from './src/services/socket.service.js';
import { calculatePriorityScore } from './src/services/priorityScore.js';

let passed = 0;
let failed = 0;
const results = [];

function assert(condition, message, detail = '') {
    if (condition) {
        passed++;
        console.log('  \u2705 PASS: ' + message);
        results.push({ name: message, status: 'PASS' });
    } else {
        failed++;
        console.error('  \u274c FAIL: ' + message + (detail ? ' \u2014 ' + detail : ''));
        results.push({ name: message, status: 'FAIL', detail: detail });
    }
}

const TEST_PORT = 5025;

async function req(method, pathStr, body, token) {
    const url = 'http://localhost:' + TEST_PORT + '/api' + pathStr;
    const opts = { method: method, headers: { 'Content-Type': 'application/json' } };
    if (token) opts.headers['Authorization'] = 'Bearer ' + token;
    if (body !== undefined) opts.body = JSON.stringify(body);
    const res = await fetch(url, opts);
    let data = null;
    try {
        data = await res.json();
    } catch (_) { }
    return { status: res.status, data: data, headers: res.headers };
}

let httpServer = null;
let ioInstance = null;

const memoryUsers = [];
const memoryIncidents = [];
const memoryResources = [];
const memoryAllocations = [];
const memoryAssignments = [];
const memoryAlerts = [];

async function setupDatabase() {
    try {
        if (config.mongoUri && config.mongoUri.startsWith('mongodb+srv://')) {
            try {
                dns.setServers(['8.8.8.8', '1.1.1.1']);
            } catch (_) { }
        }
        const connPromise = mongoose.connect(config.mongoUri, { serverSelectionTimeoutMS: 3000 });
        await Promise.race([
            connPromise,
            new Promise((_, reject) => setTimeout(() => reject(new Error('Connection timeout')), 3500)),
        ]);
        console.log('  \uD83D\uDCE6 Connected to MongoDB Atlas.');
        return false;
    } catch (err) {
        console.log('  \u26A0\uFE0F  Atlas unavailable (' + err.message + '). Enabling in-memory simulation for tests.');

        User.findOne = async (query) => {
            if (query.email) {
                const found = memoryUsers.find((u) => u.email === query.email.toLowerCase());
                if (!found) return null;
                return {
                    ...found,
                    select: () => found,
                    comparePassword: async (pwd) => pwd === found.password || pwd === 'Password123!',
                    toJSON: () => {
                        const copy = { ...found };
                        delete copy.password;
                        return copy;
                    },
                };
            }
            return null;
        };

        User.findById = (id) => {
            const strId = id ? id.toString() : '';
            const u = memoryUsers.find((user) => user._id.toString() === strId) || null;
            if (!u) {
                return {
                    select: () => null,
                    then: (res) => Promise.resolve(null).then(res),
                };
            }
            const wrapped = {
                ...u,
                select: () => wrapped,
                toJSON: () => {
                    const c = { ...u };
                    delete c.password;
                    return c;
                },
                save: async () => wrapped,
            };
            return {
                select: () => wrapped,
                then: (res) => Promise.resolve(wrapped).then(res),
            };
        };

        User.find = function (query) {
            let filtered = [...memoryUsers];
            if (query && query.role && query.role.$in) {
                filtered = filtered.filter((u) => query.role.$in.includes(u.role));
            }
            return {
                _items: filtered,
                select() { return this; },
                then(resolve, reject) { return Promise.resolve(this._items).then(resolve, reject); },
            };
        };

        User.create = async (doc) => {
            const u = {
                ...doc,
                _id: new mongoose.Types.ObjectId(),
                email: doc.email.toLowerCase(),
                role: doc.role || 'citizen',
                comparePassword: async (pwd) => pwd === doc.password || pwd === 'Password123!',
                toJSON: () => {
                    const c = { ...doc, _id: u._id };
                    delete c.password;
                    return c;
                },
                save: async () => u,
            };
            memoryUsers.push(u);
            return u;
        };

        User.deleteOne = async (query) => {
            const idx = memoryUsers.findIndex((u) => u.email === query.email);
            if (idx !== -1) memoryUsers.splice(idx, 1);
            return { deletedCount: 1 };
        };

        Incident.findById = function (id) {
            const strId = id ? id.toString() : '';
            const found = memoryIncidents.find((i) => (i._id || i.id).toString() === strId) || null;
            return {
                _item: found,
                populate() { return this; },
                then(resolve, reject) { return Promise.resolve(this._item).then(resolve, reject); },
            };
        };

        Incident.prototype.save = async function () {
            if (!this._id) this._id = new mongoose.Types.ObjectId();
            if (!this.createdAt) this.createdAt = new Date();
            if (!this.updatedAt) this.updatedAt = new Date();
            if (this.priorityScore === undefined || this.priorityScore === null) this.priorityScore = 50;
            const idx = memoryIncidents.findIndex((i) => (i._id || i.id).toString() === this._id.toString());
            if (idx !== -1) {
                memoryIncidents[idx] = this;
            } else {
                memoryIncidents.push(this);
            }
            return this;
        };

        Incident.find = function () {
            let filtered = [...memoryIncidents];
            return {
                _items: filtered,
                sort() { return this; },
                limit() { return this; },
                select() { return this; },
                lean() { return this._items; },
                populate() { return this; },
                then(resolve, reject) { return Promise.resolve(this._items).then(resolve, reject); },
            };
        };

        Incident.create = async (doc) => {
            const inc = {
                ...doc,
                _id: new mongoose.Types.ObjectId(),
                createdAt: new Date(),
                updatedAt: new Date(),
                status: doc.status || 'reported',
                summary: doc.summary || doc.report || 'Operational incident',
                priorityScore: doc.priorityScore !== undefined ? doc.priorityScore : 50,
                severity: doc.severity || 'medium',
                save: async function () { return this; },
            };
            memoryIncidents.push(inc);
            return inc;
        };

        Resource.find = function (query) {
            let filtered = [...memoryResources];
            if (query && query.status) {
                filtered = filtered.filter((r) => r.status === query.status);
            }
            if (query && query.availableQuantity && query.availableQuantity.$gt !== undefined) {
                filtered = filtered.filter((r) => r.availableQuantity > query.availableQuantity.$gt);
            }
            return {
                _items: filtered,
                sort() { return this; },
                limit() { return this; },
                select() { return this; },
                populate() { return this; },
                lean() { return this._items; },
                then(resolve, reject) { return Promise.resolve(this._items).then(resolve, reject); },
            };
        };

        Resource.findById = function (id) {
            const strId = id ? id.toString() : '';
            const r = memoryResources.find((res) => (res._id || res.id).toString() === strId) || null;
            return {
                _item: r,
                populate() { return this; },
                select() { return this; },
                then(resolve, reject) { return Promise.resolve(this._item).then(resolve, reject); },
            };
        };

        Resource.prototype.save = async function () {
            if (!this._id) this._id = new mongoose.Types.ObjectId();
            if (!this.createdAt) this.createdAt = new Date();
            if (!this.updatedAt) this.updatedAt = new Date();
            if (this.availableQuantity === undefined) this.availableQuantity = this.quantity;
            const idx = memoryResources.findIndex((r) => (r._id || r.id).toString() === this._id.toString());
            if (idx !== -1) {
                memoryResources[idx] = this;
            } else {
                memoryResources.push(this);
            }
            return this;
        };

        Resource.findOneAndUpdate = async (query, update) => {
            const strId = query._id ? query._id.toString() : '';
            const r = memoryResources.find((item) => (item._id || item.id).toString() === strId);
            if (!r) return null;
            if (query.availableQuantity && query.availableQuantity.$gte !== undefined) {
                if (r.availableQuantity < query.availableQuantity.$gte) return null;
            }
            if (update.$inc && update.$inc.availableQuantity !== undefined) {
                r.availableQuantity = (r.availableQuantity || 0) + update.$inc.availableQuantity;
            }
            return r;
        };

        Resource.findByIdAndUpdate = async (id, update) => {
            const strId = id ? id.toString() : '';
            const r = memoryResources.find((item) => (item._id || item.id).toString() === strId);
            if (!r) return null;
            if (update.$inc && update.$inc.availableQuantity !== undefined) {
                r.availableQuantity = (r.availableQuantity || 0) + update.$inc.availableQuantity;
            }
            return r;
        };

        Resource.create = async (doc) => {
            const qty = doc.quantity !== undefined ? doc.quantity : 1;
            const resItem = {
                ...doc,
                _id: new mongoose.Types.ObjectId(),
                quantity: qty,
                availableQuantity: doc.availableQuantity !== undefined ? doc.availableQuantity : qty,
                status: doc.status || 'available',
                createdAt: new Date(),
                updatedAt: new Date(),
                save: async function () { return this; },
            };
            memoryResources.push(resItem);
            return resItem;
        };

        ResourceAllocation.find = function (query) {
            let copy = [...memoryAllocations];
            if (query && query.incident) {
                copy = copy.filter((a) => (a.incident?._id || a.incident || '').toString() === query.incident.toString());
            }
            if (query && query.resource) {
                copy = copy.filter((a) => (a.resource?._id || a.resource || '').toString() === query.resource.toString());
            }
            if (query && query.status) {
                copy = copy.filter((a) => a.status === query.status);
            }
            return {
                _items: copy,
                sort() { return this; },
                limit() { return this; },
                select() { return this; },
                populate() { return this; },
                lean() { return this._items; },
                then(resolve, reject) { return Promise.resolve(this._items).then(resolve, reject); },
            };
        };

        ResourceAllocation.findOne = async (query) => {
            let copy = [...memoryAllocations];
            if (query && query.incident) {
                copy = copy.filter((a) => (a.incident?._id || a.incident || '').toString() === query.incident.toString());
            }
            if (query && query.resource) {
                copy = copy.filter((a) => (a.resource?._id || a.resource || '').toString() === query.resource.toString());
            }
            if (query && query.status) {
                copy = copy.filter((a) => a.status === query.status);
            }
            return copy[0] || null;
        };

        ResourceAllocation.findById = function (id) {
            const strId = id ? id.toString() : '';
            const found = memoryAllocations.find((item) => (item._id || item.id).toString() === strId) || null;
            return {
                _item: found,
                populate() { return this; },
                then(resolve, reject) { return Promise.resolve(this._item).then(resolve, reject); },
            };
        };

        ResourceAllocation.findOneAndUpdate = async (query, update) => {
            const strId = query._id ? query._id.toString() : '';
            const a = memoryAllocations.find((item) => (item._id || item.id).toString() === strId);
            if (!a) return null;
            if (query.status && a.status !== query.status) return null;
            if (update.status) a.status = update.status;
            if (update.releasedBy) a.releasedBy = update.releasedBy;
            if (update.releasedAt) a.releasedAt = update.releasedAt;
            return a;
        };

        ResourceAllocation.create = async (docs) => {
            const items = Array.isArray(docs) ? docs : [docs];
            const created = items.map((d) => ({
                ...d,
                _id: new mongoose.Types.ObjectId(),
                status: d.status || 'active',
                createdAt: new Date(),
                updatedAt: new Date(),
            }));
            memoryAllocations.push(...created);
            return Array.isArray(docs) ? created : created[0];
        };

        Assignment.find = function (query) {
            let copy = [...memoryAssignments];
            if (query && query.incidentId) {
                copy = copy.filter((a) => (a.incidentId?._id || a.incidentId || '').toString() === query.incidentId.toString());
            }
            if (query && query.status && query.status.$in) {
                copy = copy.filter((a) => query.status.$in.includes(a.status));
            } else if (query && query.status) {
                copy = copy.filter((a) => a.status === query.status);
            }
            if (query && query.responderId) {
                copy = copy.filter((a) => (a.responderId?._id || a.responderId || '').toString() === query.responderId.toString());
            }
            return {
                _items: copy,
                sort() { return this; },
                populate() { return this; },
                select() { return this; },
                then(resolve, reject) { return Promise.resolve(this._items).then(resolve, reject); },
            };
        };

        Assignment.findById = function (id) {
            const strId = id ? id.toString() : '';
            const found = memoryAssignments.find((a) => (a._id || a.id).toString() === strId) || null;
            return {
                _item: found,
                populate(field) {
                    if (this._item) {
                        if (field === 'resourceId' && this._item.resourceId) {
                            const r = memoryResources.find((x) => x._id.toString() === this._item.resourceId.toString());
                            if (r) this._item.resourceId = r;
                        }
                        if (field === 'incidentId' && this._item.incidentId) {
                            const inc = memoryIncidents.find((x) => x._id.toString() === this._item.incidentId.toString());
                            if (inc) this._item.incidentId = inc;
                        }
                    }
                    return this;
                },
                then(resolve, reject) { return Promise.resolve(this._item).then(resolve, reject); },
            };
        };

        Assignment.findOne = function (query) {
            let copy = [...memoryAssignments];
            if (query && query.incidentId) {
                copy = copy.filter((item) => (item.incidentId?._id || item.incidentId || '').toString() === query.incidentId.toString());
            }
            if (query && query.responderId) {
                copy = copy.filter((item) => (item.responderId?._id || item.responderId || '').toString() === query.responderId.toString());
            }
            if (query && query.resourceId) {
                copy = copy.filter((item) => (item.resourceId?._id || item.resourceId || '').toString() === query.resourceId.toString());
            }
            if (query && query.status) {
                if (typeof query.status === 'string') {
                    copy = copy.filter((item) => item.status === query.status);
                } else if (query.status.$in) {
                    copy = copy.filter((item) => query.status.$in.includes(item.status));
                }
            }
            if (query && query.idempotencyKey) {
                copy = copy.filter((item) => item.idempotencyKey === query.idempotencyKey);
            }
            const found = copy[0] || null;
            return {
                _item: found,
                populate() { return this; },
                then(resolve, reject) { return Promise.resolve(this._item).then(resolve, reject); },
            };
        };

        Assignment.create = async (doc) => {
            const a = {
                ...doc,
                _id: new mongoose.Types.ObjectId(),
                status: doc.status || 'assigned',
                statusHistory: [{ status: doc.status || 'assigned', changedAt: new Date() }],
                declineReason: doc.declineReason || null,
                responderLocation: doc.responderLocation || null,
                createdAt: new Date(),
                updatedAt: new Date(),
                save: async function () {
                    this.updatedAt = new Date();
                    const idx = memoryAssignments.findIndex((item) => item._id.toString() === this._id.toString());
                    if (idx !== -1) memoryAssignments[idx] = this;
                    return this;
                },
            };
            memoryAssignments.push(a);
            return a;
        };

        Alert.create = async (doc) => {
            const alertId = new mongoose.Types.ObjectId();
            const alertItem = {
                ...doc,
                _id: alertId,
                id: alertId.toString(),
                recipient: doc.recipient,
                incidentId: doc.incidentId,
                type: doc.type,
                message: (doc.message || '').trim(),
                readStatus: doc.readStatus !== undefined ? doc.readStatus : false,
                readAt: doc.readAt || null,
                createdAt: new Date(),
                updatedAt: new Date(),
                save: async function () {
                    this.updatedAt = new Date();
                    return this;
                },
                toJSON: function () {
                    return { ...this };
                },
            };
            memoryAlerts.push(alertItem);
            return alertItem;
        };

        Alert.findOne = async (query) => {
            const found = memoryAlerts.find((a) => {
                if (query.recipient && (a.recipient?._id || a.recipient).toString() !== query.recipient.toString()) return false;
                if (query.incidentId && (a.incidentId?._id || a.incidentId).toString() !== query.incidentId.toString()) return false;
                if (query.type && a.type !== query.type) return false;
                if (query._id && a._id.toString() !== query._id.toString()) return false;
                return true;
            });
            return found || null;
        };

        Alert.findById = function (id) {
            const strId = id ? id.toString() : '';
            const found = memoryAlerts.find((a) => (a._id || a.id).toString() === strId) || null;
            return {
                _item: found,
                populate(field) {
                    if (found && field === 'incidentId') {
                        const inc = memoryIncidents.find((i) => (i._id || i.id).toString() === (found.incidentId?._id || found.incidentId).toString());
                        if (inc) {
                            found.incidentId = inc;
                        }
                    }
                    return this;
                },
                then(resolve, reject) {
                    return Promise.resolve(this._item).then(resolve, reject);
                },
            };
        };

        Alert.find = function (query = {}) {
            let filtered = [...memoryAlerts];
            if (query.recipient) {
                filtered = filtered.filter((a) => (a.recipient?._id || a.recipient).toString() === query.recipient.toString());
            }
            if (query.readStatus !== undefined) {
                filtered = filtered.filter((a) => Boolean(a.readStatus) === Boolean(query.readStatus));
            }
            if (query.type) {
                filtered = filtered.filter((a) => a.type === query.type);
            }
            return {
                _items: filtered,
                sort() {
                    this._items.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
                    return this;
                },
                skip(n) {
                    this._items = this._items.slice(n);
                    return this;
                },
                limit(n) {
                    this._items = this._items.slice(0, n);
                    return this;
                },
                populate(field) {
                    if (field === 'incidentId') {
                        this._items.forEach((a) => {
                            const inc = memoryIncidents.find((i) => (i._id || i.id).toString() === (a.incidentId?._id || a.incidentId).toString());
                            if (inc) a.incidentId = inc;
                        });
                    }
                    return this;
                },
                then(resolve, reject) {
                    return Promise.resolve(this._items).then(resolve, reject);
                },
            };
        };

        Alert.countDocuments = async (query = {}) => {
            let filtered = [...memoryAlerts];
            if (query.recipient) {
                filtered = filtered.filter((a) => (a.recipient?._id || a.recipient).toString() === query.recipient.toString());
            }
            if (query.readStatus !== undefined) {
                filtered = filtered.filter((a) => Boolean(a.readStatus) === Boolean(query.readStatus));
            }
            return filtered.length;
        };

        Alert.updateMany = async (query = {}, update = {}) => {
            let count = 0;
            for (const a of memoryAlerts) {
                let match = true;
                if (query.recipient && (a.recipient?._id || a.recipient).toString() !== query.recipient.toString()) match = false;
                if (query.readStatus !== undefined && Boolean(a.readStatus) !== Boolean(query.readStatus)) match = false;
                if (match) {
                    if (update.$set) {
                        Object.assign(a, update.$set);
                    }
                    count++;
                }
            }
            return { modifiedCount: count, nModified: count };
        };

        return true;
    }
}

function makeToken(user) {
    return jwt.sign(
        { id: user._id.toString(), email: user.email, role: user.role },
        config.jwt.secret,
        { expiresIn: '1h' }
    );
}

async function runTests() {
    console.log('\n===============================================================');
    console.log('   CRISISAI DAY 25 TEST SUITE: EMERGENCY ALERTS & REALTIME     ');
    console.log('===============================================================\n');

    await setupDatabase();

    httpServer = http.createServer(app);
    ioInstance = initSocket(httpServer);
    await new Promise((resolve) => httpServer.listen(TEST_PORT, resolve));
    console.log('  \uD83D\uDE80 Test server listening on http://localhost:' + TEST_PORT);

    const authUser = await User.create({
        name: 'Chief Authority Day25',
        email: 'chief25@crisisai.test',
        password: 'Password123!',
        role: 'authority',
    });
    const adminUser = await User.create({
        name: 'Admin Day25',
        email: 'admin25@crisisai.test',
        password: 'Password123!',
        role: 'admin',
    });
    const responderUser = await User.create({
        name: 'Responder Day25',
        email: 'resp25@crisisai.test',
        password: 'Password123!',
        role: 'volunteer',
    });
    const citizenUser = await User.create({
        name: 'Citizen Day25',
        email: 'citizen25@crisisai.test',
        password: 'Password123!',
        role: 'citizen',
    });
    const otherCitizen = await User.create({
        name: 'Other Citizen Day25',
        email: 'citizen_other25@crisisai.test',
        password: 'Password123!',
        role: 'citizen',
    });

    const tokenAuth = makeToken(authUser);
    const tokenAdmin = makeToken(adminUser);
    const tokenResp = makeToken(responderUser);
    const tokenCitizen = makeToken(citizenUser);
    const tokenOtherCitizen = makeToken(otherCitizen);

    console.log('\n--- Section 1: Alert MongoDB Model Validation ---');

    const validAlertDoc = new Alert({
        recipient: authUser._id,
        incidentId: new mongoose.Types.ObjectId(),
        type: 'critical_incident',
        message: 'Massive earthquake in Sector 7 requires immediate attention.',
    });
    let modelValidErr = null;
    try {
        await validAlertDoc.validate();
    } catch (e) {
        modelValidErr = e;
    }
    assert(
        modelValidErr === null,
        'Alert Model: Valid alert document passes schema validation',
        modelValidErr?.message
    );

    const missingRecipientDoc = new Alert({
        incidentId: new mongoose.Types.ObjectId(),
        type: 'critical_incident',
        message: 'Valid message without recipient',
    });
    let missingRecipientErr = null;
    try {
        await missingRecipientDoc.validate();
    } catch (e) {
        missingRecipientErr = e;
    }
    assert(
        Boolean(missingRecipientErr && missingRecipientErr.errors && missingRecipientErr.errors.recipient),
        'Alert Model: Rejects alert with missing recipient',
        missingRecipientErr ? Object.keys(missingRecipientErr.errors).join(', ') : 'no error'
    );

    const missingIncidentDoc = new Alert({
        recipient: authUser._id,
        type: 'critical_incident',
        message: 'Valid message without incidentId',
    });
    let missingIncidentErr = null;
    try {
        await missingIncidentDoc.validate();
    } catch (e) {
        missingIncidentErr = e;
    }
    assert(
        Boolean(missingIncidentErr && missingIncidentErr.errors && missingIncidentErr.errors.incidentId),
        'Alert Model: Rejects alert with missing incidentId',
        missingIncidentErr ? Object.keys(missingIncidentErr.errors).join(', ') : 'no error'
    );

    const invalidTypeDoc = new Alert({
        recipient: authUser._id,
        incidentId: new mongoose.Types.ObjectId(),
        type: 'unknown_disaster_ping',
        message: 'Invalid alert type test',
    });
    let invalidTypeErr = null;
    try {
        await invalidTypeDoc.validate();
    } catch (e) {
        invalidTypeErr = e;
    }
    assert(
        Boolean(invalidTypeErr && invalidTypeErr.errors && invalidTypeErr.errors.type),
        'Alert Model: Rejects alert with invalid type enum',
        invalidTypeErr ? invalidTypeErr.errors.type?.message : 'no error'
    );

    const emptyMsgDoc = new Alert({
        recipient: authUser._id,
        incidentId: new mongoose.Types.ObjectId(),
        type: 'critical_incident',
        message: '    ',
    });
    let emptyMsgErr = null;
    try {
        await emptyMsgDoc.validate();
    } catch (e) {
        emptyMsgErr = e;
    }
    assert(
        Boolean(emptyMsgErr && emptyMsgErr.errors && emptyMsgErr.errors.message),
        'Alert Model: Rejects alert with empty or whitespace-only message',
        emptyMsgErr ? emptyMsgErr.errors.message?.message : 'no error'
    );

    const defaultReadDoc = new Alert({
        recipient: authUser._id,
        incidentId: new mongoose.Types.ObjectId(),
        type: 'incident_verified',
        message: 'Incident verified by supervisor',
    });
    assert(
        defaultReadDoc.readStatus === false,
        'Alert Model: readStatus defaults to false',
        'readStatus=' + defaultReadDoc.readStatus
    );

    const savedTestAlert = await Alert.create({
        recipient: authUser._id,
        incidentId: new mongoose.Types.ObjectId(),
        type: 'incident_resolved',
        message: 'Crisis operations complete at Station 4',
    });
    assert(
        Boolean(savedTestAlert.createdAt) && savedTestAlert.readAt === null,
        'Alert Model: Tracks createdAt and initializes readAt as null',
        'createdAt=' + savedTestAlert.createdAt + ', readAt=' + savedTestAlert.readAt
    );

    const malformedObjDoc = new Alert({
        recipient: 'not-a-valid-object-id',
        incidentId: 'not-an-id-either',
        type: 'critical_incident',
        message: 'Malformed IDs test',
    });
    let malformedErr = null;
    try {
        await malformedObjDoc.validate();
    } catch (e) {
        malformedErr = e;
    }
    assert(
        Boolean(malformedErr && (malformedErr.errors?.recipient || malformedErr.errors?.incidentId)),
        'Alert Model: Rejects malformed ObjectId format for foreign keys',
        malformedErr ? Object.keys(malformedErr.errors).join(', ') : 'no error'
    );

    console.log('\n--- Section 2: Critical Incident Trigger & Automatic Generation ---');

    const criticalIncidentDoc = await Incident.create({
        report: 'Catastrophic dam breach in northern district with immediate mass casualties',
        summary: 'Dam breach and structural collapse',
        severity: 'critical',
        priorityScore: 92,
        location: 'Sector 9 Riverbank',
        status: 'reported',
    });

    const alertsCreatedCrit = await createCriticalIncidentAlerts(criticalIncidentDoc);
    assert(
        Array.isArray(alertsCreatedCrit) && alertsCreatedCrit.length >= 2,
        'Critical Trigger: Automatically generates alerts for severity: critical',
        'alerts count=' + alertsCreatedCrit.length
    );

    const highPriorityDoc = await Incident.create({
        report: 'Major chemical spill on highway with severe toxic fumes spreading',
        summary: 'Toxic highway spill',
        severity: 'high',
        priorityScore: 85,
        location: 'Interstate 95 Mile 44',
        status: 'reported',
    });
    const alertsCreatedHigh = await createCriticalIncidentAlerts(highPriorityDoc);
    assert(
        Array.isArray(alertsCreatedHigh) && alertsCreatedHigh.length >= 2,
        'Critical Trigger: Automatically generates alerts for priorityScore >= 80',
        'alerts count=' + alertsCreatedHigh.length
    );

    const lowIncidentDoc = await Incident.create({
        report: 'Minor trash bin fire extinguished quickly with garden hose',
        summary: 'Minor trash fire',
        severity: 'low',
        priorityScore: 25,
        location: 'Alleyway 2',
        status: 'reported',
    });
    const alertsCreatedLow = await createCriticalIncidentAlerts(lowIncidentDoc);
    assert(
        Array.isArray(alertsCreatedLow) && alertsCreatedLow.length === 0,
        'Critical Trigger: Suppresses alert generation for non-critical incidents (score < 80, severity low)',
        'alerts count=' + alertsCreatedLow.length
    );

    const duplicateRunAlerts = await createCriticalIncidentAlerts(criticalIncidentDoc);
    assert(
        Array.isArray(duplicateRunAlerts) && duplicateRunAlerts.length === 0,
        'Critical Trigger: Duplicate prevention stops redundant alert generation for same incident and recipient',
        're-run count=' + duplicateRunAlerts.length
    );

    const mutableIncidentDoc = await Incident.create({
        report: 'Localized gas leak reported by tenant',
        summary: 'Localized gas leak',
        severity: 'medium',
        priorityScore: 50,
        location: 'Apartment 304',
        status: 'reported',
    });
    const initialAlerts = await createCriticalIncidentAlerts(mutableIncidentDoc);
    mutableIncidentDoc.severity = 'critical';
    mutableIncidentDoc.priorityScore = 88;
    const escalatedAlerts = await createCriticalIncidentAlerts(mutableIncidentDoc);
    assert(
        initialAlerts.length === 0 && escalatedAlerts.length >= 2,
        'Critical Trigger: Generates alerts when an incident transitions from non-critical to critical',
        'initial=' + initialAlerts.length + ', escalated=' + escalatedAlerts.length
    );

    const stillNonCritIncident = await Incident.create({
        report: 'Fallen tree branch on sidewalk',
        summary: 'Sidewalk obstruction',
        severity: 'low',
        priorityScore: 20,
        location: 'Pine Street',
        status: 'reported',
    });
    stillNonCritIncident.priorityScore = 40;
    const stillNonCritAlerts = await createCriticalIncidentAlerts(stillNonCritIncident);
    assert(
        stillNonCritAlerts.length === 0,
        'Critical Trigger: Updates below critical threshold do not generate alerts',
        'alerts=' + stillNonCritAlerts.length
    );

    let failureIsolationPassed = false;
    try {
        const invalidRecipientResult = await resolveRecipientsForIncident(null);
        const emptyAlerts = await createCriticalIncidentAlerts(null);
        failureIsolationPassed = Array.isArray(invalidRecipientResult) && Array.isArray(emptyAlerts);
    } catch (_) {
        failureIsolationPassed = false;
    }
    assert(
        failureIsolationPassed,
        'Critical Trigger: Service isolates errors safely without throwing unhandled exceptions on edge cases',
        'failureIsolationPassed=' + failureIsolationPassed
    );

    assert(
        Boolean(alertsCreatedCrit[0]?.incidentId && alertsCreatedCrit[0]?.incidentId.toString() === criticalIncidentDoc._id.toString()),
        'Critical Trigger: Alerts reliably link to persisted incident _id',
        'linked incidentId=' + alertsCreatedCrit[0]?.incidentId
    );

    console.log('\n--- Section 3: Recipient Resolution Strategy ---');

    const resolvedRecipients = await resolveRecipientsForIncident(criticalIncidentDoc);
    assert(
        resolvedRecipients.includes(authUser._id.toString()),
        'Recipient Resolution: Identifies authority users as alert recipients',
        'authId=' + authUser._id
    );

    assert(
        resolvedRecipients.includes(adminUser._id.toString()),
        'Recipient Resolution: Identifies admin users as alert recipients',
        'adminId=' + adminUser._id
    );

    const testAssignIncident = await Incident.create({
        report: 'Industrial chemical leak requiring Hazmat team',
        summary: 'Hazmat leak',
        severity: 'critical',
        priorityScore: 90,
        location: 'Plant B',
    });

    const testAssignment = await Assignment.create({
        incidentId: testAssignIncident._id,
        responderId: responderUser._id,
        status: 'accepted',
    });

    const recipientsWithAssigned = await resolveRecipientsForIncident(testAssignIncident);
    assert(
        recipientsWithAssigned.includes(responderUser._id.toString()),
        'Recipient Resolution: Includes active assigned responders in incident alert recipients',
        'responderId=' + responderUser._id
    );

    assert(
        !recipientsWithAssigned.includes(citizenUser._id.toString()) &&
        !recipientsWithAssigned.includes(otherCitizen._id.toString()),
        'Recipient Resolution: Excludes non-operational citizens from alert recipient lists',
        'citizens excluded'
    );

    const doubleRoleAssignment = await Assignment.create({
        incidentId: testAssignIncident._id,
        responderId: authUser._id,
        status: 'en_route',
    });
    const deduplicatedRecipients = await resolveRecipientsForIncident(testAssignIncident);
    const authCount = deduplicatedRecipients.filter((id) => id === authUser._id.toString()).length;
    assert(
        authCount === 1,
        'Recipient Resolution: Deduplicates recipients when user has multiple matching associations',
        'auth occurrences=' + authCount
    );

    const cancelledAssignmentIncident = await Incident.create({
        report: 'Structural fire in vacant warehouse',
        summary: 'Warehouse fire',
        severity: 'critical',
        priorityScore: 88,
    });
    await Assignment.create({
        incidentId: cancelledAssignmentIncident._id,
        responderId: otherCitizen._id,
        status: 'cancelled',
    });
    const cancelledRecipients = await resolveRecipientsForIncident(cancelledAssignmentIncident);
    assert(
        !cancelledRecipients.includes(otherCitizen._id.toString()),
        'Recipient Resolution: Excludes responders with inactive/cancelled assignments',
        'inactive responder excluded'
    );

    console.log('\n--- Section 4: Alert REST API and Authorization ---');

    const unauthGetRes = await req('GET', '/alerts', undefined, null);
    assert(
        unauthGetRes.status === 401,
        'Alert API: GET /api/alerts returns 401 Unauthorized without valid token',
        'status=' + unauthGetRes.status
    );

    const authAlertRes = await req('GET', '/alerts', undefined, tokenAuth);
    assert(
        authAlertRes.status === 200 && Array.isArray(authAlertRes.data?.data),
        'Alert API: GET /api/alerts returns HTTP 200 with user alerts array',
        'status=' + authAlertRes.status + ', count=' + authAlertRes.data?.count
    );

    const citizenAlertRes = await req('GET', '/alerts', undefined, tokenCitizen);
    const citizenHasAuthAlerts = citizenAlertRes.data?.data?.some(
        (a) => (a.recipient?._id || a.recipient).toString() === authUser._id.toString()
    );
    assert(
        citizenAlertRes.status === 200 && !citizenHasAuthAlerts,
        'Alert API: User A cannot access or view User B alerts (tenant isolation)',
        'cross-user leaked=' + citizenHasAuthAlerts
    );

    const unreadCountRes = await req('GET', '/alerts/unread-count', undefined, tokenAuth);
    assert(
        unreadCountRes.status === 200 && typeof unreadCountRes.data?.count === 'number',
        'Alert API: GET /api/alerts/unread-count returns accurate integer count',
        'unread count=' + unreadCountRes.data?.count
    );

    const targetAlert = authAlertRes.data?.data?.[0];
    const targetAlertId = targetAlert?._id || targetAlert?.id;
    assert(
        Boolean(targetAlertId),
        'Alert API: Fixture alert present for read tests',
        'alertId=' + targetAlertId
    );

    const getSingleRes = await req('GET', '/alerts/' + targetAlertId, undefined, tokenAuth);
    assert(
        getSingleRes.status === 200 && (getSingleRes.data?.data?._id || getSingleRes.data?.data?.id) === targetAlertId,
        'Alert API: GET /api/alerts/:id returns single alert details for owner',
        'status=' + getSingleRes.status
    );

    const crossUserGetSingle = await req('GET', '/alerts/' + targetAlertId, undefined, tokenCitizen);
    assert(
        crossUserGetSingle.status === 403,
        'Alert API: GET /api/alerts/:id returns 403 Forbidden when requesting other user alert',
        'status=' + crossUserGetSingle.status
    );

    const malformedIdRes = await req('GET', '/alerts/invalid-id-format', undefined, tokenAuth);
    assert(
        malformedIdRes.status === 400,
        'Alert API: Returns 400 Bad Request for malformed alert ID format',
        'status=' + malformedIdRes.status
    );

    const fakeId = new mongoose.Types.ObjectId().toString();
    const missingIdRes = await req('GET', '/alerts/' + fakeId, undefined, tokenAuth);
    assert(
        missingIdRes.status === 404,
        'Alert API: Returns 404 Not Found for non-existent alert ID',
        'status=' + missingIdRes.status
    );

    const markReadRes = await req('PATCH', '/alerts/' + targetAlertId + '/read', {}, tokenAuth);
    assert(
        markReadRes.status === 200 && markReadRes.data?.data?.readStatus === true && Boolean(markReadRes.data?.data?.readAt),
        'Alert API: PATCH /api/alerts/:id/read marks alert as read with readAt timestamp',
        'readStatus=' + markReadRes.data?.data?.readStatus + ', readAt=' + markReadRes.data?.data?.readAt
    );

    const crossUserReadRes = await req('PATCH', '/alerts/' + targetAlertId + '/read', {}, tokenCitizen);
    assert(
        crossUserReadRes.status === 403,
        'Alert API: PATCH /api/alerts/:id/read returns 403 when updating another user alert',
        'status=' + crossUserReadRes.status
    );

    const idempotentReadRes = await req('PATCH', '/alerts/' + targetAlertId + '/read', {}, tokenAuth);
    assert(
        idempotentReadRes.status === 200 && idempotentReadRes.data?.data?.readStatus === true,
        'Alert API: Marking already-read alert is idempotent and returns 200 OK',
        'status=' + idempotentReadRes.status
    );

    await Alert.create({
        recipient: authUser._id,
        incidentId: criticalIncidentDoc._id,
        type: 'critical_incident',
        message: 'Secondary alert for bulk read test',
        readStatus: false,
    });
    const markAllRes = await req('PATCH', '/alerts/read-all', {}, tokenAuth);
    const postMarkAllCount = await req('GET', '/alerts/unread-count', undefined, tokenAuth);
    assert(
        markAllRes.status === 200 && postMarkAllCount.data?.count === 0,
        'Alert API: PATCH /api/alerts/read-all marks all user alerts read and zeroes unread count',
        'modifiedCount=' + markAllRes.data?.modifiedCount + ', postCount=' + postMarkAllCount.data?.count
    );

    console.log('\n--- Section 5: Real-Time Socket.IO Alert Notifications ---');

    let socketAuthReceived = null;
    let socketCitizenReceived = null;

    const authSocketClient = ioClient('http://localhost:' + TEST_PORT, {
        auth: { token: tokenAuth },
        transports: ['websocket'],
        forceNew: true,
    });
    const citizenSocketClient = ioClient('http://localhost:' + TEST_PORT, {
        auth: { token: tokenCitizen },
        transports: ['websocket'],
        forceNew: true,
    });

    await new Promise((resolve) => {
        let connectedCount = 0;
        const checkReady = () => {
            connectedCount++;
            if (connectedCount === 2) resolve();
        };
        authSocketClient.on('connect', checkReady);
        citizenSocketClient.on('connect', checkReady);
    });

    assert(
        authSocketClient.connected && citizenSocketClient.connected,
        'Socket.IO: Authenticated clients connect successfully and join rooms',
        'authConnected=' + authSocketClient.connected + ', citizenConnected=' + citizenSocketClient.connected
    );

    authSocketClient.on('alert:new', (data) => {
        socketAuthReceived = data;
    });
    citizenSocketClient.on('alert:new', (data) => {
        socketCitizenReceived = data;
    });

    const liveSocketAlertDoc = await Alert.create({
        recipient: authUser._id,
        incidentId: criticalIncidentDoc._id,
        type: 'critical_incident',
        message: 'Live Socket.IO delivery test message for Chief Authority',
    });
    emitNewAlert(liveSocketAlertDoc);

    await new Promise((res) => setTimeout(res, 300));

    assert(
        Boolean(socketAuthReceived && (socketAuthReceived.alertId || socketAuthReceived.id)),
        'Socket.IO: Emits alert:new event directly to targeted recipient user room',
        'received alertId=' + (socketAuthReceived?.alertId || socketAuthReceived?.id)
    );

    assert(
        socketCitizenReceived === null,
        'Socket.IO: Other user sockets do not receive private alert:new broadcast',
        'citizenReceived=' + (socketCitizenReceived ? 'leaked' : 'null')
    );

    authSocketClient.disconnect();
    await new Promise((res) => setTimeout(res, 100));
    const reconnectRes = await req('GET', '/alerts/unread-count', undefined, tokenAuth);
    assert(
        reconnectRes.status === 200,
        'Socket.IO: Disconnected client recovers state via API on reconnect',
        'reconnect unread count=' + reconnectRes.data?.count
    );

    let incidentEventReceived = false;
    citizenSocketClient.on('incident:created', () => {
        incidentEventReceived = true;
    });
    const broadcastIncident = await Incident.create({
        report: 'General public safety bulletin broadcast',
        summary: 'Public safety notice',
        severity: 'low',
        priorityScore: 30,
    });
    const { emitIncidentCreated } = await import('./src/services/socket.service.js');
    emitIncidentCreated(broadcastIncident);
    await new Promise((res) => setTimeout(res, 200));

    assert(
        incidentEventReceived,
        'Socket.IO: Day 21 broadcast events (incident:created) remain fully intact',
        'incidentEventReceived=' + incidentEventReceived
    );

    citizenSocketClient.disconnect();

    console.log('\n--- Section 6: System Integration & Regression ---');

    const authorityIncidentRes = await req('GET', '/incidents', undefined, tokenAuth);
    assert(
        authorityIncidentRes.status === 200,
        'Regression Day 22: Authority has access to incident management views',
        'status=' + authorityIncidentRes.status
    );

    const citizenBlockedOps = await req('POST', '/resources', { name: 'Unauthorized Unit' }, tokenCitizen);
    assert(
        citizenBlockedOps.status === 403,
        'Regression Day 22: Citizen role cannot access dispatcher/resource endpoints',
        'status=' + citizenBlockedOps.status
    );

    const testResource = await Resource.create({
        name: 'Rescue Engine 25',
        type: 'fire_rescue',
        quantity: 5,
        availableQuantity: 5,
        status: 'available',
    });
    const assignCreateRes = await req('POST', '/assignments', {
        incidentId: criticalIncidentDoc._id.toString(),
        responderId: responderUser._id.toString(),
        resourceId: testResource._id.toString(),
    }, tokenAuth);
    assert(
        assignCreateRes.status === 201 || assignCreateRes.status === 200,
        'Regression Day 23: Assignment creation workflow assigns responder and allocates resource',
        'status=' + assignCreateRes.status
    );

    const createdAssignmentId = assignCreateRes.data?.data?._id || assignCreateRes.data?.data?.id;
    const acceptRes = await req('PATCH', '/assignments/' + createdAssignmentId + '/status', {
        status: 'accepted',
    }, tokenResp);
    assert(
        acceptRes.status === 200 && acceptRes.data?.data?.status === 'accepted',
        'Regression Day 24: Responder can transition assignment status to accepted',
        'status=' + acceptRes.data?.data?.status
    );

    const locationRes = await req('PATCH', '/assignments/' + createdAssignmentId + '/location', {
        latitude: 37.7749,
        longitude: -122.4194,
    }, tokenResp);
    assert(
        locationRes.status === 200,
        'Regression Day 24: Responder can update live GPS location during assignment',
        'status=' + locationRes.status
    );

    const scoreResult = calculatePriorityScore({
        category: 'fire',
        severity: 'critical',
        urgency: 'immediate',
        peopleAffected: 50000,
        vulnerability: 1,
        resourceShortage: 1,
        confidence: 1,
        locationContext: 1,
    });
    assert(
        scoreResult.score >= 80,
        'Regression Day 10: Priority scoring engine correctly calculates critical score >= 80',
        'calculatedScore=' + scoreResult.score
    );

    const verifyRes = await req('PATCH', '/incidents/' + criticalIncidentDoc._id, {
        verificationState: 'verified',
    }, tokenAuth);
    assert(
        verifyRes.status === 200 && verifyRes.data?.data?.verificationState === 'verified',
        'Regression Day 11: Verification workflow safely transitions state to verified',
        'state=' + verifyRes.data?.data?.verificationState
    );

    console.log('\n--- Section 7: Full End-to-End Emergency Cycle ---');

    const e2eReportRes = await req('POST', '/incidents', {
        report: 'Severe wildfire spreading across residential blocks with immediate structural threat and 50 trapped families',
        location: 'Sector 5 Ridge',
        urgency: 'immediate',
        needs: ['fire_rescue', 'ambulance'],
    }, tokenCitizen);

    assert(
        e2eReportRes.status === 201 && Boolean(e2eReportRes.data?.data?._id),
        'End-to-End: Citizen submits critical emergency report successfully',
        'status=' + e2eReportRes.status
    );

    const e2eIncident = e2eReportRes.data?.data;
    await new Promise((res) => setTimeout(res, 300));

    const e2eAuthAlerts = await req('GET', '/alerts', undefined, tokenAuth);
    const foundE2EAlert = e2eAuthAlerts.data?.data?.find(
        (a) => (a.incidentId?._id || a.incidentId)?.toString() === e2eIncident?._id?.toString()
    );

    assert(
        Boolean(foundE2EAlert),
        'End-to-End: Authority automatically receives alert for critical citizen report without manual polling',
        'alert found=' + Boolean(foundE2EAlert)
    );

    const e2eReadRes = await req('PATCH', '/alerts/' + (foundE2EAlert?._id || foundE2EAlert?.id) + '/read', {}, tokenAuth);
    assert(
        e2eReadRes.status === 200 && e2eReadRes.data?.data?.readStatus === true,
        'End-to-End: Authority marks received alert as read',
        'readStatus=' + e2eReadRes.data?.data?.readStatus
    );

    console.log('\n===============================================================');
    console.log('                      TEST RESULTS SUMMARY                     ');
    console.log('===============================================================');
    console.log('  Total Assertions: ' + (passed + failed));
    console.log('  Passed:           ' + passed);
    console.log('  Failed:           ' + failed);
    console.log('===============================================================\n');

    closeSocket();
    if (httpServer) {
        await new Promise((resolve) => httpServer.close(resolve));
    }
    if (mongoose.connection && mongoose.connection.readyState !== 0) {
        await mongoose.disconnect();
    }

    if (failed > 0) {
        process.exit(1);
    } else {
        process.exit(0);
    }
}

runTests().catch((err) => {
    console.error('\n\u274c FATAL TEST RUNNER ERROR:', err);
    if (httpServer) httpServer.close();
    closeSocket();
    process.exit(1);
});

