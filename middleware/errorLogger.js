// backend/middleware/errorLogger.js
const errorLogger = (err, req, res, next) => {
  console.error('Error occurred:');
  console.error('URL:', req.url);
  console.error('Method:', req.method);
  console.error('Headers:', req.headers);
  console.error('Body:', req.body);
  console.error('Error:', err.message);
  console.error('Stack:', err.stack);
  next(err);
};

module.exports = errorLogger;