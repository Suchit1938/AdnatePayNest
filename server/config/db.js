const dns = require('dns');
const mongoose = require('mongoose');

const DNS_LOOKUP_TIMEOUT_MS = Number(process.env.DNS_LOOKUP_TIMEOUT_MS || 8000);
const MONGO_DNS_SERVERS = String(process.env.MONGO_DNS_SERVERS || '1.1.1.1,8.8.8.8')
    .split(',')
    .map((server) => server.trim())
    .filter(Boolean);
const LOCAL_MONGO_URI = process.env.MONGO_LOCAL_URI || 'mongodb://127.0.0.1:27017/adnatepaynest';
const SHOULD_USE_LOCAL_FALLBACK = process.env.MONGO_LOCAL_FALLBACK !== 'false';

const withTimeout = (promise, ms, message) =>
    Promise.race([
        promise,
        new Promise((_, reject) => {
            setTimeout(() => reject(new Error(message)), ms);
        }),
    ]);

const verifySrvRecord = async (mongoUri) => {
    if (!mongoUri || !mongoUri.startsWith('mongodb+srv://')) {
        return;
    }

    const { hostname } = new URL(mongoUri);

    if (MONGO_DNS_SERVERS.length > 0) {
        dns.setServers(MONGO_DNS_SERVERS);
    }

    try {
        await withTimeout(
            dns.promises.resolveSrv(`_mongodb._tcp.${hostname}`),
            DNS_LOOKUP_TIMEOUT_MS,
            `MongoDB Atlas DNS lookup timed out after ${DNS_LOOKUP_TIMEOUT_MS / 1000}s`
        );
    } catch (error) {
        throw new Error(
            [
                `MongoDB Atlas DNS lookup failed for ${hostname}: ${error.message}`,
                'If this network blocks SRV DNS lookups, set MONGO_DNS_SERVERS=1.1.1.1,8.8.8.8',
                'or replace MONGO_URI with a standard mongodb:// replica-set connection string.',
            ].join(' ')
        );
    }
};

const connectDB = async () => {
    try {
        if (!process.env.MONGO_URI) {
            throw new Error('MONGO_URI is missing from server/.env');
        }

        let mongoUri = process.env.MONGO_URI;

        try {
            await verifySrvRecord(mongoUri);
        } catch (error) {
            if (!SHOULD_USE_LOCAL_FALLBACK || !mongoUri.startsWith('mongodb+srv://')) {
                throw error;
            }

            console.warn(error.message);
            console.warn(`Falling back to local MongoDB: ${LOCAL_MONGO_URI}`);
            mongoUri = LOCAL_MONGO_URI;
        }

        await mongoose.connect(mongoUri, {
            serverSelectionTimeoutMS: 10000,
            connectTimeoutMS: 10000,
        });

        console.log("MongoDB Connected");
    } catch (error) {
        throw error;
    }
};

module.exports = connectDB;
