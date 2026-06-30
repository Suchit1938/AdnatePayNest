const path = require('path');
const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const csrfProtection = require('./middleware/csrfProtection');
const rateLimit = require('express-rate-limit');

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
const loanRoutes = require('./routes/loanRoutes');
const fixedDepositRoutes = require('./routes/fixedDepositRoutes');
const recurringDepositRoutes = require('./routes/recurringDepositRoutes');
const depositApprovalRoutes = require('./routes/depositApprovalRoutes');
const reportRoutes = require('./routes/reportRoutes');
const { errorHandler, notFound } = require('./middleware/errorMiddleware');

const app = express();

const allowedOrigins = [
    'http://localhost:5173',
    'http://127.0.0.1:5173',
    'https://adnate-pay-nest.vercel.app',
];

app.use(cors({
    origin: allowedOrigins,
    credentials: true,
}));

// Apply CSRF protection globally
app.use(csrfProtection);
// Global rate limiter (optional) – can be refined per route
const globalLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 100, // allow up to 100 requests per minute per IP
});
app.use(globalLimiter);
app.use(express.json({ limit: '12mb' }));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

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
app.use('/api/loans', loanRoutes);
app.use('/api/fixed-deposits', fixedDepositRoutes);
app.use('/api/recurring-deposits', recurringDepositRoutes);
app.use('/api/deposit-approvals', depositApprovalRoutes);
app.use('/api/reports', reportRoutes);

app.use(notFound);
app.use(errorHandler);

module.exports = app;
