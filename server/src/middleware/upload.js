'use strict';

const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const multer = require('multer');
const ApiError = require('../utils/ApiError');

// Storage directories under the server's uploads folder
const UPLOAD_ROOT = path.join(__dirname, '..', '..', 'uploads');
const BILLS_DIR = path.join(UPLOAD_ROOT, 'bills');
const DOCS_DIR = path.join(UPLOAD_ROOT, 'documents');
const PHOTOS_DIR = path.join(UPLOAD_ROOT, 'daily_work');
const CONTRACTOR_DOCS_DIR = path.join(UPLOAD_ROOT, 'contractor_documents');
const PO_DOCS_DIR = path.join(UPLOAD_ROOT, 'po_documents');
const SIGNATURES_DIR = path.join(UPLOAD_ROOT, 'signatures');

fs.mkdirSync(BILLS_DIR, { recursive: true });
fs.mkdirSync(DOCS_DIR, { recursive: true });
fs.mkdirSync(PHOTOS_DIR, { recursive: true });
fs.mkdirSync(CONTRACTOR_DOCS_DIR, { recursive: true });
fs.mkdirSync(PO_DOCS_DIR, { recursive: true });
fs.mkdirSync(SIGNATURES_DIR, { recursive: true });

// ------------------------------------------------------------------ 1. Bills
const ALLOWED_BILLS = new Map([
  ['image/jpeg', '.jpg'],
  ['image/png', '.png'],
  ['application/pdf', '.pdf'],
]);
const MAX_BILL_BYTES = 10 * 1024 * 1024; // 10 MB

const billStorage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, BILLS_DIR),
  filename: (req, file, cb) => {
    const ext = ALLOWED_BILLS.get(file.mimetype) || path.extname(file.originalname).toLowerCase();
    const unique = `${Date.now()}-${crypto.randomBytes(8).toString('hex')}`;
    cb(null, `bill-${unique}${ext}`);
  },
});

function billFilter(req, file, cb) {
  if (!ALLOWED_BILLS.has(file.mimetype)) {
    return cb(ApiError.badRequest('Only JPG, JPEG, PNG or PDF bills are allowed.'));
  }
  cb(null, true);
}

const multerBill = multer({ storage: billStorage, fileFilter: billFilter, limits: { fileSize: MAX_BILL_BYTES } }).single('bill');

function uploadBill(req, res, next) {
  multerBill(req, res, (err) => {
    if (err) {
      if (err instanceof multer.MulterError && err.code === 'LIMIT_FILE_SIZE') {
        return next(ApiError.badRequest('The bill file must be 10 MB or smaller.'));
      }
      return next(err instanceof ApiError ? err : ApiError.badRequest('Could not upload that file.'));
    }
    next();
  });
}

// ------------------------------------------------------------------ 2. Project / Site Documents
const ALLOWED_DOCS = new Set([
  'application/pdf',
  'image/jpeg',
  'image/png',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/acad',
  'image/vnd.dwg',
  'application/octet-stream', // commonly used for .dwg / CAD files
]);
const MAX_DOC_BYTES = 25 * 1024 * 1024; // 25 MB

const docStorage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, DOCS_DIR),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const unique = `${Date.now()}-${crypto.randomBytes(8).toString('hex')}`;
    cb(null, `doc-${unique}${ext}`);
  },
});

function docFilter(req, file, cb) {
  // Check MIME or extension
  const ext = path.extname(file.originalname).toLowerCase();
  const validExts = ['.pdf', '.jpg', '.jpeg', '.png', '.doc', '.docx', '.xls', '.xlsx', '.dwg', '.dxf'];
  if (!ALLOWED_DOCS.has(file.mimetype) && !validExts.includes(ext)) {
    return cb(ApiError.badRequest('Allowed document types: PDF, Images, Word, Excel, and CAD/DWG drawings.'));
  }
  cb(null, true);
}

const multerDocs = multer({ storage: docStorage, fileFilter: docFilter, limits: { fileSize: MAX_DOC_BYTES } }).array('documents', 10);

function uploadProjectDocuments(req, res, next) {
  multerDocs(req, res, (err) => {
    if (err) {
      if (err instanceof multer.MulterError && err.code === 'LIMIT_FILE_SIZE') {
        return next(ApiError.badRequest('Each document must be 25 MB or smaller.'));
      }
      return next(err instanceof ApiError ? err : ApiError.badRequest('Could not upload document(s).'));
    }
    next();
  });
}

// ------------------------------------------------------------------ 3. Daily Work Photos (Camera Capture)
const ALLOWED_PHOTOS = new Set(['image/jpeg', 'image/png', 'image/webp']);
const MAX_PHOTO_BYTES = 10 * 1024 * 1024; // 10 MB

const photoStorage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, PHOTOS_DIR),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase() || '.jpg';
    const unique = `${Date.now()}-${crypto.randomBytes(8).toString('hex')}`;
    cb(null, `work-${unique}${ext}`);
  },
});

function photoFilter(req, file, cb) {
  if (!ALLOWED_PHOTOS.has(file.mimetype)) {
    return cb(ApiError.badRequest('Only JPG, PNG or WEBP photos are allowed.'));
  }
  cb(null, true);
}

const multerPhotos = multer({ storage: photoStorage, fileFilter: photoFilter, limits: { fileSize: MAX_PHOTO_BYTES } }).array('photos', 5);

function uploadWorkPhotos(req, res, next) {
  multerPhotos(req, res, (err) => {
    if (err) {
      if (err instanceof multer.MulterError && err.code === 'LIMIT_FILE_SIZE') {
        return next(ApiError.badRequest('Each photo must be 10 MB or smaller.'));
      }
      return next(err instanceof ApiError ? err : ApiError.badRequest('Could not upload photo(s).'));
    }
    next();
  });
}

// ------------------------------------------------------------------ 4. Contractor Documents
const contractorDocStorage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, CONTRACTOR_DOCS_DIR),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const unique = `${Date.now()}-${crypto.randomBytes(8).toString('hex')}`;
    cb(null, `contractor-doc-${unique}${ext}`);
  },
});

const multerContractorDocs = multer({
  storage: contractorDocStorage,
  fileFilter: docFilter,
  limits: { fileSize: MAX_DOC_BYTES },
}).array('documents', 10);

function uploadContractorDocuments(req, res, next) {
  multerContractorDocs(req, res, (err) => {
    if (err) {
      if (err instanceof multer.MulterError && err.code === 'LIMIT_FILE_SIZE') {
        return next(ApiError.badRequest('Each document must be 25 MB or smaller.'));
      }
      return next(err instanceof ApiError ? err : ApiError.badRequest('Could not upload document(s).'));
    }
    next();
  });
}

// ------------------------------------------------------------------ 5. Signature Upload
const signatureStorage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, SIGNATURES_DIR),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase() || '.png';
    const unique = `${Date.now()}-${crypto.randomBytes(8).toString('hex')}`;
    cb(null, `sig-${unique}${ext}`);
  },
});

const multerSignature = multer({
  storage: signatureStorage,
  fileFilter: (req, file, cb) => {
    const allowed = ['image/png', 'image/jpeg', 'image/jpg'];
    if (!allowed.includes(file.mimetype)) {
      return cb(ApiError.badRequest('Signature must be a PNG or JPEG image.'));
    }
    cb(null, true);
  },
  limits: { fileSize: 5 * 1024 * 1024 },
}).single('signature_file');

function uploadSignature(req, res, next) {
  multerSignature(req, res, (err) => {
    if (err) return next(err instanceof ApiError ? err : ApiError.badRequest('Could not upload signature image.'));
    next();
  });
}

/** Helper to save base64 data URL signature from interactive canvas */
function saveBase64Signature(base64Data, prefix = 'sig') {
  if (!base64Data) return null;
  const matches = base64Data.match(/^data:([A-Za-z-+/]+);base64,(.+)$/);
  if (!matches || matches.length !== 3) return null;
  const ext = matches[1].includes('jpeg') || matches[1].includes('jpg') ? '.jpg' : '.png';
  const buffer = Buffer.from(matches[2], 'base64');
  const filename = `${prefix}-${Date.now()}-${crypto.randomBytes(8).toString('hex')}${ext}`;
  const filepath = path.join(SIGNATURES_DIR, filename);
  fs.writeFileSync(filepath, buffer);
  return filepath;
}

module.exports = {
  uploadBill,
  uploadProjectDocuments,
  uploadWorkPhotos,
  uploadContractorDocuments,
  uploadSignature,
  saveBase64Signature,
  BILLS_DIR,
  DOCS_DIR,
  PHOTOS_DIR,
  CONTRACTOR_DOCS_DIR,
  PO_DOCS_DIR,
  SIGNATURES_DIR,
  UPLOAD_ROOT,
  MAX_BILL_BYTES,
  MAX_DOC_BYTES,
  MAX_PHOTO_BYTES,
};

