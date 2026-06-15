const dns = require('dns').promises;
const mongoose = require('mongoose');

const DNS_LOOKUP_TIMEOUT_MS = Number(process.env.DNS_LOOKUP_TIMEOUT_MS || 8000);

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

    await withTimeout(
        dns.resolveSrv(`_mongodb._tcp.${hostname}`),
        DNS_LOOKUP_TIMEOUT_MS,
        `MongoDB Atlas DNS lookup timed out after ${DNS_LOOKUP_TIMEOUT_MS / 1000}s`
    );
};

const connectDB = async () => {
    try {
        if (!process.env.MONGO_URI) {
            throw new Error('MONGO_URI is missing from server/.env');
        }

        await verifySrvRecord(process.env.MONGO_URI);

        await mongoose.connect(process.env.MONGO_URI, {
            serverSelectionTimeoutMS: 10000,
            connectTimeoutMS: 10000,
        });

        console.log("MongoDB Connected");
    } catch (error) {
        throw error;
    }
};

module.exports = connectDB;
