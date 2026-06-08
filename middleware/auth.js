const jwt = require('jsonwebtoken');
const User = require('../models/User');

const auth = async (req, res, next) => {
  try {
    let token;
    
    // Check for token in Authorization header
    if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
      token = req.headers.authorization.split(' ')[1];
    }

    if (!token) {
      return res.status(401).json({ 
        success: false,
        message: 'You are not logged in! Please log in to access.' 
      });
    }

    // Verify token
    if (!process.env.JWT_SECRET) {
      return res.status(500).json({
        success: false,
        message: 'Server configuration error'
      });
    }
    
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    
    // Check if user still exists
    const currentUser = await User.findById(decoded.id);
    if (!currentUser) {
      return res.status(401).json({ 
        success: false,
        message: 'The user belonging to this token no longer exists.' 
      });
    }
    
    // Add user to request
    req.user = {
      _id: currentUser._id,
      id: currentUser._id.toString(),
      role: currentUser.role
    };
    next();
  } catch (err) {
    if (err.name === 'JsonWebTokenError') {
      return res.status(401).json({ 
        success: false,
        message: 'Invalid token. Please log in again.' 
      });
    }
    
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({ 
        success: false,
        message: 'Your token has expired. Please log in again.' 
      });
    }
    
    console.error('Auth middleware error:', err);
    res.status(401).json({ 
      success: false,
      message: 'Authentication failed. Please log in again.' 
    });
  }
};

module.exports = auth;