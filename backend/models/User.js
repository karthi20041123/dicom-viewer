import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';

const profileSchema = new mongoose.Schema({
  firstName: { type: String, required: true },
  lastName: { type: String, required: true },
  phone: { type: String },
  department: { type: String },
  dateOfBirth: { type: Date },
  gender: { type: String, default: 'prefer-not-to-say' },
  avatarUrl: { type: String },
});

const userSchema = new mongoose.Schema({
  username: { type: String, required: true, unique: true },
  email: { type: String, required: true, unique: true },
  password: {
    type: String,
    required: [function() { return !this.googleId; }, 'Password is required']
  },
  googleId: { type: String },
  role: { type: String, default: 'doctor' },
  profile: profileSchema,
  twoFactorEnabled: { type: Boolean, default: false },
  twoFactorSecret: { type: String },
  isActive: { type: Boolean, default: true },
  lastLogin: { type: Date },
});

userSchema.pre('save', async function(next) {
  if (this.isModified('password') && this.password) {
    this.password = await bcrypt.hash(this.password, 10);
  }
  next();
});

userSchema.methods.comparePassword = async function(candidatePassword) {
  if (!this.password) return false;
  return await bcrypt.compare(candidatePassword, this.password);
};

const User = mongoose.model('User', userSchema);

export default User;