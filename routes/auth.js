const express = require('express');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const nodemailer = require('nodemailer');
const User = require('../models/User');
const ProductKey = require('../models/ProductKey');
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

    const user = await User.findOne({ email });
    
    if (!user) {
      return res.status(200).json({
        status: 'success',
        message: 'If the email exists, a reset OTP has been sent'
      });
    }

    // Generate 6-digit OTP
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    
    // Set OTP and expiration (10 minutes)
    user.resetPasswordOTP = otp;
    user.resetPasswordExpires = Date.now() + 10 * 60 * 1000;
    
    await user.save({ validateBeforeSave: false });
    
    // Send email
    try {
      const mailOptions = {
        from: process.env.EMAIL_USER || 'noreply@pos-saas.com',
        to: email,
        subject: 'Password Reset OTP - POS System',
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h2 style="color: #333;">Password Reset Request</h2>
            <p>You requested to reset your password for your POS System account. Use the OTP code below to reset your password:</p>
            <div style="background-color: #f5f5f5; padding: 15px; border-radius: 5px; text-align: center; margin: 20px 0;">
              <h3 style="margin: 0; color: #333; letter-spacing: 3px;">${otp}</h3>
            </div>
            <p>This OTP will expire in 10 minutes.</p>
            <p>If you didn't request this reset, please ignore this email.</p>
            <hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;">
            <p style="color: #888; font-size: 12px;">This is an automated message, please do not reply.</p>
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
      
      if (process.env.NODE_ENV === 'development') {
        return res.status(200).json({
          status: 'success',
          message: 'OTP sent to your email',
          debugOtp: otp
        });
      }
      
      user.resetPasswordOTP = undefined;
      user.resetPasswordExpires = undefined;
      await user.save({ validateBeforeSave: false });
      
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

    // Find user with OTP fields explicitly selected
    const user = await User.findOne({
      email,
      resetPasswordOTP: otp,
      resetPasswordExpires: { $gt: Date.now() }
    }).select('+resetPasswordOTP +resetPasswordExpires');

    if (!user) {
      return res.status(400).json({
        status: 'fail',
        message: 'Invalid or expired OTP'
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

// Reset password - FIXED VERSION
// Reset password - Alternative solution using findOneAndUpdate
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

    // Hash the new password manually
    const hashedPassword = await bcrypt.hash(newPassword, 12);

    // Update the user directly without fetching the entire document
    const result = await User.findOneAndUpdate(
      {
        email,
        resetPasswordOTP: otp,
        resetPasswordExpires: { $gt: Date.now() }
      },
      {
        $set: {
          password: hashedPassword,
          resetPasswordOTP: null,
          resetPasswordExpires: null
        }
      },
      {
        new: true, // Return the updated document
        runValidators: false // Skip validation
      }
    );

    if (!result) {
      return res.status(400).json({
        status: 'fail',
        message: 'Invalid or expired OTP'
      });
    }

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

// Debug route to check user OTP status
router.get('/debug-user/:email', async (req, res) => {
  try {
    const { email } = req.params;
    const user = await User.findOne({ email }).select('+resetPasswordOTP +resetPasswordExpires');
    
    if (!user) {
      return res.status(404).json({
        status: 'fail',
        message: 'User not found'
      });
    }

    res.status(200).json({
      status: 'success',
      data: {
        user: {
          email: user.email,
          hasOTP: !!user.resetPasswordOTP,
          otp: user.resetPasswordOTP,
          expires: user.resetPasswordExpires,
          isExpired: user.resetPasswordExpires ? user.resetPasswordExpires < Date.now() : true,
          currentTime: new Date().toISOString()
        }
      }
    });
  } catch (err) {
    console.error('Debug user error:', err);
    res.status(500).json({
      status: 'error',
      message: 'Internal server error'
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

    const validProductKey = await ProductKey.findOne({ 
      key: productKey,
      isUsed: false 
    });

    if (!validProductKey) {
      return res.status(400).json({
        status: 'fail',
        message: 'Invalid or already used product key'
      });
    }

    const existingUser = await User.findOne({
      $or: [{ email }, { phoneNumber }]
    });

    if (existingUser) {
      return res.status(400).json({
        status: 'fail',
        message: 'User with this email or phone number already exists'
      });
    }

    const newUser = await User.create({
      fullName,
      phoneNumber,
      email,
      password,
      storeName,
      storeType,
      address,
      panVatNumber: panVatNumber || undefined,
      productKey
    });

    validProductKey.isUsed = true;
    validProductKey.usedAt = new Date();
    validProductKey.usedBy = newUser._id;
    await validProductKey.save();

    const token = signToken(newUser._id);

    res.status(201).json({
      status: 'success',
      token,
      data: { user: newUser }
    });
  } catch (err) {
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

    const user = await User.findOne({ email }).select('+password');
    
    if (!user) {
      return res.status(401).json({
        status: 'fail',
        message: 'Incorrect email or password'
      });
    }

    const isPasswordCorrect = await user.correctPassword(password);
    
    if (!isPasswordCorrect) {
      return res.status(401).json({
        status: 'fail',
        message: 'Incorrect email or password'
      });
    }

    const token = signToken(user._id);

    res.status(200).json({
      status: 'success',
      token,
      data: { user: { ...user.toObject(), password: undefined } }
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
    const user = await User.findById(decoded.id).select('+password');
    
    if (!user) {
      return res.status(404).json({
        status: 'fail',
        message: 'User not found'
      });
    }

    const isPasswordCorrect = await user.correctPassword(password);
    
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
    const user = await User.findById(decoded.id);

    if (!user) {
      return res.status(404).json({
        status: 'fail',
        message: 'User not found'
      });
    }

    res.status(200).json({
      status: 'success',
      data: { user }
    });
  } catch (err) {
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