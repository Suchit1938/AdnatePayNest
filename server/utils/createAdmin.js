const path = require('path');
const bcrypt = require('bcryptjs');
const dotenv = require('dotenv');
const mongoose = require('mongoose');

dotenv.config({ path: path.join(__dirname, '..', '.env') });

const User = require('../models/User');
const connectDB = require('../config/db');

const getArgValue = (name) => {
  const prefix = `--${name}=`;
  const arg = process.argv.find((value) => value.startsWith(prefix));

  return arg ? arg.slice(prefix.length).trim() : '';
};

const main = async () => {
  const name = getArgValue('name') || process.env.ADMIN_NAME;
  const email = (getArgValue('email') || process.env.ADMIN_EMAIL || '')
    .toLowerCase()
    .trim();
  const password = getArgValue('password') || process.env.ADMIN_PASSWORD;
  const phone = getArgValue('phone') || process.env.ADMIN_PHONE;
  const employeeId = getArgValue('employeeId') || process.env.ADMIN_EMPLOYEE_ID;

  if (!name || !email || !password) {
    throw new Error(
      'Name, email, and password are required. Example: npm run admin:create -- --name="New Admin" --email="admin@example.com" --password="StrongPass123"'
    );
  }

  await connectDB();

  const passwordHash = await bcrypt.hash(password, 10);
  const existingAdmin = await User.findOne({ email });

  if (existingAdmin) {
    existingAdmin.name = name;
    existingAdmin.password = passwordHash;
    existingAdmin.role = 'admin';
    existingAdmin.status = 'active';
    existingAdmin.isVerified = true;
    existingAdmin.phone = phone || existingAdmin.phone;
    existingAdmin.employeeId = employeeId || existingAdmin.employeeId;
    existingAdmin.permissions = [
      'manage-users',
      'manage-transactions',
      'manage-managers',
      'view-analytics',
      'system-control',
    ];

    await existingAdmin.save();
    console.log(`Admin updated: ${email}`);
    return;
  }

  await User.create({
    name,
    email,
    password: passwordHash,
    role: 'admin',
    status: 'active',
    isVerified: true,
    phone,
    employeeId,
    permissions: [
      'manage-users',
      'manage-transactions',
      'manage-managers',
      'view-analytics',
      'system-control',
    ],
  });

  console.log(`Admin created: ${email}`);
};

main()
  .catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    await mongoose.disconnect();
  });
