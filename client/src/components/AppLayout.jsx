import { NavLink, Outlet } from 'react-router-dom';

function AppLayout() {
  return (
    <div className="app">
      <header className="topbar">
        <div className="topbar-content">
          <NavLink to="/profile" className="brand">CareerConnect</NavLink>
          <nav className="navigation" aria-label="Main navigation">
            <NavLink to="/profile" className={({ isActive }) => isActive ? 'nav-link active' : 'nav-link'}>Profile</NavLink>
            <NavLink to="/resumes" className={({ isActive }) => isActive ? 'nav-link active' : 'nav-link'}>Resumes</NavLink>
          </nav>
        </div>
      </header>
      <main className="page-container"><Outlet /></main>
    </div>
  );
}

export default AppLayout;
