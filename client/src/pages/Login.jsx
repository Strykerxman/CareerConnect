import { useState } from "react";

import Field from "../components/Field";
import { Link, useNavigate } from "react-router-dom";
const API_URL = import.meta.env.VITE_API_URL || "http://localhost:4000";
function Login() {
  const navigate = useNavigate();
  const [serverError, setServerError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState({
    email: "",
    password: "",
  });

  const [errors, setErrors] = useState({});

  function handleChange(event) {
    const { name, value } = event.target;

    setForm((prev) => ({
      ...prev,
      [name]: value,
    }));
  }

  async function handleSubmit(event) {
  event.preventDefault();

  const newErrors = {};

  if (!form.email.trim()) {
    newErrors.email = "Please enter your email address.";
  }

  if (!form.password) {
    newErrors.password = "Please enter your password.";
  }

  setErrors(newErrors);
  setServerError("");

  if (Object.keys(newErrors).length > 0) {
    return;
  }

  try {
    setSubmitting(true);

    const response = await fetch(`${API_URL}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });

    const data = await response.json();

    if (!response.ok) {
      setServerError(data.error || "Unable to sign in.");
      return;
    }

    localStorage.setItem("token", data.token);
    localStorage.setItem("user", JSON.stringify(data.user));

    navigate("/profile", { replace: true });
  } catch {
    setServerError(
      "Cannot reach the server. Make sure the backend is running."
    );
  } finally {
    setSubmitting(false);
  }
}
  return (
    <main className="auth-page">
      <section className="auth-card">
        <div className="auth-brand">
          Career<span>Connect</span>
        </div>

        <div className="auth-header">
          <h1>Welcome back</h1>
          <p>
            Sign in to continue managing your CareerConnect account.
          </p>
        </div>

        <form className="auth-form" onSubmit={handleSubmit}>
          <Field
            label="Email address"
            name="email"
            type="email"
            value={form.email}
            onChange={handleChange}
            error={errors.email}
            placeholder="name@example.com"
          />

          <Field
            label="Password"
            name="password"
            type="password"
            value={form.password}
            onChange={handleChange}
            error={errors.password}
            placeholder="Enter your password"
          />
  {serverError && (
    <div className="banner error" role="alert">
      {serverError}
     </div>
      )}
          <button
    className="button primary auth-submit"
      type="submit"
      disabled={submitting}
            >
        {submitting ? "Signing in..." : "Sign in"}
        </button>
        </form>

        <p className="auth-footer">
          Don&apos;t have an account? <Link to="/register">Create one</Link>
        </p>
      </section>
    </main>
  );
}

export default Login;