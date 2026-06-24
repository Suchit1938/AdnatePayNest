import { useEffect, useMemo, useRef, useState } from "react";
import {
  BadgeCheck,
  Building2,
  Eye,
  EyeOff,
  IdCard,
  KeyRound,
  Pencil,
  Phone,
  Save,
  ShieldCheck,
  User,
  X,
} from "lucide-react";
import api from "../../api/axios";
import PageContent from "../../components/ui/PageContent";
import PageHeader from "../../components/ui/PageHeader";
import SectionCard from "../../components/ui/SectionCard";
import { useToast } from "../../components/ui/useToast";
import DashboardLayout from "../../layouts/DashboardLayout";
import { useAuth } from "../../context/useAuth";
import { BANK_NAME } from "../../utils/format";

const Profile = () => {
  const toast = useToast();
  const { user, setSessionUser } = useAuth();
  const initialUserRef = useRef(user);
  const setSessionUserRef = useRef(setSessionUser);
  const [profileUser, setProfileUser] = useState(user);
  const [draftProfile, setDraftProfile] = useState(null);
  const [isEditing, setIsEditing] = useState(false);
  const [message, setMessage] = useState("");
  const [messageType, setMessageType] = useState("success");
  const [passwordStep, setPasswordStep] = useState("details");
  const [passwordForm, setPasswordForm] = useState({
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
  const [passwordLoading, setPasswordLoading] = useState(false);

  useEffect(() => {
    let isMounted = true;

    api
      .get("/users/me")
      .then(({ data }) => {
        if (isMounted) {
          setProfileUser(data.user);
          setSessionUserRef.current(data.user);
        }
      })
      .catch(() => {
        if (isMounted) {
          setProfileUser(initialUserRef.current);
        }
      });

    return () => {
      isMounted = false;
    };
  }, []);

  const profileFromUser = useMemo(() => {
    if (!profileUser) {
      return {
        name: "",
        email: "",
        customerId: "",
        panNumber: "",
        aadhaarNumber: "",
        accountType: "",
        bankName: BANK_NAME,
        ifsc: "",
        phone: "",
        address: "",
      };
    }

    const primaryAccount = profileUser.account || profileUser.accounts?.[0] || {};

    return {
      name: profileUser.name || "",
      email: profileUser.email || "",
      customerId: profileUser.customerId || "",
      panNumber: profileUser.panNumber || "",
      aadhaarNumber: profileUser.aadhaarNumber || "",
      accountType: profileUser.accountType || primaryAccount.accountType || "",
      bankName: primaryAccount.bankName || BANK_NAME,
      ifsc: primaryAccount.ifsc || "",
      phone: profileUser.phone || "",
      address: profileUser.address || "",
    };
  }, [profileUser]);
  const profile = isEditing ? draftProfile || profileFromUser : profileFromUser;

  const handleChange = (event) => {
    const { name, value } = event.target;
    setDraftProfile((current) => ({ ...(current || profileFromUser), [name]: value }));
  };

  const updatePasswordForm = (field, value) => {
    setPasswordForm((current) => ({ ...current, [field]: value }));
  };

  const togglePasswordVisibility = (field) => {
    setVisiblePasswords((current) => ({
      ...current,
      [field]: !current[field],
    }));
  };

  const sendPasswordOtp = async (event) => {
    event.preventDefault();

    if (passwordForm.newPassword !== passwordForm.confirmPassword) {
      toast.warning("New password and confirm password must match.");
      return;
    }

    setPasswordLoading(true);

    try {
      const { data } = await api.post("/auth/password/send-otp", {
        currentPassword: passwordForm.currentPassword,
        newPassword: passwordForm.newPassword,
      });

      toast.success(data.message || "OTP sent to your registered email.");
      setPasswordStep("otp");
    } catch (error) {
      toast.error(error.response?.data?.message || "Unable to send OTP.");
    } finally {
      setPasswordLoading(false);
    }
  };

  const verifyPasswordOtp = async (event) => {
    event.preventDefault();
    setPasswordLoading(true);

    try {
      const { data } = await api.post("/auth/password/verify-otp", {
        otp: passwordForm.otp,
      });

      toast.success(data.message || "Password changed successfully.");
      setPasswordForm({
        currentPassword: "",
        newPassword: "",
        confirmPassword: "",
        otp: "",
      });
      setPasswordStep("details");
    } catch (error) {
      toast.error(error.response?.data?.message || "Unable to change password.");
    } finally {
      setPasswordLoading(false);
    }
  };

  const saveProfile = async (event) => {
    event.preventDefault();

    try {
      const { data } = await api.patch("/users/me", {
        name: profile.name,
        phone: profile.phone,
        address: profile.address,
      });

      setProfileUser(data.user);
      setSessionUser(data.user);
      setIsEditing(false);
      setDraftProfile(null);
      setMessageType("success");
      setMessage(data.message || "Profile updated successfully.");
      toast.success(data.message || "Profile updated successfully.");
    } catch (error) {
      const errorMessage =
        error.response?.data?.message || "Unable to update profile.";
      setMessageType("error");
      setMessage(errorMessage);
      toast.error(errorMessage);
    }
  };

  const detailGroups = [
    {
      title: "Editable Contact Details",
      fields: [
        { key: "name", label: "Full Name", editable: true },
        { key: "phone", label: "Phone Number", editable: true },
        { key: "address", label: "Address", editable: true, wide: true },
      ],
    },
    {
      title: "Verified Identity",
      fields: [
        { key: "customerId", label: "Customer ID" },
        { key: "email", label: "Email ID" },
        { key: "panNumber", label: "PAN Number" },
        { key: "aadhaarNumber", label: "Aadhaar Number" },
      ],
    },
    {
      title: "Bank Account Details",
      fields: [
        { key: "accountType", label: "Account Type" },
        { key: "bankName", label: "Bank Name" },
        { key: "ifsc", label: "IFSC" },
      ],
    },
  ];

  return (
    <DashboardLayout>
      <PageContent>
        <PageHeader title="Profile" subtitle="Manage your personal details, contact information, and account identity.">
          <button
            type="button"
            onClick={() => {
              setIsEditing((current) => {
                if (!current) {
                  setDraftProfile(profileFromUser);
                } else {
                  setDraftProfile(null);
                }

                return !current;
              });
              setMessage("");
            }}
            className={isEditing ? "btn-secondary" : "btn-primary"}
          >
            {isEditing ? <X size={18} /> : <Pencil size={18} />}
            {isEditing ? "Cancel" : "Edit Profile"}
          </button>
        </PageHeader>

        <div className="rounded-2xl border border-bank-card-border bg-white p-6 shadow-sm">
          <div className="flex flex-col gap-6 md:flex-row md:items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="flex h-16 w-16 items-center justify-center rounded-full bg-bank-sidebar text-2xl font-bold text-white shadow-md">
                {profile.name ? profile.name.split(" ").map(n => n[0]).join("").toUpperCase().slice(0, 2) : "U"}
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-xl font-bold text-slate-900">{profile.name}</h2>
                  <span className="inline-flex items-center rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-semibold text-emerald-700 ring-1 ring-emerald-100">
                    {profile.accountType || "Customer"}
                  </span>
                </div>
                <p className="text-sm font-semibold text-slate-500 mt-1">{profile.email}</p>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4 md:flex md:items-center md:gap-8 border-t border-slate-100 pt-4 md:border-t-0 md:pt-0">
              <div>
                <p className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400">Customer ID</p>
                <p className="text-sm font-bold text-slate-800 mt-0.5">{profile.customerId || "—"}</p>
              </div>
              <div>
                <p className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400">Phone</p>
                <p className="text-sm font-bold text-slate-800 mt-0.5">{profile.phone || "—"}</p>
              </div>
              <div>
                <p className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400">Bank</p>
                <p className="text-sm font-bold text-slate-800 mt-0.5">{profile.bankName || BANK_NAME}</p>
              </div>
            </div>
          </div>
        </div>

        <SectionCard
          title="Personal Details"
          subtitle="Review verified identity details and update your contact information."
        >
          <form onSubmit={saveProfile}>
            {message && (
              <div className={`${messageType === "success" ? "alert-success" : "alert-error"} mb-6`}>
                {message}
              </div>
            )}

            <div className="space-y-6">
              {detailGroups.map((group) => (
                <section
                  key={group.title}
                  className="rounded-xl border border-bank-card-border bg-bank-surface/60 p-4"
                >
                  <div className="mb-4 flex items-center gap-2">
                    <IdCard size={18} className="text-bank-eyebrow" />
                    <h2 className="text-base font-bold text-slate-950">{group.title}</h2>
                  </div>

                  <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
                    {group.fields.map((field) => (
                      <label
                        key={field.key}
                        className={`label-field ${field.wide ? "md:col-span-2" : ""}`}
                      >
                        {field.label}
                        <input
                          name={field.key}
                          value={profile[field.key] || ""}
                          onChange={handleChange}
                          disabled={!isEditing || !field.editable}
                          className="input-field"
                        />
                      </label>
                    ))}
                  </div>
                </section>
              ))}
            </div>

            {isEditing && (
              <button type="submit" className="btn-primary mt-6">
                <Save size={18} />
                Save Changes
              </button>
            )}
          </form>
        </SectionCard>

        <SectionCard
          title="Change Password"
          subtitle="Verify the password change with an OTP sent to your registered email."
        >
          <form
            onSubmit={passwordStep === "details" ? sendPasswordOtp : verifyPasswordOtp}
            className="space-y-5"
          >
            <section className="rounded-xl border border-bank-card-border bg-bank-surface/60 p-4">
              <div className="mb-4 flex items-center gap-2">
                {passwordStep === "details" ? (
                  <KeyRound size={18} className="text-bank-eyebrow" />
                ) : (
                  <ShieldCheck size={18} className="text-bank-eyebrow" />
                )}
                <h2 className="text-base font-bold text-slate-950">
                  {passwordStep === "details" ? "Password Details" : "OTP Verification"}
                </h2>
              </div>

              <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
                {passwordStep === "details" ? (
                  <>
                    <label className="label-field">
                      Current Password
                      <div className="relative">
                        <input
                          type={visiblePasswords.current ? "text" : "password"}
                          value={passwordForm.currentPassword}
                          onChange={(event) =>
                            updatePasswordForm("currentPassword", event.target.value)
                          }
                          className="input-field !pr-11"
                          required
                        />
                        <button
                          type="button"
                          onClick={() => togglePasswordVisibility("current")}
                          className="absolute right-3 top-1/2 -translate-y-1/2 rounded-md p-1 text-slate-500 hover:bg-slate-100 hover:text-slate-700"
                          aria-label={visiblePasswords.current ? "Hide current password" : "Show current password"}
                          title={visiblePasswords.current ? "Hide current password" : "Show current password"}
                        >
                          {visiblePasswords.current ? <EyeOff size={18} /> : <Eye size={18} />}
                        </button>
                      </div>
                    </label>
                    <label className="label-field">
                      New Password
                      <div className="relative">
                        <input
                          type={visiblePasswords.next ? "text" : "password"}
                          value={passwordForm.newPassword}
                          onChange={(event) =>
                            updatePasswordForm("newPassword", event.target.value)
                          }
                          className="input-field !pr-11"
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
                      Confirm New Password
                      <div className="relative">
                        <input
                          type={visiblePasswords.confirm ? "text" : "password"}
                          value={passwordForm.confirmPassword}
                          onChange={(event) =>
                            updatePasswordForm("confirmPassword", event.target.value)
                          }
                          className="input-field !pr-11"
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
                    Email OTP
                    <input
                      value={passwordForm.otp}
                      onChange={(event) => updatePasswordForm("otp", event.target.value)}
                      className="input-field"
                      maxLength={6}
                      placeholder="6 digit OTP"
                      required
                    />
                  </label>
                )}
              </div>
            </section>

            <div className="flex flex-wrap gap-3">
              <button type="submit" className="btn-primary" disabled={passwordLoading}>
                {passwordStep === "details" ? <KeyRound size={18} /> : <ShieldCheck size={18} />}
                {passwordLoading
                  ? "Please wait..."
                  : passwordStep === "details"
                    ? "Send OTP"
                    : "Verify & Change Password"}
              </button>
              {passwordStep === "otp" && (
                <button
                  type="button"
                  onClick={() => setPasswordStep("details")}
                  className="btn-secondary"
                  disabled={passwordLoading}
                >
                  Edit Password Details
                </button>
              )}
            </div>
          </form>
        </SectionCard>
      </PageContent>
    </DashboardLayout>
  );
};

export default Profile;
