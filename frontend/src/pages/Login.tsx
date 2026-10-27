import { useState, type SubmitEvent } from "react";
import { useNavigate } from "react-router-dom";
import "./Register.css"

const API = "http://localhost:8000";
function Login() {

  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  async function handleSubmit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("")
    const res = await fetch(`${API}/auth/login/`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
        });
    if (!res.ok) {
        setError("Invalid email or password");
        return;
    }
    const { access_token } = await res.json();
    localStorage.setItem("token", access_token);
    navigate("/workspace");
  }



  return (
    <div className="register-page">
      <form className="register-card register-form" onSubmit={handleSubmit}>
        <h1>Login</h1>

        <label htmlFor="email">Email</label>
        <input
          id="email"
          type="email"
          placeholder="Enter your email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          required
        />

        <label htmlFor="password">Password</label>
        <input
          id="password"
          type="password"
          placeholder="Enter your password"
          maxLength={72}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />
        {error && <p style={{ color: "red" }}>{error}</p>}

        <button type="submit">Login</button>

        <button style={{ marginTop: "16px" }}
        onClick={() => navigate("/register")}>
        Register
      </button>
      </form>
    </div>
  );
}

export default Login;