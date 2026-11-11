import React from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import AppLayout from './components/AppLayout';
import Profile from './pages/Profile';
import Resumes from './pages/Resumes';
import Register from './pages/Register';
import Login from './pages/Login';
import Jobs from './pages/Jobs';
import JobDetails from './pages/JobDetails';
import MyApplications from './pages/MyApplications';
import ApplicationStats from "./pages/ApplicationStats";
import SavedJobs from './pages/SavedJobs';
import RequireAuth from './components/RequireAuth';
import MyJobs from './pages/MyJobs';
import JobForm from './pages/JobForm';

function App() {
  return (
    <Routes>
      <Route path="/register" element={<Register />} />
      <Route path="/login" element={<Login />} />

      <Route element={<AppLayout />}>
        <Route path="/applications" element={<MyApplications />} />
        <Route path="/saved-jobs" element={<SavedJobs />} />
        <Route index element={<Navigate to="/register" replace />} />
        <Route path="/profile" element={<Profile />} />
        <Route path="/resumes" element={<Resumes />} />
        <Route path="/jobs" element={<Jobs />} />
        <Route path="/jobs/:id" element={<JobDetails />} />
        <Route path="/application-stats" element={<ApplicationStats />} />

        {/* Posting and managing jobs belongs to recruiters. */}
        <Route element={<RequireAuth role="recruiter" />}>
          <Route path="/recruiter/jobs" element={<MyJobs />} />
          <Route path="/recruiter/jobs/new" element={<JobForm key="new" />} />
          <Route path="/recruiter/jobs/:id/edit" element={<JobForm key="edit" />} />
        </Route>
      </Route>
    </Routes>
  );
}

export default App;