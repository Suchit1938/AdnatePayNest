const app = require('./app');
const connectDB = require('./config/db');
const seedDatabase = require('./utils/seedData');

const PORT = process.env.PORT || 5000;
const DB_RETRY_MS = Number(process.env.DB_RETRY_MS || 10000);

const startServer = async () => {
    try {
        await connectDB();
        await seedDatabase();

        app.listen(PORT, () => {
            console.log(`Starting the server at port ${PORT}`);
            console.log(`http://localhost:${PORT}`);
        });
    } catch (error) {
        console.error('Server startup failed:', error.message);
        console.log(`Retrying startup in ${DB_RETRY_MS / 1000}s...`);
        setTimeout(startServer, DB_RETRY_MS);
    }
};

startServer();
