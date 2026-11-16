
import React from 'react';
import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { getUser } from '../auth';

function AppLayout() {
  const isRecruiter = getUser()?.role === 'recruiter';
  const navigate = useNavigate();


  const handleLogout = () => {
    localStorage.removeItem("token");
    localStorage.removeItem("user");
    navigate("/login", { replace: true });
  };

  const navClass = ({ isActive }) =>
    isActive ? 'nav-link active' : 'nav-link';

  return (
    <div className="app">
      <header className="topbar">
        <div className="topbar-content">
          <div className="brand-group">
            <NavLink to="/profile" className="brand">
              CareerConnect
            </NavLink>

            <span className={`role-badge ${isRecruiter ? "role-recruiter" : "role-seeker"}`}>
              {isRecruiter ? "Recruiter" : "Job Seeker"}
            </span>
          </div>


          <nav className="navigation" aria-label="Main navigation">
            <NavLink to="/jobs" className={navClass}>
              Jobs
            </NavLink>

            <NavLink to="/profile" className={navClass}>
              Profile
            </NavLink>

            {/* <NavLink to="/resumes" className={navClass}>
              Resumes
            </NavLink>

            <NavLink to="/applications" className={navClass}>
              My Applications
            </NavLink>

            <NavLink to="/application-stats" className={navClass}>
              Statistics
            </NavLink>

            <NavLink to="/saved-jobs" className={navClass}>
              Saved Jobs
            </NavLink>

            <NavLink to="/reminders" className={navClass}>
              Reminders
            </NavLink> */}


            {isRecruiter && (
              <NavLink to="/recruiter/jobs" className={navClass}>
                Dashboard
              </NavLink>
            )}
            {!isRecruiter && (
              <>
                <NavLink to="/resumes" className={navClass}>Resumes</NavLink>
                <NavLink to="/applications" className={navClass}>My Applications</NavLink>
                <NavLink to="/application-stats" className={navClass}>Statistics</NavLink>
                <NavLink to="/saved-jobs" className={navClass}>Saved Jobs</NavLink>
                <NavLink to="/reminders" className={navClass}>Reminders</NavLink>
              </>
            )}<button
              type="button"
              className="logout-button"
              onClick={handleLogout}
            >
              Log Out
            </button>
          </nav>
        </div>
      </header>

      <main className="page-container">
        <Outlet />
      </main>
    </div>
  );
}

export default AppLayout;
