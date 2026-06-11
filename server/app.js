const dns = require('dns');
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
const { errorHandler, notFound } = require('./middleware/errorMiddleware');

dns.setServers(['8.8.8.8', '1.1.1.1']);
dns.setDefaultResultOrder('ipv4first');

const app = express();

app.use(cors());
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

app.use(notFound);
app.use(errorHandler);

module.exports = app;
