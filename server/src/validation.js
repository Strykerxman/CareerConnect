const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function validateRegistration({ email, password, role, fullName }) {
  const errors = {};
  if (!email || !EMAIL_RE.test(email)) errors.email = 'Enter a valid email address.';
  if (!password || password.length < 8) errors.password = 'Password must be at least 8 characters.';
  else if (!/[A-Za-z]/.test(password) || !/\d/.test(password))
    errors.password = 'Password must contain at least one letter and one number.';
  if (!['job_seeker', 'recruiter'].includes(role)) errors.role = 'Choose job seeker or recruiter.';
  if (!fullName || !fullName.trim()) errors.fullName = 'Enter your full name.';
  return errors;
}

module.exports = { validateRegistration };
