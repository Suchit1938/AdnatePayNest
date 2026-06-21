const app = require('./app');
const cron = require('node-cron');
const connectDB = require('./config/db');
const {
    runDueEmiProcessing,
    runMonthlyRepaymentProcessing,
} = require('./controllers/loanController');
const seedDatabase = require('./utils/seedData');

const PORT = process.env.PORT || 5000;
const DB_RETRY_MS = Number(process.env.DB_RETRY_MS || 10000);
const EMI_PROCESS_CRON = process.env.EMI_PROCESS_CRON || '0 0 * * *';
const EMI_PROCESS_TIMEZONE = process.env.EMI_PROCESS_TIMEZONE || 'Asia/Kolkata';
const EMI_PROCESS_RUN_ON_START = process.env.EMI_PROCESS_RUN_ON_START !== 'false';
const MONTHLY_REPAYMENT_CRON = process.env.MONTHLY_REPAYMENT_CRON || '0 1 1 * *';
const MONTHLY_REPAYMENT_RUN_ON_START = process.env.MONTHLY_REPAYMENT_RUN_ON_START === 'true';

const startRepaymentProcessor = () => {
    if (process.env.DISABLE_EMI_PROCESSOR === 'true') return;
    if (!cron.validate(EMI_PROCESS_CRON)) {
        console.error(`Invalid EMI_PROCESS_CRON expression: ${EMI_PROCESS_CRON}`);
        return;
    }

    let isRunning = false;
    const runProcessor = async () => {
        if (isRunning) {
            console.log('Skipping EMI processing because a previous run is still active.');
            return;
        }

        isRunning = true;
        try {
            const results = await runDueEmiProcessing();
            if (results.length > 0) {
                console.log(`Processed ${results.length} due loan EMI item(s).`);
            }
        } catch (error) {
            console.error('Automated EMI processing failed:', error.message);
        } finally {
            isRunning = false;
        }
    };

    cron.schedule(EMI_PROCESS_CRON, runProcessor, {
        timezone: EMI_PROCESS_TIMEZONE,
    });

    console.log(
        `Scheduled loan EMI processor with cron "${EMI_PROCESS_CRON}" (${EMI_PROCESS_TIMEZONE}).`
    );

    if (EMI_PROCESS_RUN_ON_START) {
        runProcessor();
    }
};

const startMonthlyRepaymentProcessor = () => {
    if (process.env.DISABLE_MONTHLY_REPAYMENT_PROCESSOR === 'true') return;
    if (!cron.validate(MONTHLY_REPAYMENT_CRON)) {
        console.error(`Invalid MONTHLY_REPAYMENT_CRON expression: ${MONTHLY_REPAYMENT_CRON}`);
        return;
    }

    let isRunning = false;
    const runProcessor = async () => {
        if (isRunning) {
            console.log('Skipping monthly repayment processing because a previous run is still active.');
            return;
        }

        isRunning = true;
        try {
            const summary = await runMonthlyRepaymentProcessing();
            console.log(
                `Monthly repayment processing completed. Collection rate: ${summary.collectionRate}%.`
            );
        } catch (error) {
            console.error('Monthly repayment processing failed:', error.message);
        } finally {
            isRunning = false;
        }
    };

    cron.schedule(MONTHLY_REPAYMENT_CRON, runProcessor, {
        timezone: EMI_PROCESS_TIMEZONE,
    });

    console.log(
        `Scheduled monthly repayment processor with cron "${MONTHLY_REPAYMENT_CRON}" (${EMI_PROCESS_TIMEZONE}).`
    );

    if (MONTHLY_REPAYMENT_RUN_ON_START) {
        runProcessor();
    }
};

const startServer = async () => {
    try {
        await connectDB();
        await seedDatabase();

        app.listen(PORT, () => {
            console.log(`Starting the server at port ${PORT}`);
            console.log(`http://localhost:${PORT}`);
            startRepaymentProcessor();
            startMonthlyRepaymentProcessor();
        });
    } catch (error) {
        console.error('Server startup failed:', error.message);
        console.log(`Retrying startup in ${DB_RETRY_MS / 1000}s...`);
        setTimeout(startServer, DB_RETRY_MS);
    }
};

startServer();
