import { ArrowRight, Check, Sprout } from "lucide-react";
import { useState, type FormEvent } from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";
import { ErrorBox } from "../components/ui";

export default function Login() {
  const { user, signIn } = useAuth();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  if (user) return <Navigate to="/" replace />;
  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      await signIn(username, password);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to sign in.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="login-layout">
      <section className="login-story">
        <div className="brand">
          <span className="brand-mark">
            <Sprout size={25} />
          </span>
          ClubOps.
        </div>
        <div className="login-message">
          <div className="eyebrow">GOOD IDEAS DESERVE A CLEAR PATH.</div>
          <h1>
            Less paperwork.
            <br />
            More possibility.
          </h1>
          <p>
            The home for your organization's spending.
            <br />
            Bring requests, approvals, and budgets together.
          </p>
          <div className="login-features">
            {[
              "Know where your budget stands",
              "Give every request a clear next step",
              "Keep the whole team on the same page",
            ].map((text) => (
              <div key={text}>
                <Check size={18} />
                {text}
              </div>
            ))}
          </div>
        </div>
        <div className="login-foot">
          Made for student organizations. Built around trust.
        </div>
      </section>
      <section className="login-form-side">
        <div className="login-form">
          <div className="eyebrow">YOUR ORGANIZATION, ORGANIZED</div>
          <h2>Welcome back.</h2>
          <p>Sign in to your ClubOps workspace.</p>
          <form onSubmit={submit}>
            <ErrorBox message={error} />
            <label>
              Username
              <input
                name="username"
                autoComplete="username"
                required
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="Enter your username"
              />
            </label>
            <label>
              Password
              <input
                name="password"
                autoComplete="current-password"
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter your password"
              />
            </label>
            <button className="button primary full" disabled={busy}>
              {busy ? "Signing in…" : "Sign in"}
              <ArrowRight size={17} />
            </button>
          </form>
          <div className="demo-help">
            <span className="demo-label">EXPLORING THE DEMO?</span>
            <p>
              Use <code>member</code>, <code>treasurer</code>, or{" "}
              <code>admin</code>.<br />
              Password: <code>ClubOps-demo-2026!</code>
            </p>
            <small>
              Development accounts with different approval permissions.
            </small>
          </div>
        </div>
      </section>
    </div>
  );
}
