const crypto = require('crypto');

// Generate a hash of QR code content to detect changes
const generateQRHash = (content) => {
  return crypto.createHash('md5').update(content).digest('hex');
};

// Check if QR code content has changed
const hasQRContentChanged = (currentHash, newContent) => {
  const newHash = generateQRHash(newContent);
  return currentHash !== newHash;
};

module.exports = {
  generateQRHash,
  hasQRContentChanged
};