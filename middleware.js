const rateLimit = require('express-rate-limit');

const limiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 30, // limit each IP to 30 requests per minute
  message: { error: 'Too many requests, slow down.' }
});

const errHandler =(err, req, res, next) => {
  console.error('Global error handler:', err.stack);
  res.status(500).json({ error: 'Something went wrong!' });
};

module.exports = { limiter, errHandler };