
import { useState } from "react";
import "./Register.css";
import { Link, useNavigate } from "react-router-dom";

function Register() {
  const navigate = useNavigate();
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  async function handleSubmit(
  event: React.FormEvent<HTMLFormElement>
) {
  event.preventDefault();

  setError("");
  setSuccess("");

  if (username.trim().length < 3) {
    setError("Username must be at least 3 characters.");
    return;
  }

  if (password.length < 8) {
    setError("Password must be at least 8 characters.");
    return;
  }

  if (password !== confirmPassword) {
    setError("Passwords do not match.");
    return;
  }

  try {
    const response = await fetch(
      "http://localhost:8000/auth/register/",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          user_name: username.trim(),
          email: email.trim(),
          password: password,
        }),
      }
    );

    const data = await response.json();

    if (!response.ok) {
      setError(
        data.detail || "Registration failed. Please try again."
      );
      return;
    }

    setSuccess("Account created successfully! Time to login...");
    setTimeout(() => navigate("/login"), 1200);
  } catch (error) {
    console.error("Registration error:", error);
    setError(
      "Could not connect to the server. Check that the backend is running."
    );
  }
}

  return (
    <main className="register-page">
      <section className="register-card">
        <Link to="/" className="register-brand">
          <span className="brand-icon">✎</span>
          <span>Sketchat</span>
        </Link>

        <div className="register-heading">
          <h1>Create your account</h1>
          <p>Make something. Share something. Connect.</p>
        </div>

        <form className="register-form" onSubmit={handleSubmit}>
          <label htmlFor="username">Username</label>
          <input
            id="username"
            type="text"
            placeholder="Choose a username"
            autoComplete="username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            minLength={3}
            maxLength={30}
            required
          />

          <label htmlFor="email">Email address</label>
          <input
            id="email"
            type="email"
            placeholder="you@example.com"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />

          <label htmlFor="password">Password</label>
          <input
            id="password"
            type="password"
            placeholder="At least 8 characters"
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            minLength={8}
            required
          />

          <label htmlFor="confirmPassword">Confirm password</label>
          <input
            id="confirmPassword"
            type="password"
            placeholder="Enter your password again"
            autoComplete="new-password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            required
          />

          {error && (
            <p className="register-message error" role="alert">
              {error}
            </p>
          )}

          {success && (
            <p className="register-message success" role="status">
              {success}
            </p>
          )}

          <button type="submit" className="register-submit">
            Create Account
          </button>
        </form>

        <p className="register-footer">
          Already have an account? <Link to="/login">Log in</Link>
        </p>

        <p className="register-terms">
          By creating an account, you agree to use Sketchat responsibly.
        </p>
      </section>
    </main>
  );
}

export default Register;
