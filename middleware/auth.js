const jwt = require('jsonwebtoken');
const { db } = require('../firebase');

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
      console.error('JWT_SECRET is not defined in environment variables');
      return res.status(500).json({
        success: false,
        message: 'Server configuration error'
      });
    }
    
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    
    if (!decoded || !decoded.id) {
      return res.status(401).json({ 
        success: false,
        message: 'Invalid token structure. Please log in again.' 
      });
    }
    
    // Check if user still exists in Firestore
    let currentUser = null;
    let userDoc = null;
    
    try {
      // Try to find user by ID in Firestore
      const userRef = db.collection('users').doc(decoded.id);
      userDoc = await userRef.get();
      
      if (userDoc.exists) {
        currentUser = { id: userDoc.id, ...userDoc.data() };
      }
      
      // If not found by ID, try to find by the old _id format
      if (!currentUser) {
        const usersRef = db.collection('users');
        const snapshot = await usersRef.where('_id', '==', decoded.id).limit(1).get();
        if (!snapshot.empty) {
          const doc = snapshot.docs[0];
          currentUser = { id: doc.id, ...doc.data() };
        }
      }
    } catch (dbError) {
      console.error('Firestore error in auth middleware:', dbError);
    }
    
    if (!currentUser) {
      return res.status(401).json({ 
        success: false,
        message: 'The user belonging to this token no longer exists.' 
      });
    }
    
    // Add user to request with both _id and id for compatibility
    req.user = {
      _id: currentUser.id,
      id: currentUser.id,
      role: currentUser.role || 'user',
      store: currentUser.store || currentUser.id // For store-based queries
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