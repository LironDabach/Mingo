import { Routes, Route, Navigate, useLocation } from "react-router-dom";
import type { ReactElement } from "react";
import "./App.css";
import DashboardPage from "./pages/DashboardPage";
import TranscribePage from "./pages/TranscribePage";
import LoginPage from "./pages/LoginPage";
import RegisterPage from "./pages/RegisterPage";
import MeetingPage from "./pages/MeetingPage";
import TasksPage from "./pages/TasksPage";
import HistoryPage from "./pages/HistoryPage";
import GitHubCallbackPage from "./pages/GitHubCallbackPage";
import SettingsPage from "./pages/SettingsPage";

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
      <Route path="/" element={<Navigate to="/dashboard" replace />} />
      <Route path="/login" element={<LoginPage />} />
      <Route path="/register" element={<RegisterPage />} />
      <Route path="/auth/github/callback" element={<GitHubCallbackPage />} />
      <Route
        path="/dashboard"
        element={
          <RequireAuth>
            <DashboardPage />
          </RequireAuth>
        }
      />
      <Route
        path="/transcribe"
        element={
          <RequireAuth>
            <TranscribePage />
          </RequireAuth>
        }
      />
      <Route
        path="/meeting"
        element={
          <RequireAuth>
            <MeetingPage />
          </RequireAuth>
        }
      />
      <Route
        path="/tasks"
        element={
          <RequireAuth>
            <TasksPage />
          </RequireAuth>
        }
      />
      <Route
        path="/history"
        element={
          <RequireAuth>
            <HistoryPage />
          </RequireAuth>
        }
      />
      <Route
        path="/settings"
        element={
          <RequireAuth>
            <SettingsPage />
          </RequireAuth>
        }
      />
    </Routes>
  );
}

export default App;
