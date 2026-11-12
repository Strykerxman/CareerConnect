import { NavLink, Outlet } from 'react-router-dom';

function AppLayout() {
  const navClass = ({ isActive }) =>
    isActive ? 'nav-link active' : 'nav-link';

  return (
    <div className="app">
      <header className="topbar">
        <div className="topbar-content">
          <NavLink to="/profile" className="brand">
            CareerConnect
          </NavLink>

          <nav className="navigation" aria-label="Main navigation">
            <NavLink to="/jobs" className={navClass}>
              Jobs
            </NavLink>

            <NavLink to="/profile" className={navClass}>
              Profile
            </NavLink>

            <NavLink to="/resumes" className={navClass}>
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
            </NavLink>
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