const path = require('path');
const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');

dotenv.config({ path: path.join(__dirname, '.env') });

const authRoutes = require('./routes/authRoutes');
const userRoutes = require('./routes/userRoutes');
const transferRoutes = require('./routes/transferRoutes');
const approvalRoutes = require('./routes/approvalRoutes');
const tierRoutes = require('./routes/tierRoutes');
const overdraftRoutes = require('./routes/overdraftRoutes');
const dashboardRoutes = require('./routes/dashboardRoutes');
const notificationRoutes = require('./routes/notificationRoutes');
const businessRuleRoutes = require('./routes/businessRuleRoutes');
const { errorHandler, notFound } = require('./middleware/errorMiddleware');

const app = express();

const allowedOrigins = [
    'http://localhost:5173',
    'https://your-frontend-name.vercel.app',
];

app.use(cors({
    origin: allowedOrigins,
    credentials: true,
}));
app.use(express.json());

app.get('/', (req, res) => {
    res.send('API Running...');
});

app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/transfers', transferRoutes);
app.use('/api/approvals', approvalRoutes);
app.use('/api/tiers', tierRoutes);
app.use('/api/overdraft', overdraftRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/business-rules', businessRuleRoutes);

app.use(notFound);
app.use(errorHandler);

module.exports = app;
