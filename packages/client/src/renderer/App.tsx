import { HashRouter, Routes, Route, Navigate } from "react-router-dom";
import { useAuthStore } from "./stores/auth";
import { LoginPage } from "./components/LoginPage";
import { RegisterPage } from "./components/RegisterPage";
import { AppLayout } from "./components/AppLayout";

export function App() {
  const token = useAuthStore((s) => s.token);

  return (
    <HashRouter>
      <div className="titlebar">Concord</div>
      <Routes>
        {!token ? (
          <>
            <Route path="/login" element={<LoginPage />} />
            <Route path="/register" element={<RegisterPage />} />
            <Route path="*" element={<Navigate to="/login" replace />} />
          </>
        ) : (
          <>
            <Route path="/channels/:serverId?/:channelId?" element={<AppLayout />} />
            <Route path="*" element={<Navigate to="/channels" replace />} />
          </>
        )}
      </Routes>
    </HashRouter>
  );
}
