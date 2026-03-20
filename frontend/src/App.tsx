import { Routes, Route, Navigate, useLocation } from "react-router-dom";
import type { ReactElement } from "react";
import "./App.css";

// Main app router — wraps protected routes with auth check
function App() {
  const location = useLocation();

  const RequireAuth = ({ children }: { children: ReactElement }) => {
    const isAuth = Boolean(localStorage.getItem("token"));
    if (!isAuth) {
      return <Navigate to="/login" state={{ from: location }} replace />;
    }
    return children;
  };

  return (
    <Routes>
    </Routes>
  );
}

export default App;
