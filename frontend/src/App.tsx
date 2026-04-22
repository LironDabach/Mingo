import type { ReactElement } from "react";
import { Navigate, Route, Routes, useLocation } from "react-router-dom";
import "./App.css";
import { isAuthenticated } from "./lib/auth";
import DashboardPage from "./pages/DashboardPage";
import HistoryPage from "./pages/HistoryPage";
import LoginPage from "./pages/LoginPage";
import MeetingPage from "./pages/MeetingPage";
import RegisterPage from "./pages/RegisterPage";
import TasksPage from "./pages/TasksPage";
import TranscribePage from "./pages/TranscribePage";

function App() {
  const location = useLocation();

  const RequireAuth = ({ children }: { children: ReactElement }) => {
    if (!isAuthenticated()) {
      return <Navigate to="/login" state={{ from: location }} replace />;
    }

    return children;
  };

  return (
    <Routes>
      <Route path="/" element={<Navigate to="/dashboard" replace />} />
      <Route path="/login" element={<LoginPage />} />
      <Route path="/register" element={<RegisterPage />} />
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
        path="/meeting/:meetingId"
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
    </Routes>
  );
}

export default App;
