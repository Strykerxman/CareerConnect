import React from 'react';
import { Navigate, Outlet } from 'react-router-dom';
import { getToken, getUser } from '../auth';

// Wraps pages that need a signed-in user. Pass `role` to restrict a page to
// one account type; other roles are sent to their profile instead.
export default function RequireAuth({ role }) {
  if (!getToken()) {
    return <Navigate to="/login" replace />;
  }

  const user = getUser();
  if (role && user?.role && user.role !== role) {
    return <Navigate to="/profile" replace />;
  }

  return <Outlet />;
}
