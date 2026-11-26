import { request } from './recruiterJobsApi';

export const listInterviews = options => request('/api/interviews', options);
export const createInterview = body => request('/api/interviews', { method: 'POST', body });
export const updateInterview = (id, body) => request(`/api/interviews/${id}`, { method: 'PATCH', body });
export const cancelInterview = id => request(`/api/interviews/${id}/cancel`, { method: 'POST' });
