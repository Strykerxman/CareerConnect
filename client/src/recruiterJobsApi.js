import { clearSession, getToken } from './auth';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000';

// Error carrying the HTTP status and, for validation failures, the server's
// per-field messages ({ title: 'Enter the job title.' }).
export class ApiError extends Error {
  constructor(message, { status = 0, fieldErrors = null } = {}) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.fieldErrors = fieldErrors;
  }
}

async function request(path, { method = 'GET', body, signal } = {}) {
  const headers = { Authorization: `Bearer ${getToken()}` };
  if (body !== undefined) headers['Content-Type'] = 'application/json';

  let response;
  try {
    response = await fetch(`${API_URL}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      signal,
    });
  } catch (error) {
    if (error?.name === 'AbortError') throw error;
    throw new ApiError('Cannot reach the server. Make sure the backend is running.');
  }

  let data = null;
  if (response.status !== 204) {
    try {
      data = await response.json();
    } catch {
      data = null;
    }
  }

  if (!response.ok) {
    if (response.status === 401) clearSession();
    throw new ApiError(data?.error || 'Something went wrong. Please try again.', {
      status: response.status,
      fieldErrors: data?.errors || null,
    });
  }
  return data;
}

const base = '/api/recruiter/jobs';

export const listMyJobs = options => request(base, options);
export const getMyJob = (id, options) => request(`${base}/${id}`, options);
export const createJob = payload => request(base, { method: 'POST', body: payload });
export const updateJob = (id, payload) => request(`${base}/${id}`, { method: 'PATCH', body: payload });
export const closeJob = id => request(`${base}/${id}/close`, { method: 'POST' });
export const reopenJob = id => request(`${base}/${id}/reopen`, { method: 'POST' });
export const deleteJob = id => request(`${base}/${id}`, { method: 'DELETE' });

// The recruiter's saved company name, used to pre-fill a new posting.
export async function getCompanyName(options) {
  const data = await request('/api/profile', options);
  return (data?.profile?.company_name || '').trim();
}

export const listApplicants = (id, { filters = {}, ...options } = {}) => {
  const query = new URLSearchParams(filters).toString();
  return request(`${base}/${id}/applications${query ? `?${query}` : ''}`, options);
};
export const updateApplicationStatus = (jobId, applicationId, status, options = {}) =>
  request(`${base}/${jobId}/applications/${applicationId}`, { ...options, method: 'PATCH', body: { status } });
