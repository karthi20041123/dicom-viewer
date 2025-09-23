import express from 'express';
import User from '../models/User.js';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';

const router = express.Router();

// ---------------- Signup Route ----------------
router.post('/signup', async (req, res) => {
  try {
    const {
      username,
      email,
      password,
      role,
      firstName,
      lastName,
      avatarUrl,
      phone,
      department,
      dateOfBirth,
      gender,
      twoFactorEnabled
    } = req.body;

    // Validation
    if (!username || !email || !password) {
      return res.status(400).json({
        success: false,
        message: 'Username, email, and password are required.'
      });
    }

    // Check for existing user
    const existingUser = await User.findOne({ $or: [{ email }, { username }] });
    if (existingUser) {
      return res.status(400).json({
        success: false,
        message: 'Username or email already exists'
      });
    }

    // CREATE USER WITHOUT MANUAL HASHING - let the pre-save hook handle it
    const newUser = new User({
      username,
      email,
      password, // Don't hash here - the pre-save hook will do it
      role: role || 'doctor',
      twoFactorEnabled: !!twoFactorEnabled,
      profile: {
        firstName,
        lastName,
        avatarUrl,
        phone,
        department,
        dateOfBirth,
        gender
      }
    });

    await newUser.save();

    const token = jwt.sign(
      { id: newUser._id, email: newUser.email, role: newUser.role },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.status(201).json({
      success: true,
      message: 'Account created successfully!',
      token,
      user: {
        id: newUser._id,
        username: newUser.username,
        email: newUser.email,
        role: newUser.role,
        profile: newUser.profile
      }
    });
  } catch (error) {
    console.error('Signup error:', error);
    
    // Handle mongoose validation errors
    if (error.name === 'ValidationError') {
      const errors = Object.values(error.errors).map(err => ({
        path: err.path,
        msg: err.message
      }));
      return res.status(400).json({ 
        success: false, 
        message: 'Validation error',
        errors 
      });
    }
    
    res.status(500).json({ 
      success: false, 
      message: error.message || 'Server error' 
    });
  }
});

// ---------------- Login Route ----------------
router.post('/login', async (req, res) => {
  try {
    console.log('Login attempt:', { email: req.body.email, hasPassword: !!req.body.password });
    
    const { email, password } = req.body;

    // Validation
    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: 'Email and password are required.'
      });
    }

    // Find user
    const user = await User.findOne({ email });
    if (!user) {
      console.log('User not found for email:', email);
      return res.status(400).json({
        success: false,
        message: 'Invalid email or password'
      });
    }

    console.log('User found:', { id: user._id, email: user.email });

    // Compare password using the model method
    const isMatch = await user.comparePassword(password);
    
    if (!isMatch) {
      console.log('Password comparison failed');
      return res.status(400).json({
        success: false,
        message: 'Invalid email or password'
      });
    }

    console.log('Login successful for:', user.email);

    // Update last login
    user.lastLogin = new Date();
    await user.save();

    const token = jwt.sign(
      { id: user._id, email: user.email, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.json({
      success: true,
      message: 'Login successful',
      token,
      user: {
        id: user._id,
        username: user.username,
        email: user.email,
        role: user.role,
        profile: user.profile
      }
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ 
      success: false, 
      message: error.message || 'Server error' 
    });
  }
});

export default router;