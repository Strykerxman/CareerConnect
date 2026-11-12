import React, { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { getCompanyName, getMyJob, createJob, updateJob } from '../recruiterJobsApi';

// Keep in sync with JOB_FIELDS in server/src/validation.js.
const LIMITS = {
  title: 150,
  company: 150,
  location: 150,
  type: 50,
  category: 100,
  description: 10000,
  requirements: 5000,
};
const EMPTY_FORM = {
  title: '', company: '', location: '', type: '', category: '', description: '', requirements: '',
};
const FIELD_ORDER = Object.keys(EMPTY_FORM);
const AVAILABILITY_OPTIONS = [
  {
    value: 'open',
    label: 'Open',
    help: 'Visible to job seekers. They can find, save, and apply to it.',
  },
  {
    value: 'closed',
    label: 'Closed',
    help: 'Hidden from job seekers and not accepting applications. Only you can see it.',
  },
];
const TYPE_SUGGESTIONS = ['Full-time', 'Part-time', 'Contract', 'Internship', 'Temporary'];

function toForm(job) {
  return Object.fromEntries(FIELD_ORDER.map(name => [name, job[name] ?? '']));
}

function validate(values) {
  const errors = {};
  if (!values.title) errors.title = 'Enter the job title.';
  if (!values.company) errors.company = 'Enter the company name.';
  if (!values.description) errors.description = 'Enter the job description.';
  return errors;
}

function focusFirstError(errors) {
  const first = FIELD_ORDER.find(name => errors[name]);
  if (first) document.getElementById(first)?.focus();
}

function FormField({
  label, name, value, onChange, error, as: Control = 'input',
  required = false, help, fullWidth = false, ...controlProps
}) {
  const describedBy = [error && `${name}-error`, help && `${name}-help`].filter(Boolean).join(' ');
  const limit = LIMITS[name];

  return (
    <div className={fullWidth ? 'form-group full-width' : 'form-group'}>
      <div className="label-row">
        <label htmlFor={name}>
          {label}
          {required && <span className="required-mark" aria-hidden="true"> *</span>}
        </label>
        {Control === 'textarea' && (
          <span className={value.length >= limit ? 'character-count limit' : 'character-count'}>
            {value.length}/{limit}
          </span>
        )}
      </div>
      <Control
        id={name}
        name={name}
        value={value}
        onChange={onChange}
        maxLength={limit}
        aria-required={required || undefined}
        aria-invalid={error ? 'true' : undefined}
        aria-describedby={describedBy || undefined}
        {...controlProps}
      />
      {help && <span id={`${name}-help`} className="field-help">{help}</span>}
      {error && <div id={`${name}-error`} className="field-error">{error}</div>}
    </div>
  );
}

// One form for both publishing (/recruiter/jobs/new) and editing
// (/recruiter/jobs/:id/edit) a posting.
function JobForm() {
  const { id } = useParams();
  const isEdit = id !== undefined;
  const navigate = useNavigate();

  const [form, setForm] = useState(EMPTY_FORM);
  const [status, setStatus] = useState('open');
  const [errors, setErrors] = useState({});
  const [banner, setBanner] = useState('');
  const [loading, setLoading] = useState(isEdit);
  const [loadError, setLoadError] = useState(null);
  const [saving, setSaving] = useState(false);

  // Returns true when the session is gone and the user was sent to sign in.
  function handledSessionExpiry(error) {
    if (error?.status !== 401) return false;
    navigate('/login', { replace: true });
    return true;
  }

  // Edit mode: load the posting being edited.
  useEffect(() => {
    if (!isEdit) return undefined;
    const controller = new AbortController();
    setLoading(true);
    setLoadError(null);

    getMyJob(id, { signal: controller.signal })
      .then(({ job }) => {
        setForm(toForm(job));
        setStatus(job.status);
      })
      .catch(error => {
        if (controller.signal.aborted) return;
        if (handledSessionExpiry(error)) return;
        setLoadError({
          notFound: error.status === 404 || error.status === 400,
          message: error.message,
        });
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });

    return () => controller.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, isEdit]);

  // Create mode: pre-fill the company from the recruiter's profile.
  useEffect(() => {
    if (isEdit) return undefined;
    const controller = new AbortController();
    getCompanyName({ signal: controller.signal })
      .then(name => {
        if (name) setForm(previous => (previous.company ? previous : { ...previous, company: name }));
      })
      .catch(() => {}); // Pre-fill is a convenience; the field can be typed by hand.
    return () => controller.abort();
  }, [isEdit]);

  function handleChange(event) {
    const { name, value } = event.target;
    setForm(previous => ({ ...previous, [name]: value }));
    setErrors(previous => (previous[name] ? { ...previous, [name]: undefined } : previous));
  }

  function handleStatusChange(event) {
    setStatus(event.target.value);
    setErrors(previous => (previous.status ? { ...previous, status: undefined } : previous));
  }

  function successMessage() {
    if (isEdit) {
      return status === 'open'
        ? 'Changes saved.'
        : 'Changes saved. This posting is hidden from job seekers.';
    }
    return status === 'open'
      ? 'Job posting published.'
      : 'Job posting saved. It stays hidden from job seekers until you open it.';
  }

  async function handleSubmit(event) {
    event.preventDefault();
    if (saving) return;

    const values = {
      ...Object.fromEntries(Object.entries(form).map(([name, value]) => [name, value.trim()])),
      status,
    };
    const found = validate(values);
    setErrors(found);
    setBanner('');
    if (Object.keys(found).length) {
      focusFirstError(found);
      return;
    }

    setSaving(true);
    try {
      if (isEdit) await updateJob(id, values);
      else await createJob(values);
      navigate('/recruiter/jobs', {
        state: { message: successMessage() },
      });
    } catch (error) {
      if (handledSessionExpiry(error)) return;
      if (error.fieldErrors) {
        setErrors(error.fieldErrors);
        focusFirstError(error.fieldErrors);
        setBanner('Please fix the highlighted fields.');
      } else {
        setBanner(error.message);
      }
      setSaving(false);
    }
  }

  if (loading) return <p className="loading">Loading job posting...</p>;

  if (loadError) {
    return (
      <div className="page">
        <div className="card empty-state">
          <h3>{loadError.notFound ? 'Job posting not found' : 'Unable to load this job posting'}</h3>
          <p>
            {loadError.notFound
              ? 'It may have been deleted, or it belongs to another account.'
              : loadError.message}
          </p>
          <Link to="/recruiter/jobs" className="button secondary">Back to my postings</Link>
        </div>
      </div>
    );
  }

  const fieldProps = name => ({
    name, value: form[name], onChange: handleChange, error: errors[name],
  });

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1>{isEdit ? 'Edit job posting' : 'Post a job'}</h1>
          <p>
            {isEdit
              ? 'Update the details job seekers see on this posting.'
              : 'Publish a new opening. Open postings appear in the public job list right away.'}
          </p>
        </div>
      </div>

      {banner && <div className="banner error" role="alert">{banner}</div>}

      <form className="card" onSubmit={handleSubmit} noValidate>
        <div className="form-grid">
          <FormField
            label="Job title" required fullWidth
            placeholder="Backend Developer" {...fieldProps('title')}
          />
          <FormField
            label="Company" required
            placeholder="Company name" {...fieldProps('company')}
          />
          <FormField
            label="Location"
            placeholder="Montreal, QC" {...fieldProps('location')}
          />
          <FormField
            label="Job type" list="job-type-options"
            placeholder="Full-time" {...fieldProps('type')}
          />
          <datalist id="job-type-options">
            {TYPE_SUGGESTIONS.map(option => <option key={option} value={option} />)}
          </datalist>
          <FormField
            label="Category"
            placeholder="Engineering" {...fieldProps('category')}
          />
          <FormField
            label="Description" as="textarea" rows={8} required fullWidth
            placeholder="What will the person do in this role?" {...fieldProps('description')}
          />
          <FormField
            label="Requirements" as="textarea" rows={5} fullWidth
            help="Skills, experience, or qualifications candidates need."
            {...fieldProps('requirements')}
          />

          <fieldset
            className="form-group full-width availability"
            aria-describedby={errors.status ? 'status-error' : undefined}
          >
            <legend>Availability to job seekers</legend>
            {AVAILABILITY_OPTIONS.map(option => (
              <label key={option.value} className="availability-option">
                <input
                  type="radio"
                  name="status"
                  value={option.value}
                  checked={status === option.value}
                  onChange={handleStatusChange}
                />
                <span>
                  <strong>{option.label}</strong>
                  <span className="field-help">{option.help}</span>
                </span>
              </label>
            ))}
            {errors.status && <div id="status-error" className="field-error">{errors.status}</div>}
          </fieldset>
        </div>

        <div className="form-actions">
          <Link to="/recruiter/jobs" className="button secondary">Cancel</Link>
          <button className="button primary" type="submit" disabled={saving}>
            {saving
              ? (isEdit || status === 'closed' ? 'Saving...' : 'Publishing...')
              : (isEdit ? 'Save changes' : (status === 'open' ? 'Publish job' : 'Save without publishing'))}
          </button>
        </div>
      </form>
    </div>
  );
}

export default JobForm;
