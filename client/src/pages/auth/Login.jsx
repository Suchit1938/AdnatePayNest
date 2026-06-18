import { useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  BadgeCheck,
  Building2,
  Eye,
  EyeOff,
  KeyRound,
  Lock,
  LogIn,
  Mail,
  ShieldCheck,
  X,
} from "lucide-react";

import api from "../../api/axios";
import brandLogo from "../../assets/brand/logo.png";
import heroImage from "../../assets/login/login-hero-premium.png";
import { useToast } from "../../components/ui/useToast";
import { useAuth } from "../../context/useAuth";
import { isValidEmail } from "../../utils/emailValidation";

const emailErrorMessage = "Enter a valid email address.";

const getEmailError = (value) => {
  const normalizedEmail = value.trim().toLowerCase();
  return normalizedEmail && !isValidEmail(normalizedEmail) ? emailErrorMessage : "";
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
    <div className="min-h-screen overflow-hidden bg-[radial-gradient(circle_at_top_left,#dff4ff_0,#f4fbff_38%,#ffffff_72%)] px-3 py-3 text-slate-950 sm:px-5 sm:py-5">
      <main className="mx-auto grid min-h-[calc(100vh-1.5rem)] w-full max-w-[1440px] grid-cols-1 overflow-hidden rounded-[1.75rem] border border-white/80 bg-white/85 shadow-2xl shadow-blue-950/15 ring-1 ring-blue-100/70 backdrop-blur lg:min-h-[calc(100vh-2.5rem)] lg:grid-cols-[1.08fr_0.92fr]">
        <section className="relative flex min-h-[500px] overflow-hidden bg-[#0458b8] px-6 py-7 text-white sm:px-10 lg:min-h-full lg:px-12 lg:py-10">
          <div className="absolute inset-0 bg-[linear-gradient(135deg,rgba(0,87,184,0.96)_0%,rgba(4,52,133,0.88)_48%,rgba(2,16,54,0.88)_100%)]" />
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_18%_22%,rgba(90,201,255,0.36),transparent_28%),radial-gradient(circle_at_85%_82%,rgba(0,174,239,0.28),transparent_34%)]" />
          <div className="absolute inset-x-0 bottom-0 h-44 bg-gradient-to-t from-sky-300/18 to-transparent" />
          <img
            src={heroImage}
            alt=""
            aria-hidden="true"
            className="absolute inset-0 h-full w-full object-cover object-[70%_center] opacity-85 mix-blend-screen"
          />
          <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(2,73,160,0.92)_0%,rgba(2,73,160,0.72)_42%,rgba(2,73,160,0.22)_72%,rgba(2,73,160,0.06)_100%)]" />
          <div className="absolute -left-28 top-28 h-72 w-72 rounded-full border border-white/10" />
          <div className="absolute bottom-8 left-10 hidden h-20 w-20 rounded-full border border-cyan-200/20 lg:block" />

          <div className="relative z-10 flex w-full flex-col items-center justify-center text-center">
            <div className="flex flex-col items-center">
              <img
                src={brandLogo}
                alt="AdnatePayNest logo"
                className="h-28 w-28 rounded-full bg-white object-cover p-2 shadow-2xl shadow-blue-950/35 ring-8 ring-white/15 sm:h-32 sm:w-32"
              />
              <p className="mt-5 text-4xl font-black leading-tight tracking-tight sm:text-5xl">
                AdnatePayNest
              </p>
              <p className="mt-2 text-base font-semibold text-cyan-100 sm:text-lg">
                Our Technology, Your Trust
              </p>
              
              <div className="mt-8 grid w-full max-w-xl grid-cols-1 gap-3 sm:grid-cols-3">
                <div className="rounded-2xl border border-white/20 bg-white/10 px-4 py-4 shadow-xl shadow-blue-950/10 backdrop-blur">
                  <ShieldCheck className="mx-auto text-cyan-100" size={24} />
                  <p className="mt-2 text-sm font-bold">Secure Login</p>
                </div>
                <div className="rounded-2xl border border-white/20 bg-white/10 px-4 py-4 shadow-xl shadow-blue-950/10 backdrop-blur">
                  <BadgeCheck className="mx-auto text-cyan-100" size={24} />
                  <p className="mt-2 text-sm font-bold">Verified Access</p>
                </div>
                <div className="rounded-2xl border border-white/20 bg-white/10 px-4 py-4 shadow-xl shadow-blue-950/10 backdrop-blur">
                  <Building2 className="mx-auto text-cyan-100" size={24} />
                  <p className="mt-2 text-sm font-bold">Banking Control</p>
                </div>
              </div>
            </div>

          </div>
        </section>

        <section className="relative flex items-center bg-[linear-gradient(180deg,#f7fcff_0%,#eef8ff_100%)] px-5 py-8 sm:px-8 lg:px-12">
          <div className="absolute right-0 top-0 h-64 w-64 rounded-full bg-cyan-200/30 blur-3xl" />
          <div className="absolute bottom-0 left-8 h-56 w-56 rounded-full bg-blue-200/30 blur-3xl" />
          <div className="mx-auto w-full max-w-md">
            <div className="mb-8 lg:hidden">
              <img
                src={brandLogo}
                alt="AdnatePayNest logo"
                className="h-14 w-14 rounded-full bg-white object-cover p-1 shadow-sm ring-1 ring-bank-card-border"
              />
            </div>

            <div className="relative rounded-2xl border border-white/80 bg-white/92 p-6 shadow-2xl shadow-blue-950/12 ring-1 ring-blue-100/70 backdrop-blur sm:p-8">
              <p className="text-sm font-black uppercase tracking-[0.2em] text-bank-eyebrow">
                Welcome 
              </p>
              <h2 className="mt-3 text-3xl font-black tracking-tight text-slate-950">
                Sign in to your account
              </h2>
              <p className="mt-2 text-sm font-medium leading-6 text-slate-500">
                Use your registered credentials to continue.
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
                      className={`input-field !rounded-xl !border-blue-100 !bg-slate-50/70 !py-3.5 !pl-11 !shadow-inner !shadow-blue-950/[0.02] focus:!bg-white ${
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
                      className="input-field !rounded-xl !border-blue-100 !bg-slate-50/70 !py-3.5 !pl-11 !pr-11 !shadow-inner !shadow-blue-950/[0.02] focus:!bg-white"
                    />
                    <button
                      type="button"
                      onClick={() => togglePasswordVisibility("login")}
                      className="absolute right-3 top-1/2 -translate-y-1/2 rounded-lg p-1.5 text-slate-500 transition hover:bg-blue-50 hover:text-bank-eyebrow"
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
                    className="text-sm font-bold text-blue-700 transition hover:text-blue-950"
                  >
                    Forgot password?
                  </button>
                </div>

                {error && <p className="alert-error mt-5">{error}</p>}

                <p className="mt-5 text-xs font-medium leading-5 text-slate-500">
                  By continuing, you agree to secure usage guidelines and internal banking policy.
                </p>

                <button type="submit" className="btn-primary mt-5 w-full !rounded-xl !bg-gradient-to-r !from-[#0057b8] !to-[#00aeef] !py-3.5 !text-base !shadow-lg !shadow-cyan-500/25 hover:!from-[#004a9e] hover:!to-[#0095d1]">
                  <LogIn size={18} />
                  Sign In
                </button>
              </form>
            </div>
          </div>
        </section>
      </main>

      {forgotOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl border border-white/70 bg-white shadow-2xl shadow-blue-950/20">
            <div className="flex items-start justify-between border-b border-slate-100 p-5">
              <div>
                <p className="text-sm font-bold uppercase text-blue-700">Password recovery</p>
                <h2 className="mt-1 text-2xl font-bold text-slate-950">Reset password</h2>
              </div>
              <button
                type="button"
                onClick={() => setForgotOpen(false)}
                className="rounded-lg border border-slate-200 p-2 text-slate-500 transition hover:bg-slate-50 hover:text-slate-800"
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
                  className={`input-field !rounded-xl !border-blue-100 !bg-slate-50/70 ${
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
                      className="input-field !rounded-xl !border-blue-100 !bg-slate-50/70"
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
                        className="input-field !rounded-xl !border-blue-100 !bg-slate-50/70 !pr-11"
                        required
                      />
                      <button
                        type="button"
                        onClick={() => togglePasswordVisibility("forgotNew")}
                        className="absolute right-3 top-1/2 -translate-y-1/2 rounded-lg p-1.5 text-slate-500 transition hover:bg-blue-50 hover:text-bank-eyebrow"
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
                        className="input-field !rounded-xl !border-blue-100 !bg-slate-50/70 !pr-11"
                        required
                      />
                      <button
                        type="button"
                        onClick={() => togglePasswordVisibility("forgotConfirm")}
                        className="absolute right-3 top-1/2 -translate-y-1/2 rounded-lg p-1.5 text-slate-500 transition hover:bg-blue-50 hover:text-bank-eyebrow"
                        aria-label={visiblePasswords.forgotConfirm ? "Hide confirm password" : "Show confirm password"}
                        title={visiblePasswords.forgotConfirm ? "Hide confirm password" : "Show confirm password"}
                      >
                        {visiblePasswords.forgotConfirm ? <EyeOff size={18} /> : <Eye size={18} />}
                      </button>
                    </div>
                  </label>
                </>
              )}

              <button type="submit" className="btn-primary w-full !rounded-xl !bg-gradient-to-r !from-[#0057b8] !to-[#00aeef] !py-3.5 !shadow-lg !shadow-cyan-500/25 hover:!from-[#004a9e] hover:!to-[#0095d1]" disabled={forgotLoading}>
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
