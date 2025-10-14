import React, { useState } from 'react';
import { Eye, EyeOff, User, Mail, Lock, Phone, Calendar, Users, X } from 'lucide-react';
import { useNavigate } from "react-router-dom";
import './styles/Signup.css';

const API_BASE = "http://localhost:5000";

const SignupForm = ({ onClose, onLoginClick, onSignup }) => {
  const [formData, setFormData] = useState({
    username: '',
    firstName: '',
    lastName: '',
    email: '',
    password: '',
    confirmPassword: '',
    phone: '',
    dateOfBirth: '',
    gender: 'prefer-not-to-say',
    avatarUrl: '',
    department: '',
    role: 'doctor',
    twoFactorEnabled: false,
  });

  const [showPassword, setShowPassword] = useState(false);
  const [errors, setErrors] = useState({});
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState({ type: '', text: '' });
  const navigate = useNavigate();

  // Handle input changes
  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value,
    }));

    if (errors[name]) {
      setErrors((prev) => ({ ...prev, [name]: '' }));
    }
  };

  // Validate form (client-side)
  const validateForm = () => {
    const newErrors = {};

    if (!formData.username.trim()) newErrors.username = 'Username is required';
    else if (formData.username.length < 3) newErrors.username = 'Username must be at least 3 characters';
    else if (!/^[a-zA-Z0-9_]+$/.test(formData.username)) newErrors.username = 'Username can only contain letters, numbers, and underscores';

    if (!formData.firstName.trim()) newErrors.firstName = 'First name is required';
    else if (formData.firstName.trim().length < 2) newErrors.firstName = 'First name must be at least 2 characters';

    if (!formData.lastName.trim()) newErrors.lastName = 'Last name is required';
    else if (formData.lastName.trim().length < 2) newErrors.lastName = 'Last name must be at least 2 characters';

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!formData.email.trim()) newErrors.email = 'Email is required';
    else if (!emailRegex.test(formData.email)) newErrors.email = 'Please enter a valid email address';

    if (!formData.password) newErrors.password = 'Password is required';
    else if (formData.password.length < 6) newErrors.password = 'Password must be at least 6 characters';

    if (!formData.confirmPassword) newErrors.confirmPassword = 'Please confirm your password';
    else if (formData.password !== formData.confirmPassword) newErrors.confirmPassword = 'Passwords do not match';

    if (!formData.phone.trim()) newErrors.phone = 'Phone number is required';
    else if (!/^\+?\d{10,15}$/.test(formData.phone.trim())) newErrors.phone = 'Please enter a valid phone number (10-15 digits)';

    if (!formData.dateOfBirth) newErrors.dateOfBirth = 'Date of birth is required';
    else {
      const dob = new Date(formData.dateOfBirth);
      const today = new Date();
      if (dob > today) newErrors.dateOfBirth = 'Date of birth cannot be in the future';
      else if (today.getFullYear() - dob.getFullYear() < 18) newErrors.dateOfBirth = 'You must be at least 18 years old';
    }

    if (!formData.gender) newErrors.gender = 'Gender is required';

    if (!formData.department.trim()) newErrors.department = 'Department is required';

    if (!formData.role) newErrors.role = 'Role is required';

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  // Handle form submission
  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!validateForm()) return;

    setLoading(true);
    setMessage({ type: '', text: '' });

    try {
      const { confirmPassword, ...userData } = formData;

      const response = await fetch(`${API_BASE}/api/auth/signup`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify(userData),
      });

      let data;
      const contentType = response.headers.get("content-type");
      if (contentType && contentType.includes("application/json")) {
        data = await response.json();
      } else {
        const textResponse = await response.text();
        console.error("Non-JSON response:", textResponse);
        throw new Error("Server returned non-JSON response");
      }

      console.log("Signup Response:", data);

      if (response.ok && data.success) {
        setMessage({ type: 'success', text: 'Account created successfully! Redirecting to login...' });

        if (data.token) {
          localStorage.setItem('authToken', data.token);
          localStorage.setItem('user', JSON.stringify(data.user));
          localStorage.setItem('tokenExpires', Date.now() + 30 * 24 * 60 * 60 * 1000); // 30 days
        }

        // Reset form
        setFormData({
          username: '',
          firstName: '',
          lastName: '',
          email: '',
          password: '',
          confirmPassword: '',
          phone: '',
          dateOfBirth: '',
          gender: 'prefer-not-to-say',
          avatarUrl: '',
          department: '',
          role: 'doctor',
          twoFactorEnabled: false,
        });

        // Trigger onSignup and redirect
        setTimeout(() => {
          if (typeof onSignup === "function") {
            onSignup(data.user);
          }
          if (typeof onClose === "function") {
            onClose();
          }
          navigate("/login"); // Redirect to login page
        }, 1000);
      } else {
        let errorMessage = data.message || 'Registration failed. Please try again.';
        if (response.status === 400) errorMessage = 'Invalid input. Please check your details.';
        else if (response.status === 409) errorMessage = 'Email or username already exists.';
        else if (response.status === 500) errorMessage = 'Server error. Please try again later.';

        console.error("Signup failed:", errorMessage);
        setMessage({ type: 'error', text: errorMessage });

        if (Array.isArray(data.errors)) {
          const backendErrors = {};
          data.errors.forEach((error) => {
            if (error.path) backendErrors[error.path] = error.msg;
          });
          setErrors((prev) => ({ ...prev, ...backendErrors }));
        }
      }
    } catch (error) {
      console.error("Signup error:", error);
      let errorMessage = 'Network error. Please check your connection and try again.';
      if (error.message.includes("Failed to fetch")) {
        errorMessage = "Cannot connect to server. Please check if the server is running.";
      } else if (error.message.includes("non-JSON")) {
        errorMessage = "Server error. Please try again later.";
      }
      setMessage({ type: 'error', text: errorMessage });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="signup-container">
      <div className="form-card">
        {/* Signup Header */}
        <div className="signup-header">
          <h1 className="signup-title">Register</h1>
          <button
            aria-label="Close signup dialog"
            onClick={onClose}
            className="close-btn"
            type="button"
          >
            <X size={20} />
          </button>
        </div>

        {/* Message */}
        {message.text && (
          <div
            className={`message ${
              message.type === 'success' ? 'message-success' : 'message-error'
            }`}
            role="status"
          >
            {message.text}
          </div>
        )}

        <form onSubmit={handleSubmit} noValidate>
          <div className="form-fields">
            <div className="field-row">
              {/* Username */}
              <div className="field">
                <label className="label" htmlFor="username">Username</label>
                <div className="input-with-icon">
                  <User className="icon" aria-hidden="true" />
                  <input
                    type="text"
                    name="username"
                    id="username"
                    value={formData.username}
                    onChange={handleChange}
                    className={`input ${errors.username ? 'input-error' : ''}`}
                    placeholder="johndoe"
                    autoComplete="username"
                    disabled={loading}
                    required
                  />
                </div>
                {errors.username && <p className="error-text">{errors.username}</p>}
              </div>

              {/* Email Address */}
              <div className="field">
                <label className="label" htmlFor="email">Email Address</label>
                <div className="input-with-icon">
                  <Mail className="icon" />
                  <input
                    type="email"
                    name="email"
                    id="email"
                    value={formData.email}
                    onChange={handleChange}
                    className={`input ${errors.email ? 'input-error' : ''}`}
                    placeholder="e.g. john@yourdomain.com"
                    autoComplete="email"
                    disabled={loading}
                    required
                  />
                </div>
                {errors.email && <p className="error-text">{errors.email}</p>}
              </div>
            </div>

            <div className="field-row">
              {/* First Name */}
              <div className="field">
                <label className="label" htmlFor="firstName">First Name</label>
                <div className="input-with-icon">
                  <User className="icon" aria-hidden="true" />
                  <input
                    type="text"
                    name="firstName"
                    id="firstName"
                    value={formData.firstName}
                    onChange={handleChange}
                    className={`input ${errors.firstName ? 'input-error' : ''}`}
                    placeholder="e.g. John"
                    autoComplete="given-name"
                    disabled={loading}
                    required
                  />
                </div>
                {errors.firstName && <p className="error-text">{errors.firstName}</p>}
              </div>

              {/* Last Name */}
              <div className="field">
                <label className="label" htmlFor="lastName">Last Name</label>
                <div className="input-with-icon">
                  <User className="icon" aria-hidden="true" />
                  <input
                    type="text"
                    name="lastName"
                    id="lastName"
                    value={formData.lastName}
                    onChange={handleChange}
                    className={`input ${errors.lastName ? 'input-error' : ''}`}
                    placeholder="e.g. Smith"
                    autoComplete="family-name"
                    disabled={loading}
                    required
                  />
                </div>
                {errors.lastName && <p className="error-text">{errors.lastName}</p>}
              </div>
            </div>

            <div className="field-row">
              {/* Password */}
              <div className="field">
                <label className="label" htmlFor="password">Password</label>
                <div className="input-with-icon">
                  <Lock className="icon" />
                  <input
                    type={showPassword ? 'text' : 'password'}
                    name="password"
                    id="password"
                    value={formData.password}
                    onChange={handleChange}
                    className={`input ${errors.password ? 'input-error' : ''}`}
                    placeholder="Your Password"
                    autoComplete="new-password"
                    disabled={loading}
                    required
                  />
                  {showPassword ? (
                    <EyeOff size={20} className="toggle-icon" onClick={() => setShowPassword(false)} />
                  ) : (
                    <Eye size={20} className="toggle-icon" onClick={() => setShowPassword(true)} />
                  )}
                </div>
                {errors.password && <p className="error-text">{errors.password}</p>}
              </div>

              {/* Confirm Password */}
              <div className="field">
                <label className="label" htmlFor="confirmPassword">Re-type Password</label>
                <div className="input-with-icon">
                  <Lock className="icon" />
                  <input
                    type={showPassword ? 'text' : 'password'}
                    name="confirmPassword"
                    id="confirmPassword"
                    value={formData.confirmPassword}
                    onChange={handleChange}
                    className={`input ${errors.confirmPassword ? 'input-error' : ''}`}
                    placeholder="Your Password"
                    autoComplete="new-password"
                    disabled={loading}
                    required
                  />
                  {showPassword ? (
                    <EyeOff size={20} className="toggle-icon" onClick={() => setShowPassword(false)} />
                  ) : (
                    <Eye size={20} className="toggle-icon" onClick={() => setShowPassword(true)} />
                  )}
                </div>
                {errors.confirmPassword && <p className="error-text">{errors.confirmPassword}</p>}
              </div>
            </div>

            <div className="field-row">
              {/* Phone Number */}
              <div className="field">
                <label className="label" htmlFor="phone">Phone Number</label>
                <div className="input-with-icon">
                  <Phone className="icon" />
                  <input
                    type="tel"
                    name="phone"
                    id="phone"
                    value={formData.phone}
                    onChange={handleChange}
                    className={`input ${errors.phone ? 'input-error' : ''}`}
                    placeholder="+00 000 000 0000"
                    autoComplete="tel"
                    disabled={loading}
                    required
                  />
                </div>
                {errors.phone && <p className="error-text">{errors.phone}</p>}
              </div>

              {/* Date of Birth */}
              <div className="field">
                <label className="label" htmlFor="dateOfBirth">Date of Birth</label>
                <div className="input-with-icon">
                  <Calendar className="icon" />
                  <input
                    type="date"
                    name="dateOfBirth"
                    id="dateOfBirth"
                    value={formData.dateOfBirth}
                    onChange={handleChange}
                    max={new Date().toISOString().split('T')[0]}
                    className={`input ${errors.dateOfBirth ? 'input-error' : ''}`}
                    disabled={loading}
                    required
                  />
                </div>
                {errors.dateOfBirth && <p className="error-text">{errors.dateOfBirth}</p>}
              </div>
            </div>

            {/* Gender */}
            <div className="field">
              <label className="label" htmlFor="gender">Gender</label>
              <div className="select-wrapper">
                <select
                  name="gender"
                  id="gender"
                  value={formData.gender}
                  onChange={handleChange}
                  className={`input ${errors.gender ? 'input-error' : ''}`}
                  disabled={loading}
                  required
                >
                  <option value="">Select</option>
                  <option value="male">Male</option>
                  <option value="female">Female</option>
                  <option value="prefer-not-to-say">Prefer not to say</option>
                </select>
              </div>
              {errors.gender && <p className="error-text">{errors.gender}</p>}
            </div>

            <div className="field-row">
              {/* Department */}
              <div className="field">
                <label className="label" htmlFor="department">Department</label>
                <div className="input-with-icon">
                  <Users className="icon" />
                  <input
                    type="text"
                    name="department"
                    id="department"
                    value={formData.department}
                    onChange={handleChange}
                    className={`input ${errors.department ? 'input-error' : ''}`}
                    placeholder="Enter Department"
                    autoComplete="organization"
                    disabled={loading}
                    required
                  />
                </div>
                {errors.department && <p className="error-text">{errors.department}</p>}
              </div>

              {/* Role */}
              <div className="field">
                <label className="label" htmlFor="role">Role</label>
                <div className="select-wrapper">
                  <select
                    name="role"
                    id="role"
                    value={formData.role}
                    onChange={handleChange}
                    className={`input ${errors.role ? 'input-error' : ''}`}
                    disabled={loading}
                    required
                  >
                    <option value="doctor">Doctor</option>
                    <option value="admin">Admin</option>
                    <option value="technician">Technician</option>
                    <option value="viewer">Viewer</option>
                  </select>
                </div>
                {errors.role && <p className="error-text">{errors.role}</p>}
              </div>
            </div>

            {/* Two-Factor Authentication */}
            <div className="field">
              <div className="checkbox-container">
                <input
                  type="checkbox"
                  name="twoFactorEnabled"
                  id="twoFactorEnabled"
                  checked={formData.twoFactorEnabled}
                  onChange={handleChange}
                  className="checkbox"
                  disabled={loading}
                />
                <label className="checkbox-label" htmlFor="twoFactorEnabled">
                  Enable Two-Factor Authentication
                </label>
              </div>
            </div>

            {/* Submit Button */}
            <button
              type="submit"
              disabled={loading}
              className="submit-button"
              aria-busy={loading}
            >
              {loading ? 'Creating Account...' : 'Register'}
            </button>
          </div>
        </form>

        {/* Login Link */}
        <p className="login-link">
          Already have an account?{' '}
          <button
            type="button"
            onClick={onLoginClick}
            className="login-button"
            disabled={loading}
            aria-label="Navigate to login form"
          >
            Sign in
          </button>
        </p>
      </div>
    </div>
  );
};

export default SignupForm;