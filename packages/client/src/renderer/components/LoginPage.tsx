import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api } from "../lib/api";
import { useAuthStore } from "../stores/auth";

export function LoginPage() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const login = useAuthStore((s) => s.login);
  const navigate = useNavigate();

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await api.login({ username, password });
      login(res.token, res.user);
      navigate("/channels");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={styles.container}>
      <form onSubmit={handleSubmit} style={styles.form}>
        <h1 style={styles.title}>Welcome back!</h1>
        <p style={styles.subtitle}>Sign in to continue to Concord</p>

        {error && <div style={styles.error}>{error}</div>}

        <label style={styles.label}>
          Username
          <input
            style={styles.input}
            type="text"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            required
            autoFocus
          />
        </label>

        <label style={styles.label}>
          Password
          <input
            style={styles.input}
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        </label>

        <button style={styles.button} type="submit" disabled={loading}>
          {loading ? "Signing in..." : "Sign In"}
        </button>

        <p style={styles.footer}>
          Don't have an account? <Link to="/register">Register</Link>
        </p>
      </form>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    height: "100%",
    background: "var(--bg-primary)",
  },
  form: {
    background: "var(--bg-secondary)",
    padding: "32px",
    borderRadius: "8px",
    width: "400px",
  },
  title: {
    fontSize: "24px",
    fontWeight: 600,
    marginBottom: "8px",
    textAlign: "center" as const,
  },
  subtitle: {
    color: "var(--text-secondary)",
    textAlign: "center" as const,
    marginBottom: "24px",
  },
  label: {
    display: "block",
    color: "var(--text-secondary)",
    fontSize: "12px",
    fontWeight: 700,
    textTransform: "uppercase" as const,
    marginBottom: "16px",
  },
  input: {
    display: "block",
    width: "100%",
    padding: "10px 12px",
    marginTop: "8px",
    background: "var(--input-bg)",
    border: "none",
    borderRadius: "4px",
    color: "var(--text-primary)",
    fontSize: "14px",
    outline: "none",
  },
  button: {
    width: "100%",
    padding: "12px",
    background: "var(--accent)",
    color: "white",
    border: "none",
    borderRadius: "4px",
    fontSize: "14px",
    fontWeight: 600,
    cursor: "pointer",
    marginBottom: "16px",
  },
  error: {
    background: "rgba(237, 66, 69, 0.1)",
    color: "var(--danger)",
    padding: "10px",
    borderRadius: "4px",
    marginBottom: "16px",
    fontSize: "13px",
  },
  footer: {
    color: "var(--text-muted)",
    fontSize: "13px",
    textAlign: "center" as const,
  },
};
