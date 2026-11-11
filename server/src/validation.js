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

const JOB_FIELDS = {
  title:        { max: 150,   required: true,  label: 'job title' },
  company:      { max: 150,   required: false, label: 'company name' },
  location:     { max: 150,   required: false, label: 'location' },
  type:         { max: 50,    required: false, label: 'job type' },
  category:     { max: 100,   required: false, label: 'category' },
  description:  { max: 10000, required: true,  label: 'description' },
  requirements: { max: 5000,  required: false, label: 'requirements' },
};

const JOB_STATUSES = ['open', 'closed'];

// Validates a job posting body. `partial` (PATCH) only checks fields that are present;
// otherwise (POST) title and description are required. `status` is optional and controls
// whether job seekers can see the posting. Other unknown fields are ignored, so clients
// can't set recruiter_id or created_at through this path.
function validateJobInput(body, { partial = false } = {}) {
  const errors = {};
  const values = {};
  const input = body && typeof body === 'object' && !Array.isArray(body) ? body : {};

  for (const [field, rule] of Object.entries(JOB_FIELDS)) {
    const raw = input[field];
    if (raw === undefined) {
      if (!partial && rule.required) errors[field] = `Enter the ${rule.label}.`;
      continue;
    }
    if (typeof raw !== 'string') { errors[field] = `The ${rule.label} must be text.`; continue; }
    const value = raw.trim();
    if (!value && (rule.required || (partial && field === 'company'))) {
      errors[field] = `Enter the ${rule.label}.`;
    } else if (value.length > rule.max) {
      errors[field] = `The ${rule.label} must be at most ${rule.max} characters.`;
    } else {
      values[field] = value;
    }
  }

  if (input.status !== undefined) {
    if (!JOB_STATUSES.includes(input.status)) errors.status = 'Status must be "open" or "closed".';
    else values.status = input.status;
  }
  return { errors, values };
}

module.exports = { validateRegistration, validateJobInput };