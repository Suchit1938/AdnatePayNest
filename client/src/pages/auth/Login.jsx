import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Eye, EyeOff, KeyRound, Lock, LogIn, Mail, X } from "lucide-react";

import api from "../../api/axios";
import brandLogo from "../../assets/brand/logo.png";
import { useToast } from "../../components/ui/useToast";
import { useAuth } from "../../context/useAuth";

const emailPattern = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/;
const emailErrorMessage = "Enter a valid email address.";

const getEmailError = (value) => {
  const normalizedEmail = value.trim().toLowerCase();
  return normalizedEmail && !emailPattern.test(normalizedEmail) ? emailErrorMessage : "";
};

function Login() {
  const toast = useToast();
  const navigate = useNavigate();
  const { login } = useAuth();

  const [email, setEmail] = useState("");
  const [emailError, setEmailError] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [forgotOpen, setForgotOpen] = useState(false);
  const [forgotStep, setForgotStep] = useState("email");
  const [forgotForm, setForgotForm] = useState({
    email: "",
    otp: "",
    newPassword: "",
    confirmPassword: "",
  });
  const [forgotEmailError, setForgotEmailError] = useState("");
  const [forgotLoading, setForgotLoading] = useState(false);
  const [visiblePasswords, setVisiblePasswords] = useState({
    login: false,
    forgotNew: false,
    forgotConfirm: false,
  });
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

  const updateLoginEmail = (value) => {
    setEmail(value);
    setError("");
    setEmailError(getEmailError(value));
  };

  const handleLogin = async (event) => {
    event.preventDefault();
    setError("");

    const normalizedEmail = email.trim().toLowerCase();
    const nextEmailError = getEmailError(email);

    if (nextEmailError || !normalizedEmail) {
      const errorMessage = nextEmailError || "Email is required.";
      setEmailError(errorMessage);
      setError(errorMessage);
      toast.warning(errorMessage);
      return;
    }

    try {
      const user = await login(normalizedEmail, password);
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

  const updateForgotForm = (field, value) => {
    if (field === "email") {
      setForgotEmailError(getEmailError(value));
    }

    setForgotForm((current) => ({ ...current, [field]: value }));
  };

  const togglePasswordVisibility = (field) => {
    setVisiblePasswords((current) => ({
      ...current,
      [field]: !current[field],
    }));
  };

  const openForgotPassword = () => {
    setForgotOpen(true);
    setForgotStep("email");
    setForgotForm({
      email,
      otp: "",
      newPassword: "",
      confirmPassword: "",
    });
    setForgotEmailError(getEmailError(email));
  };

  const sendForgotOtp = async (event) => {
    event.preventDefault();

    const normalizedEmail = forgotForm.email.trim().toLowerCase();
    const nextForgotEmailError = getEmailError(forgotForm.email);

    if (nextForgotEmailError || !normalizedEmail) {
      const errorMessage = nextForgotEmailError || "Registered email is required.";
      setForgotEmailError(errorMessage);
      toast.warning(errorMessage);
      return;
    }

    setForgotLoading(true);

    try {
      await api.post("/auth/forgot-password/send-otp", {
        email: normalizedEmail,
      });
      toast.success("OTP sent to your registered email.");
      updateForgotForm("email", normalizedEmail);
      setForgotStep("reset");
    } catch (error) {
      toast.error(error.response?.data?.message || "Unable to send OTP.");
    } finally {
      setForgotLoading(false);
    }
  };

  const resetForgotPassword = async (event) => {
    event.preventDefault();

    if (forgotForm.newPassword !== forgotForm.confirmPassword) {
      toast.warning("New password and confirm password must match.");
      return;
    }

    setForgotLoading(true);

    try {
      const { data } = await api.post("/auth/forgot-password/reset", {
        email: forgotForm.email.trim().toLowerCase(),
        otp: forgotForm.otp,
        newPassword: forgotForm.newPassword,
      });

      toast.success(data.message || "Password reset successfully.");
      setPassword("");
      setEmail(forgotForm.email.trim().toLowerCase());
      setForgotOpen(false);
    } catch (error) {
      toast.error(error.response?.data?.message || "Unable to reset password.");
    } finally {
      setForgotLoading(false);
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
                  <img
                    src={brandLogo}
                    alt="AdnatePayNest logo"
                    className="mx-auto mb-6 h-28 w-28 rounded-full bg-white object-cover shadow-lg ring-4 ring-white/20 sm:h-32 sm:w-32"
                  />
                  <h1 className="break-words text-4xl font-bold leading-tight tracking-tight sm:text-5xl lg:text-6xl">
                    AdnatePayNest
                  </h1>
                  <p className="mt-5 text-base italic text-blue-100 sm:text-xl lg:text-2xl">
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
                      onChange={(event) => updateLoginEmail(event.target.value)}
                      autoComplete="email"
                      list="recent-login-emails"
                      className={`input-field !pl-11 ${
                        emailError ? "border-red-300 focus:border-red-500 focus:ring-red-100" : ""
                      }`}
                      aria-invalid={Boolean(emailError)}
                    />
                  </div>
                  {emailError && <p className="mt-2 text-xs font-semibold text-red-600">{emailError}</p>}
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
                      type={visiblePasswords.login ? "text" : "password"}
                      placeholder="Enter Password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      autoComplete="current-password"
                      className="input-field !pl-11 !pr-11"
                    />
                    <button
                      type="button"
                      onClick={() => togglePasswordVisibility("login")}
                      className="absolute right-3 top-1/2 -translate-y-1/2 rounded-md p-1 text-slate-500 hover:bg-slate-100 hover:text-slate-700"
                      aria-label={visiblePasswords.login ? "Hide password" : "Show password"}
                      title={visiblePasswords.login ? "Hide password" : "Show password"}
                    >
                      {visiblePasswords.login ? <EyeOff size={18} /> : <Eye size={18} />}
                    </button>
                  </div>
                </label>

                <div className="mt-3 flex justify-end">
                  <button
                    type="button"
                    onClick={openForgotPassword}
                    className="text-sm font-semibold text-blue-700 hover:text-blue-900"
                  >
                    Forgot password?
                  </button>
                </div>

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

      {forgotOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4">
          <div className="w-full max-w-md rounded-lg bg-white shadow-xl">
            <div className="flex items-start justify-between border-b border-slate-100 p-5">
              <div>
                <p className="text-sm font-bold uppercase text-blue-700">Password recovery</p>
                <h2 className="mt-1 text-2xl font-bold text-slate-950">Reset password</h2>
              </div>
              <button
                type="button"
                onClick={() => setForgotOpen(false)}
                className="rounded-lg border border-slate-200 p-2 text-slate-500 hover:bg-slate-50"
                aria-label="Close forgot password"
              >
                <X size={18} />
              </button>
            </div>

            <form
              onSubmit={forgotStep === "email" ? sendForgotOtp : resetForgotPassword}
              className="space-y-4 p-5"
            >
              <label className="label-field">
                Registered Email
                <input
                  type="email"
                  value={forgotForm.email}
                  onChange={(event) => updateForgotForm("email", event.target.value)}
                  className={`input-field ${
                    forgotEmailError ? "border-red-300 focus:border-red-500 focus:ring-red-100" : ""
                  }`}
                  placeholder="customer@example.com"
                  aria-invalid={Boolean(forgotEmailError)}
                  required
                />
                {forgotEmailError && (
                  <p className="mt-2 text-xs font-semibold text-red-600">{forgotEmailError}</p>
                )}
              </label>

              {forgotStep === "reset" && (
                <>
                  <label className="label-field">
                    OTP
                    <input
                      value={forgotForm.otp}
                      onChange={(event) => updateForgotForm("otp", event.target.value)}
                      className="input-field"
                      placeholder="6 digit OTP"
                      maxLength={6}
                      required
                    />
                  </label>
                  <label className="label-field">
                    New Password
                    <div className="relative">
                      <input
                        type={visiblePasswords.forgotNew ? "text" : "password"}
                        value={forgotForm.newPassword}
                        onChange={(event) => updateForgotForm("newPassword", event.target.value)}
                        className="input-field !pr-11"
                        required
                      />
                      <button
                        type="button"
                        onClick={() => togglePasswordVisibility("forgotNew")}
                        className="absolute right-3 top-1/2 -translate-y-1/2 rounded-md p-1 text-slate-500 hover:bg-slate-100 hover:text-slate-700"
                        aria-label={visiblePasswords.forgotNew ? "Hide new password" : "Show new password"}
                        title={visiblePasswords.forgotNew ? "Hide new password" : "Show new password"}
                      >
                        {visiblePasswords.forgotNew ? <EyeOff size={18} /> : <Eye size={18} />}
                      </button>
                    </div>
                  </label>
                  <label className="label-field">
                    Confirm Password
                    <div className="relative">
                      <input
                        type={visiblePasswords.forgotConfirm ? "text" : "password"}
                        value={forgotForm.confirmPassword}
                        onChange={(event) => updateForgotForm("confirmPassword", event.target.value)}
                        className="input-field !pr-11"
                        required
                      />
                      <button
                        type="button"
                        onClick={() => togglePasswordVisibility("forgotConfirm")}
                        className="absolute right-3 top-1/2 -translate-y-1/2 rounded-md p-1 text-slate-500 hover:bg-slate-100 hover:text-slate-700"
                        aria-label={visiblePasswords.forgotConfirm ? "Hide confirm password" : "Show confirm password"}
                        title={visiblePasswords.forgotConfirm ? "Hide confirm password" : "Show confirm password"}
                      >
                        {visiblePasswords.forgotConfirm ? <EyeOff size={18} /> : <Eye size={18} />}
                      </button>
                    </div>
                  </label>
                </>
              )}

              <button type="submit" className="btn-primary w-full" disabled={forgotLoading}>
                <KeyRound size={18} />
                {forgotLoading
                  ? "Please wait..."
                  : forgotStep === "email"
                    ? "Send OTP"
                    : "Reset Password"}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

export default Login;
