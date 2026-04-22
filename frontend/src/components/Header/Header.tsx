import { NavLink, useNavigate } from "react-router-dom";
import { clearSession, getCurrentUser } from "../../lib/auth";
import "./Header.css";

const Header = () => {
  const navigate = useNavigate();
  const currentUser = getCurrentUser();

  const handleLogout = () => {
    clearSession();
    navigate("/login");
  };

  return (
    <header className="header">
      <button className="header-brand" onClick={() => navigate("/dashboard")}>
        <span className="header-brand-mark">M</span>
        <span className="header-brand-copy">
          <strong>Mingo</strong>
          <small>Connected meeting workspace</small>
        </span>
      </button>

      <nav className="header-nav">
        <NavLink to="/dashboard" className={({ isActive }) => (isActive ? "active" : "")}>
          Dashboard
        </NavLink>
        <NavLink to="/tasks" className={({ isActive }) => (isActive ? "active" : "")}>
          Tasks
        </NavLink>
        <NavLink to="/history" className={({ isActive }) => (isActive ? "active" : "")}>
          History
        </NavLink>
        <NavLink to="/transcribe" className={({ isActive }) => (isActive ? "active" : "")}>
          Upload
        </NavLink>
      </nav>

      <div className="header-actions">
        <div className="header-user">
          <span className="header-user-name">{currentUser?.fullname || currentUser?.username}</span>
          <span className="header-user-email">{currentUser?.email}</span>
        </div>
        <button className="header-logout" onClick={handleLogout}>
          Log out
        </button>
      </div>
    </header>
  );
};

export default Header;
