import React, { useState } from "react";
import { Eye, EyeOff, Mail, Lock, LogIn, X } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { AnalyticsTracker } from './AnalyticsDashboard'; // ← ADDED
import "./styles/Login.css";

const API_BASE = "http://localhost:5000";

const LoginForm = ({ onClose, onSignupClick, onLoginSuccess }) => {
  const [formData, setFormData] = useState({ email: "", password: "" });
  const [rememberOption, setRememberOption] = useState("session"); // Default to session
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState({ type: "", text: "" });
  const [errors, setErrors] = useState({});
  const [showPassword, setShowPassword] = useState(false);
  const navigate = useNavigate();

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: value,
    }));

    if (errors[name]) {
      setErrors((prev) => ({
        ...prev,
        [name]: "",
      }));
    }
  };

  const handleRememberChange = (e) => {
    setRememberOption(e.target.value);
  };

  const validateForm = () => {
    const newErrors = {};
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    if (!formData.email.trim()) {
      newErrors.email = "Email is required";
    } else if (!emailRegex.test(formData.email.trim())) {
      newErrors.email = "Please enter a valid email address";
    }

    if (!formData.password) {
      newErrors.password = "Password is required";
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!validateForm()) return;

    setLoading(true);
    setMessage({ type: "", text: "" });

    const payload = {
      email: formData.email.trim(),
      password: formData.password,
    };

    console.log("Attempting login with:", { email: payload.email, hasPassword: !!payload.password });

    try {
      const response = await fetch(`${API_BASE}/api/auth/login`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify(payload),
      });

      console.log("Response status:", response.status);
      console.log("Response headers:", Object.fromEntries(response.headers.entries()));

      let data;
      const contentType = response.headers.get("content-type");

      if (contentType && contentType.includes("application/json")) {
        data = await response.json();
      } else {
        const textResponse = await response.text();
        console.error("Non-JSON response:", textResponse);
        throw new Error("Server returned non-JSON response");
      }

      console.log("Login response:", data);

      if (response.ok && data?.success) {
        const displayName =
          data.user?.profile?.firstName ||
          data.user?.username ||
          data.user?.email?.split("@")?.[0] ||
          "User";

        setMessage({
          type: "success",
          text: `Welcome back, ${displayName}!`,
        });

        if (data.token) {
          // Clear previous storage
          localStorage.removeItem("authToken");
          localStorage.removeItem("user");
          sessionStorage.removeItem("authToken");
          sessionStorage.removeItem("user");

          // Store based on remember option
          const storage = rememberOption === "session" ? sessionStorage : localStorage;
          storage.setItem("authToken", data.token);
          storage.setItem("user", JSON.stringify(data.user));

          if (rememberOption !== "session") {
            const expiresIn = rememberOption === "7days" ? 7 * 24 * 60 * 60 * 1000 : 30 * 24 * 60 * 60 * 1000;
            storage.setItem("tokenExpires", Date.now() + expiresIn);
          }
        }

        // Send login notification to admin and user
        try {
          const notifyResponse = await fetch(`${API_BASE}/api/auth/notify-login`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Accept: "application/json",
            },
            body: JSON.stringify({ email: payload.email }),
          });

          if (!notifyResponse.ok) {
            const notifyData = await notifyResponse.json();
            console.warn("Failed to send login notification:", notifyData.message || notifyResponse.status);
            setMessage({
              type: "warning",
              text: "Login successful, but failed to send notification emails.",
            });
          } else {
            console.log("Login notification sent successfully");
          }
        } catch (notifyError) {
          console.error("Error sending login notification:", notifyError);
          setMessage({
            type: "warning",
            text: "Login successful, but failed to send notification emails.",
          });
        }

        setFormData({ email: "", password: "" });

        // ← ANALYTICS TRACKING ADDED HERE
        AnalyticsTracker.trackLogin();
        AnalyticsTracker.trackSessionStart();

        setTimeout(() => {
          if (typeof onClose === "function") {
            onClose();
          }
          if (typeof onLoginSuccess === "function") {
            onLoginSuccess(data.user);
          }
          // Removed navigate("/dashboard") to stay on current page
        }, 700);
      } else {
        let errorMessage = "Login failed. Please try again.";

        if (data?.message) {
          errorMessage = data.message;
        } else if (response.status === 400) {
          errorMessage = "Invalid email or password.";
        } else if (response.status === 500) {
          errorMessage = "Server error. Please try again later.";
        }

        console.error("Login failed:", errorMessage);
        setMessage({ type: "error", text: errorMessage });

        if (Array.isArray(data?.errors)) {
          const backendErrors = {};
          data.errors.forEach((err) => {
            if (err.path) backendErrors[err.path] = err.msg;
          });
          setErrors((prev) => ({ ...prev, ...backendErrors }));
        }
      }
    } catch (error) {
      console.error("Network error during login:", error);

      let errorMessage = "Network error. Please check your connection.";

      if (error.message.includes("Failed to fetch")) {
        errorMessage = "Cannot connect to server. Please check if the server is running.";
      } else if (error.message.includes("non-JSON")) {
        errorMessage = "Server error. Please try again later.";
      }

      setMessage({
        type: "error",
        text: errorMessage,
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="modal-overlay">
      <div className="login-modal">
        <div className="login-header">
          <h2>Welcome Back</h2>
          <button
            aria-label="Close login dialog"
            onClick={onClose}
            className="close-btn"
            type="button"
          >
            <X size={20} />
          </button>
        </div>

        <form onSubmit={handleSubmit} noValidate>
          <div className="field">
            <label htmlFor="email">Email Address</label>
            <div className="input-with-icon">
              <Mail size={18} />
              <input
                id="email"
                name="email"
                type="email"
                placeholder="you@example.com"
                value={formData.email}
                onChange={handleChange}
                autoComplete="email"
                disabled={loading}
                required
              />
            </div>
            {errors.email && <span className="error-text">{errors.email}</span>}
          </div>

          <div className="field">
            <label htmlFor="password">Password</label>
            <div className="input-with-icon">
              <Lock size={18} />
              <input
                id="password"
                name="password"
                type={showPassword ? "text" : "password"}
                placeholder="••••••••"
                value={formData.password}
                onChange={handleChange}
                autoComplete="current-password"
                disabled={loading}
                required
              />
              {showPassword ? (
                <EyeOff
                  size={18}
                  onClick={() => setShowPassword(false)}
                  className="toggle-icon"
                />
              ) : (
                <Eye
                  size={18}
                  onClick={() => setShowPassword(true)}
                  className="toggle-icon"
                />
              )}
            </div>
            {errors.password && (
              <span className="error-text">{errors.password}</span>
            )}
          </div>

          <div className="row-between">
                       <div className="select-container">
              <label htmlFor="rememberOption">Stay Signed In</label>
              <select
                id="rememberOption"
                value={rememberOption}
                onChange={handleRememberChange}
                disabled={loading}
                className="remember-select"
              >
                <option value="session">Session Only</option>
                <option value="7days">7 Days</option>
                <option value="30days">30 Days</option>
              </select>
            </div>

            <button
              type="button"
              className="link-btn"
              onClick={() =>
                setMessage({
                  type: "info",
                  text: "Password reset coming soon.",
                })
              }
              disabled={loading}
            >
              Forgot password?
            </button>
          </div>

          {message.text && (
            <div
              className={`alert ${
                message.type === "error"
                  ? "alert-error"
                  : message.type === "success"
                    ? "alert-success"
                    : message.type === "warning"
                      ? "alert-warning"
                      : "alert-info"
              }`}
              role="status"
            >
              {message.text}
            </div>
          )}

          <button
            type="submit"
            className="primary-btn"
            disabled={loading}
            aria-busy={loading}
          >
            <LogIn size={18} />
            <span>{loading ? "Signing In..." : "Sign In"}</span>
          </button>
        </form>

        <div className="footer">
          <span>Don't have an account?</span>
          <button
            type="button"
            className="link-btn"
            onClick={onSignupClick}
            disabled={loading}
            aria-label="Navigate to sign up form"
          >
            Sign up
          </button>
        </div>
      </div>
    </div>
  );
};

export default LoginForm;