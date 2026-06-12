import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Lock, LogIn, Mail } from "lucide-react";

import { useToast } from "../../components/ui/useToast";
import { useAuth } from "../../context/useAuth";

function Login() {
  const toast = useToast();
  const navigate = useNavigate();
  const { login } = useAuth();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [recentEmails, setRecentEmails] = useState(() => {
    const storedEmails = localStorage.getItem("adnate-recent-emails");
    try {
      return storedEmails ? JSON.parse(storedEmails) : [];
    } catch {
      return [];
    }
  });

  const saveRecentEmail = (nextEmail) => {
    const updatedEmails = [
      nextEmail,
      ...recentEmails.filter((recentEmail) => recentEmail !== nextEmail),
    ].slice(0, 3);

    setRecentEmails(updatedEmails);
    localStorage.setItem("adnate-recent-emails", JSON.stringify(updatedEmails));
  };

  const handleLogin = async (event) => {
    event.preventDefault();
    setError("");

    try {
      const user = await login(email, password);
      saveRecentEmail(user.email);

      if (user.role === "admin") {
        navigate("/admin");
      } else if (user.role === "manager") {
        navigate("/manager");
      } else {
        navigate("/customer");
      }
    } catch (error) {
      const errorMessage = error.response?.data?.message || "Invalid Credentials";
      setError(errorMessage);
      toast.error(errorMessage);
    }
  };

  return (
    <div className="min-h-screen bg-bank-surface px-2 py-2 sm:px-4 sm:py-4">
      <div className="mx-auto w-full max-w-[1380px]">
        <section className="rounded-xl bg-bank-sidebar p-3 shadow-2xl shadow-blue-950/20 sm:p-5 lg:p-6">
          <div className="grid min-h-[calc(100vh-2.5rem)] grid-cols-1 gap-4 lg:grid-cols-[1.15fr_0.85fr]">
            <div className="relative overflow-hidden rounded-xl border border-white/10 bg-bank-sidebar p-6 text-white sm:p-8">
              <div className="flex h-full min-h-[360px] items-center justify-center">
                <div className="text-center">
                  <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-xl bg-bank-accent text-xl font-bold shadow-lg ring-1 ring-white/20">
                    AP
                  </div>
                  <h1 className="text-5xl font-bold leading-tight tracking-tight sm:text-6xl">
                    AdnatePayNest
                  </h1>
                  <p className="mt-5 text-lg italic text-blue-100 sm:text-2xl">
                    Our Technology, Your Trust
                  </p>
                </div>
              </div>
            </div>

            <div className="rounded-xl border border-bank-card-border bg-white p-6 shadow-xl sm:p-8">
              <h2 className="text-3xl font-bold tracking-tight text-bank-sidebar">
                Access your workspace
              </h2>
              <p className="mt-2 text-sm text-slate-500">
                Sign in to continue with AdnatePayNest
              </p>

              <form onSubmit={handleLogin} className="mt-6">
                <label className="label-field">
                  Email ID
                  <div className="relative">
                    <Mail
                      size={18}
                      className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-slate-400"
                    />
                    <input
                      type="email"
                      placeholder="Enter Email ID"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      autoComplete="email"
                      list="recent-login-emails"
                      className="input-field !pl-11"
                    />
                  </div>
                </label>

                <datalist id="recent-login-emails">
                  {recentEmails.map((recentEmail) => (
                    <option key={recentEmail} value={recentEmail} />
                  ))}
                </datalist>

                <label className="label-field mt-5">
                  Password
                  <div className="relative">
                    <Lock
                      size={18}
                      className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-slate-400"
                    />
                    <input
                      type="password"
                      placeholder="Enter Password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      autoComplete="current-password"
                      className="input-field !pl-11"
                    />
                  </div>
                </label>

                {error && <p className="alert-error mt-5">{error}</p>}

                <p className="mt-5 text-xs text-slate-500">
                  By continuing, you agree to secure usage guidelines and internal banking policy.
                </p>

                <button type="submit" className="btn-primary mt-5 w-full">
                  <LogIn size={18} />
                  Sign In
                </button>
              </form>

              <div className="mt-5 rounded-lg bg-bank-surface px-4 py-3 text-center text-xs text-slate-600">
                Built for secure fund transfer operations and controlled approval workflows.
              </div>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}

export default Login;
