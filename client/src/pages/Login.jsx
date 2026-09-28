import { useState } from "react";
import { Link } from "react-router-dom";
import Field from "../components/Field";

function Login() {
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

  function handleSubmit(event) {
    event.preventDefault();

    const newErrors = {};

    if (!form.email.trim()) {
      newErrors.email = "Please enter your email address.";
    }

    if (!form.password) {
      newErrors.password = "Please enter your password.";
    }

    setErrors(newErrors);

    if (Object.keys(newErrors).length > 0) {
      return;
    }

    console.log("Login form:", form);
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

        <form onSubmit={handleSubmit}>
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

          <button className="btn btn-primary auth-submit" type="submit">
            Sign in
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