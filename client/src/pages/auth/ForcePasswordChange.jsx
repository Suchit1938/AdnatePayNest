import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Eye, EyeOff, KeyRound, ShieldCheck } from "lucide-react";

import api from "../../api/axios";
import brandLogo from "../../assets/brand/logo.png";
import { useToast } from "../../components/ui/useToast";
import { useAuth } from "../../context/useAuth";

const RequiredMark = () => <span className="ml-1 text-sm font-black text-red-600">*</span>;

const getHomePath = (role) => {
  if (role === "admin") {
    return "/admin";
  }

  if (role === "manager") {
    return "/manager";
  }

  return "/";
};

const ForcePasswordChange = () => {
  const toast = useToast();
  const navigate = useNavigate();
  const { user, setSessionUser } = useAuth();
  const [step, setStep] = useState("details");
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({
    currentPassword: "",
    newPassword: "",
    confirmPassword: "",
    otp: "",
  });
  const [visiblePasswords, setVisiblePasswords] = useState({
    current: false,
    next: false,
    confirm: false,
  });

  const updateForm = (field, value) => {
    setForm((current) => ({ ...current, [field]: value }));
  };

  const togglePasswordVisibility = (field) => {
    setVisiblePasswords((current) => ({ ...current, [field]: !current[field] }));
  };

  const sendOtp = async (event) => {
    event.preventDefault();

    if (form.newPassword !== form.confirmPassword) {
      toast.warning("New password and confirm password must match.");
      return;
    }

    setLoading(true);

    try {
      const { data } = await api.post("/auth/password/send-otp", {
        currentPassword: form.currentPassword,
        newPassword: form.newPassword,
      });

      toast.success(data.message || "OTP sent to your registered email.");
      setStep("otp");
    } catch (error) {
      toast.error(error.response?.data?.message || "Unable to send OTP.");
    } finally {
      setLoading(false);
    }
  };

  const verifyOtp = async (event) => {
    event.preventDefault();
    setLoading(true);

    try {
      const { data } = await api.post("/auth/password/verify-otp", {
        otp: form.otp,
      });

      if (data.user) {
        setSessionUser(data.user);
      }

      toast.success(data.message || "Password changed successfully.");
      navigate(getHomePath(data.user?.role || user?.role), { replace: true });
    } catch (error) {
      toast.error(error.response?.data?.message || "Unable to change password.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="flex min-h-screen items-center justify-center bg-[linear-gradient(180deg,#f7fcff_0%,#eef8ff_100%)] px-4 py-8 text-slate-950">
      <section className="w-full max-w-md rounded-2xl border border-white/80 bg-white p-6 shadow-2xl shadow-blue-950/12 ring-1 ring-blue-100/70 sm:p-8">
        <div className="flex items-center gap-4">
          <img
            src={brandLogo}
            alt="AdnatePayNest logo"
            className="h-14 w-14 rounded-full bg-white object-cover p-1 shadow-sm ring-1 ring-bank-card-border"
          />
          <div>
            <p className="text-sm font-black uppercase tracking-[0.2em] text-bank-eyebrow">
              Password required
            </p>
            <h1 className="mt-1 text-2xl font-black tracking-tight text-slate-950">
              Create a new password
            </h1>
          </div>
        </div>

        <p className="mt-5 text-sm font-medium leading-6 text-slate-500">
          Your temporary onboarding password must be replaced before using your account.
        </p>

        <form onSubmit={step === "details" ? sendOtp : verifyOtp} className="mt-6 space-y-5">
          {step === "details" ? (
            <>
              <label className="label-field">
                <span>Temporary Password<RequiredMark /></span>
                <div className="relative">
                  <input
                    type={visiblePasswords.current ? "text" : "password"}
                    value={form.currentPassword}
                    onChange={(event) => updateForm("currentPassword", event.target.value)}
                    className="input-field !pr-11"
                    autoComplete="current-password"
                    required
                  />
                  <button
                    type="button"
                    onClick={() => togglePasswordVisibility("current")}
                    className="absolute right-3 top-1/2 -translate-y-1/2 rounded-md p-1 text-slate-500 hover:bg-slate-100 hover:text-slate-700"
                    aria-label={visiblePasswords.current ? "Hide temporary password" : "Show temporary password"}
                    title={visiblePasswords.current ? "Hide temporary password" : "Show temporary password"}
                  >
                    {visiblePasswords.current ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>
              </label>

              <label className="label-field">
                <span>New Password<RequiredMark /></span>
                <div className="relative">
                  <input
                    type={visiblePasswords.next ? "text" : "password"}
                    value={form.newPassword}
                    onChange={(event) => updateForm("newPassword", event.target.value)}
                    className="input-field !pr-11"
                    autoComplete="new-password"
                    required
                  />
                  <button
                    type="button"
                    onClick={() => togglePasswordVisibility("next")}
                    className="absolute right-3 top-1/2 -translate-y-1/2 rounded-md p-1 text-slate-500 hover:bg-slate-100 hover:text-slate-700"
                    aria-label={visiblePasswords.next ? "Hide new password" : "Show new password"}
                    title={visiblePasswords.next ? "Hide new password" : "Show new password"}
                  >
                    {visiblePasswords.next ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>
              </label>

              <label className="label-field">
                <span>Confirm New Password<RequiredMark /></span>
                <div className="relative">
                  <input
                    type={visiblePasswords.confirm ? "text" : "password"}
                    value={form.confirmPassword}
                    onChange={(event) => updateForm("confirmPassword", event.target.value)}
                    className="input-field !pr-11"
                    autoComplete="new-password"
                    required
                  />
                  <button
                    type="button"
                    onClick={() => togglePasswordVisibility("confirm")}
                    className="absolute right-3 top-1/2 -translate-y-1/2 rounded-md p-1 text-slate-500 hover:bg-slate-100 hover:text-slate-700"
                    aria-label={visiblePasswords.confirm ? "Hide confirm password" : "Show confirm password"}
                    title={visiblePasswords.confirm ? "Hide confirm password" : "Show confirm password"}
                  >
                    {visiblePasswords.confirm ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>
              </label>
            </>
          ) : (
            <label className="label-field">
              <span>Email OTP<RequiredMark /></span>
              <input
                value={form.otp}
                onChange={(event) => updateForm("otp", event.target.value)}
                className="input-field"
                maxLength={6}
                placeholder="6 digit OTP"
                required
              />
            </label>
          )}

          <div className="flex flex-wrap gap-3">
            <button type="submit" className="btn-primary" disabled={loading}>
              {step === "details" ? <KeyRound size={18} /> : <ShieldCheck size={18} />}
              {loading ? "Please wait..." : step === "details" ? "Send OTP" : "Verify & Continue"}
            </button>
            {step === "otp" && (
              <button
                type="button"
                onClick={() => setStep("details")}
                className="btn-secondary"
                disabled={loading}
              >
                Edit Details
              </button>
            )}
          </div>
        </form>
      </section>
    </main>
  );
};

export default ForcePasswordChange;
