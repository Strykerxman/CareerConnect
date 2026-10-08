import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import Field from "../components/Field";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:4000";

function Register() {
  const navigate = useNavigate();
  const [form, setForm] = useState({
    name: "",
    email: "",
    password: "",
    role: "job_seeker",
  });

  const [errors, setErrors] = useState({});
  const [serverError, setServerError] = useState("");
  const [submitting, setSubmitting] = useState(false);

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

    if (!form.name.trim()) {
      newErrors.name = "Please enter your full name.";
    }

    if (!form.email.trim()) {
      newErrors.email = "Please enter your email address.";
    }

    if (form.password.length < 8) {
      newErrors.password = "Password must be at least 8 characters.";
    }

    setErrors(newErrors);
    setServerError("");

    if (Object.keys(newErrors).length > 0) {
      return;
    }

    try {
      setSubmitting(true);

      const response = await fetch(`${API_URL}/api/auth/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fullName: form.name,
          email: form.email,
          password: form.password,
          role: form.role,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        if (data.errors) {
          setErrors({
            ...data.errors,
            name: data.errors.fullName,
          });
        } else {
          setServerError(data.error || "Unable to create your account.");
        }
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
      <div className="auth-container">
        <div className="auth-brand">
          CareerConnect
        </div>

        <section className="auth-card">
          <div className="auth-header">
            <h1>Create your account</h1>
            <p>
              Join CareerConnect to manage your profile, resumes,
              and job applications in one place.
            </p>
          </div>

          <form className="auth-form" onSubmit={handleSubmit}>
            {serverError && (
              <div className="banner error" role="alert">
                {serverError}
              </div>
            )}

            <Field
              label="Full name"
              name="name"
              value={form.name}
              onChange={handleChange}
              error={errors.name}
              placeholder="Enter your full name"
            />

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
              placeholder="At least 8 characters"
            />

            <div className="auth-role-section">
              <span className="auth-label">Account type</span>

              <div className="role-options">
                <label className="role-option">
                  <input
                    type="radio"
                    name="role"
                    value="job_seeker"
                    checked={form.role === "job_seeker"}
                    onChange={handleChange}
                  />

                  <div className="role-option-content">
                    <strong>Job seeker</strong>
                    <span>Find jobs and manage applications</span>
                  </div>
                </label>

                <label className="role-option">
                  <input
                    type="radio"
                    name="role"
                    value="recruiter"
                    checked={form.role === "recruiter"}
                    onChange={handleChange}
                  />

                  <div className="role-option-content">
                    <strong>Recruiter</strong>
                    <span>Post jobs and manage candidates</span>
                  </div>
                </label>
              </div>
            </div>

            <button
              className="button primary auth-submit"
              type="submit"
              disabled={submitting}
            >
              {submitting ? "Creating account..." : "Create account"}
            </button>
          </form>

          <p className="auth-footer">
            Already have an account?{" "}
            <Link to="/login">Sign in</Link>
          </p>
        </section>
      </div>
    </main>
  );
}

export default Register;
