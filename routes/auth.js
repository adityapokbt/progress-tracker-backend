const express = require('express');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const nodemailer = require('nodemailer');
const { db } = require('../firebase');
const router = express.Router();

// Configure email transporter
let transporter;
try {
  transporter = nodemailer.createTransport({
    service: process.env.EMAIL_SERVICE || 'Gmail',
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS
    }
  });
  
  transporter.verify(function(error, success) {
    if (error) {
      console.error('Email transporter error:', error);
    } else {
      console.log('Email transporter is ready to send messages');
    }
  });
} catch (error) {
  console.error('Email transporter configuration error:', error);
  transporter = {
    sendMail: async (mailOptions) => {
      console.log('Mock email sending:', mailOptions);
      return { messageId: 'mock-message-id' };
    }
  };
}

// Generate JWT Token
const signToken = (id) => {
  return jwt.sign({ id }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN,
  });
};

// Helper function to find user by email
const findUserByEmail = async (email) => {
  const usersRef = db.collection('users');
  const snapshot = await usersRef.where('email', '==', email).limit(1).get();
  
  if (snapshot.empty) return null;
  
  const doc = snapshot.docs[0];
  return { id: doc.id, ...doc.data() };
};

// Helper function to find user by id
const findUserById = async (id) => {
  const userRef = db.collection('users').doc(id);
  const userDoc = await userRef.get();
  
  if (!userDoc.exists) return null;
  
  return { id: userDoc.id, ...userDoc.data() };
};

// Helper function to update user
const updateUser = async (id, data) => {
  const userRef = db.collection('users').doc(id);
  await userRef.update({
    ...data,
    updatedAt: new Date()
  });
  
  const updatedDoc = await userRef.get();
  return { id: updatedDoc.id, ...updatedDoc.data() };
};

// Helper function to create user
const createUser = async (userData) => {
  const usersRef = db.collection('users');
  const newUser = {
    ...userData,
    createdAt: new Date(),
    updatedAt: new Date()
  };
  
  const docRef = await usersRef.add(newUser);
  return { id: docRef.id, ...newUser };
};

// Forgot password - send OTP
router.post('/forgot-password', async (req, res) => {
  try {
    const { email } = req.body;
    
    if (!email) {
      return res.status(400).json({
        status: 'fail',
        message: 'Email is required'
      });
    }

    const user = await findUserByEmail(email);
    
    if (!user) {
      return res.status(200).json({
        status: 'success',
        message: 'If the email exists, a reset OTP has been sent'
      });
    }

    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const resetPasswordExpires = Date.now() + 10 * 60 * 1000;
    
    await updateUser(user.id, { resetPasswordOTP: otp, resetPasswordExpires });
    
    try {
      const mailOptions = {
        from: process.env.EMAIL_USER || 'noreply@pos-saas.com',
        to: email,
        subject: 'Password Reset OTP - POS System',
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h2 style="color: #333;">Password Reset Request</h2>
            <p>Use the OTP code below to reset your password:</p>
            <div style="background-color: #f5f5f5; padding: 15px; border-radius: 5px; text-align: center; margin: 20px 0;">
              <h3 style="margin: 0; color: #333; letter-spacing: 3px;">${otp}</h3>
            </div>
            <p>This OTP will expire in 10 minutes.</p>
            <p>If you didn't request this reset, please ignore this email.</p>
          </div>
        `
      };

      await transporter.sendMail(mailOptions);
      
      res.status(200).json({
        status: 'success',
        message: 'OTP sent to your email'
      });
    } catch (emailError) {
      console.error('Email sending error:', emailError);
      
      await updateUser(user.id, { resetPasswordOTP: null, resetPasswordExpires: null });
      
      return res.status(500).json({
        status: 'fail',
        message: 'Error sending email. Please try again later.'
      });
    }
  } catch (err) {
    console.error('Forgot password error:', err);
    res.status(500).json({
      status: 'error',
      message: 'Internal server error'
    });
  }
});

// Verify OTP
router.post('/verify-otp', async (req, res) => {
  try {
    const { email, otp } = req.body;
    
    if (!email || !otp) {
      return res.status(400).json({
        status: 'fail',
        message: 'Email and OTP are required'
      });
    }

    const usersRef = db.collection('users');
    const snapshot = await usersRef
      .where('email', '==', email)
      .where('resetPasswordOTP', '==', otp)
      .limit(1)
      .get();

    if (snapshot.empty) {
      return res.status(400).json({
        status: 'fail',
        message: 'Invalid OTP'
      });
    }

    const user = { id: snapshot.docs[0].id, ...snapshot.docs[0].data() };
    
    if (user.resetPasswordExpires && user.resetPasswordExpires < Date.now()) {
      return res.status(400).json({
        status: 'fail',
        message: 'OTP has expired'
      });
    }

    res.status(200).json({
      status: 'success',
      message: 'OTP verified successfully'
    });
  } catch (err) {
    console.error('Verify OTP error:', err);
    res.status(500).json({
      status: 'error',
      message: 'Internal server error'
    });
  }
});

// Reset password
router.post('/reset-password', async (req, res) => {
  try {
    const { email, otp, newPassword, confirmPassword } = req.body;
    
    if (!email || !otp || !newPassword || !confirmPassword) {
      return res.status(400).json({
        status: 'fail',
        message: 'All fields are required'
      });
    }

    if (newPassword !== confirmPassword) {
      return res.status(400).json({
        status: 'fail',
        message: 'Passwords do not match'
      });
    }

    if (newPassword.length < 6) {
      return res.status(400).json({
        status: 'fail',
        message: 'Password must be at least 6 characters'
      });
    }

    const usersRef = db.collection('users');
    const snapshot = await usersRef
      .where('email', '==', email)
      .where('resetPasswordOTP', '==', otp)
      .limit(1)
      .get();

    if (snapshot.empty) {
      return res.status(400).json({
        status: 'fail',
        message: 'Invalid or expired OTP'
      });
    }

    const user = { id: snapshot.docs[0].id, ...snapshot.docs[0].data() };
    
    if (user.resetPasswordExpires && user.resetPasswordExpires < Date.now()) {
      return res.status(400).json({
        status: 'fail',
        message: 'OTP has expired'
      });
    }

    const hashedPassword = await bcrypt.hash(newPassword, 12);

    const userRef = db.collection('users').doc(user.id);
    await userRef.update({
      password: hashedPassword,
      resetPasswordOTP: null,
      resetPasswordExpires: null,
      updatedAt: new Date()
    });

    res.status(200).json({
      status: 'success',
      message: 'Password reset successfully'
    });
  } catch (err) {
    console.error('Reset password error:', err);
    res.status(500).json({
      status: 'error',
      message: 'Internal server error during password reset'
    });
  }
});

// Signup Route with product key validation
router.post('/signup', async (req, res) => {
  try {
    const {
      fullName,
      phoneNumber,
      email,
      password,
      confirmPassword,
      storeName,
      storeType,
      address,
      panVatNumber,
      productKey
    } = req.body;

    if (!fullName || !phoneNumber || !email || !password || !confirmPassword || 
        !storeName || !storeType || !address || !productKey) {
      return res.status(400).json({
        status: 'fail',
        message: 'All fields are required except PAN/VAT number'
      });
    }

    if (password !== confirmPassword) {
      return res.status(400).json({
        status: 'fail',
        message: 'Passwords do not match'
      });
    }

    // Check if product key is valid
    const productKeysRef = db.collection('productKeys');
    const keySnapshot = await productKeysRef
      .where('key', '==', productKey)
      .where('isUsed', '==', false)
      .limit(1)
      .get();

    if (keySnapshot.empty) {
      return res.status(400).json({
        status: 'fail',
        message: 'Invalid or already used product key'
      });
    }

    const validProductKeyDoc = keySnapshot.docs[0];
    const validProductKey = { id: validProductKeyDoc.id, ...validProductKeyDoc.data() };

    // Check if user already exists
    const usersRef = db.collection('users');
    const emailSnapshot = await usersRef.where('email', '==', email).limit(1).get();
    const phoneSnapshot = await usersRef.where('phoneNumber', '==', phoneNumber).limit(1).get();

    if (!emailSnapshot.empty || !phoneSnapshot.empty) {
      return res.status(400).json({
        status: 'fail',
        message: 'User with this email or phone number already exists'
      });
    }

    const hashedPassword = await bcrypt.hash(password, 12);

    const newUser = await createUser({
      fullName,
      phoneNumber,
      email,
      password: hashedPassword,
      storeName,
      storeType,
      address,
      panVatNumber: panVatNumber || null,
      productKey,
      role: 'admin'
    });

    const productKeyRef = db.collection('productKeys').doc(validProductKey.id);
    await productKeyRef.update({
      isUsed: true,
      usedAt: new Date(),
      usedBy: newUser.id
    });

    const token = signToken(newUser.id);

    const { password: _, ...userWithoutPassword } = newUser;

    res.status(201).json({
      status: 'success',
      token,
      data: { user: userWithoutPassword }
    });
  } catch (err) {
    console.error('Signup error:', err);
    res.status(400).json({
      status: 'fail',
      message: err.message
    });
  }
});

// Login Route
router.post('/login', async (req, res) => {
  try {
    console.log('Login attempt received:', req.body);
    
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        status: 'fail',
        message: 'Please provide email and password'
      });
    }

    const user = await findUserByEmail(email);
    
    if (!user) {
      return res.status(401).json({
        status: 'fail',
        message: 'Incorrect email or password'
      });
    }

    const isPasswordCorrect = await bcrypt.compare(password, user.password);
    
    if (!isPasswordCorrect) {
      return res.status(401).json({
        status: 'fail',
        message: 'Incorrect email or password'
      });
    }

    const token = signToken(user.id);

    const { password: _, ...userWithoutPassword } = user;

    res.status(200).json({
      status: 'success',
      token,
      data: { user: userWithoutPassword }
    });
  } catch (err) {
    console.error('Login error:', err);
    res.status(400).json({
      status: 'fail',
      message: err.message
    });
  }
});

// Password verification endpoint
router.post('/verify-password', async (req, res) => {
  try {
    const { password } = req.body;
    const token = req.headers.authorization?.split(' ')[1];
    
    if (!token) {
      return res.status(401).json({
        status: 'fail',
        message: 'No token provided'
      });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await findUserById(decoded.id);
    
    if (!user) {
      return res.status(404).json({
        status: 'fail',
        message: 'User not found'
      });
    }

    const isPasswordCorrect = await bcrypt.compare(password, user.password);
    
    if (isPasswordCorrect) {
      res.status(200).json({
        status: 'success',
        valid: true
      });
    } else {
      res.status(401).json({
        status: 'fail',
        valid: false,
        message: 'Incorrect password'
      });
    }
  } catch (err) {
    console.error('Password verification error:', err);
    res.status(500).json({
      status: 'error',
      message: 'Server error during password verification'
    });
  }
});

// Get current user
router.get('/me', async (req, res) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    
    if (!token) {
      return res.status(401).json({
        status: 'fail',
        message: 'No token provided'
      });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await findUserById(decoded.id);

    if (!user) {
      return res.status(404).json({
        status: 'fail',
        message: 'User not found'
      });
    }

    const { password, ...userWithoutPassword } = user;

    res.status(200).json({
      status: 'success',
      data: { user: userWithoutPassword }
    });
  } catch (err) {
    console.error('Get me error:', err);
    res.status(401).json({
      status: 'fail',
      message: 'Invalid token'
    });
  }
});

// Test route
router.get('/test', (req, res) => {
  res.json({ message: 'Auth routes are working correctly!' });
});

module.exports = router;