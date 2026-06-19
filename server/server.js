const app = require('./app');
const connectDB = require('./config/db');
const { runDueEmiProcessing } = require('./controllers/loanController');
const seedDatabase = require('./utils/seedData');

const PORT = process.env.PORT || 5000;
const DB_RETRY_MS = Number(process.env.DB_RETRY_MS || 10000);
const EMI_PROCESS_INTERVAL_MS = Number(process.env.EMI_PROCESS_INTERVAL_MS || 24 * 60 * 60 * 1000);

const startRepaymentProcessor = () => {
    if (process.env.DISABLE_EMI_PROCESSOR === 'true') return;

    const runProcessor = async () => {
        try {
            const results = await runDueEmiProcessing();
            if (results.length > 0) {
                console.log(`Processed ${results.length} due loan EMI item(s).`);
            }
        } catch (error) {
            console.error('Automated EMI processing failed:', error.message);
        }
    };

    runProcessor();
    setInterval(runProcessor, EMI_PROCESS_INTERVAL_MS);
};

const startServer = async () => {
    try {
        await connectDB();
        await seedDatabase();

        app.listen(PORT, () => {
            console.log(`Starting the server at port ${PORT}`);
            console.log(`http://localhost:${PORT}`);
            startRepaymentProcessor();
        });
    } catch (error) {
        console.error('Server startup failed:', error.message);
        console.log(`Retrying startup in ${DB_RETRY_MS / 1000}s...`);
        setTimeout(startServer, DB_RETRY_MS);
    }
};

startServer();
