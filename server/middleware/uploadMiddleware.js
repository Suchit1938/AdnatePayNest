const fs = require('fs');
const path = require('path');

const multer = require('multer');

const loanDocumentDir = path.join(__dirname, '..', 'uploads', 'loan-documents');

fs.mkdirSync(loanDocumentDir, { recursive: true });

const allowedMimeTypes = new Set([
  'application/pdf',
  'image/jpeg',
  'image/png',
]);

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, loanDocumentDir);
  },
  filename: (req, file, cb) => {
    const extension = path.extname(file.originalname || '').toLowerCase();
    const safeBaseName = path
      .basename(file.originalname || 'loan-document', extension)
      .replace(/[^a-zA-Z0-9_-]/g, '-')
      .slice(0, 60);
    const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;

    cb(null, `${safeBaseName || 'loan-document'}-${uniqueSuffix}${extension}`);
  },
});

const uploadLoanDocuments = multer({
  storage,
  limits: {
    fileSize: 2 * 1024 * 1024,
    files: 8,
  },
  fileFilter: (req, file, cb) => {
    if (!allowedMimeTypes.has(file.mimetype)) {
      cb(new Error('Only PDF, JPG, and PNG documents are allowed'));
      return;
    }

    cb(null, true);
  },
});

module.exports = { uploadLoanDocuments };
