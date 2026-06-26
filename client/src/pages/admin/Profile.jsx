import { useEffect, useRef, useState } from "react";
import { BadgeCheck, IdCard, Mail, Pencil, Phone, Save, ShieldCheck, User, X } from "lucide-react";

import api from "../../api/axios";
import PageContent from "../../components/ui/PageContent";
import PageHeader from "../../components/ui/PageHeader";
import SectionCard from "../../components/ui/SectionCard";
import { useToast } from "../../components/ui/useToast";
import DashboardLayout from "../../layouts/DashboardLayout";
import { useAuth } from "../../context/useAuth";

const RequiredMark = () => <span className="ml-1 text-sm font-black text-red-600">*</span>;

const AdminProfile = () => {
  const toast = useToast();
  const { user, setSessionUser } = useAuth();
  const initialUserRef = useRef(user);
  const setSessionUserRef = useRef(setSessionUser);
  const [profileUser, setProfileUser] = useState(user);
  const [draftProfile, setDraftProfile] = useState(null);
  const [isEditing, setIsEditing] = useState(false);
  const [message, setMessage] = useState("");
  const [messageType, setMessageType] = useState("success");
  const [fieldErrors, setFieldErrors] = useState({});

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

  const profile = draftProfile || {
    name: profileUser?.name || "",
    email: profileUser?.email || "",
    role: profileUser?.role || "admin",
    employeeId: profileUser?.employeeId || profileUser?.id || "",
    phone: profileUser?.phone || "",
    address: profileUser?.address || "",
    status: profileUser?.status || "active",
  };

  const handleChange = (event) => {
    const { name, value } = event.target;
    setDraftProfile((current) => ({ ...(current || profile), [name]: value }));
    setFieldErrors((currentErrors) => {
      const nextErrors = { ...currentErrors };
      const trimmedValue = String(value || "").trim();

      if (name === "name") {
        nextErrors.name = /^[A-Za-z ]{2,}$/.test(trimmedValue)
          ? ""
          : "Name must contain only letters and spaces.";
      }

      if (name === "phone") {
        nextErrors.phone =
          !trimmedValue || /^[6-9]\d{9}$/.test(trimmedValue)
            ? ""
            : "Enter a valid 10 digit Indian mobile number.";
      }

      return nextErrors;
    });
  };

  const validateProfile = () => {
    const errors = {};
    const name = String(profile.name || "").trim();
    const phone = String(profile.phone || "").trim();

    if (!/^[A-Za-z ]{2,}$/.test(name)) {
      errors.name = "Name must contain only letters and spaces.";
    }

    if (phone && !/^[6-9]\d{9}$/.test(phone)) {
      errors.phone = "Enter a valid 10 digit Indian mobile number.";
    }

    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const saveProfile = async (event) => {
    event.preventDefault();

    if (!validateProfile()) {
      setMessageType("error");
      setMessage("Please fix the highlighted fields before saving.");
      toast.warning("Please fix the highlighted fields before saving.");
      return;
    }

    try {
      const { data } = await api.patch("/users/me", {
        name: profile.name,
        phone: profile.phone,
        address: profile.address,
      });

      setProfileUser(data.user);
      setSessionUser(data.user);
      setDraftProfile(null);
      setIsEditing(false);
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

  return (
    <DashboardLayout>
      <PageContent>
        <PageHeader
          eyebrow="Admin / Profile"
          title="Profile"
          subtitle="Manage your administrator details and account contact information."
        >
          <button
            type="button"
            onClick={() => {
              setIsEditing((current) => !current);
              setDraftProfile(isEditing ? null : profile);
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
                {profile.name ? profile.name.split(" ").map(n => n[0]).join("").toUpperCase().slice(0, 2) : "A"}
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-xl font-bold text-slate-900">{profile.name}</h2>
                  <span className="inline-flex items-center rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-semibold text-emerald-700 ring-1 ring-emerald-100">
                    {profile.role || "Admin"}
                  </span>
                </div>
                <p className="text-sm font-semibold text-slate-500 mt-1">{profile.email}</p>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4 md:flex md:items-center md:gap-8 border-t border-slate-100 pt-4 md:border-t-0 md:pt-0">
              <div>
                <p className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400">Status</p>
                <p className="text-sm font-bold text-slate-800 mt-0.5 capitalize">{profile.status || "active"}</p>
              </div>
              <div>
                <p className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400">Phone</p>
                <p className="text-sm font-bold text-slate-800 mt-0.5">{profile.phone || "Not set"}</p>
              </div>
            </div>
          </div>
        </div>

        <SectionCard
          title="Admin Profile Details"
          subtitle="Manage contact details while protected identity fields stay fixed."
        >
          <form onSubmit={saveProfile}>
            {message && (
              <div className={`${messageType === "success" ? "alert-success" : "alert-error"} mb-6`}>
                {message}
              </div>
            )}

            <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
              <label className="label-field">
                <span>Full Name<RequiredMark /></span>
                <div className="relative">
                  <User className="pointer-events-none absolute left-4 top-5 text-slate-400" size={18} />
                  <input
                    name="name"
                    value={profile.name}
                    onChange={handleChange}
                    disabled={!isEditing}
                    className="input-field !pl-11"
                  />
                  {fieldErrors.name && (
                    <p className="mt-1 text-sm font-semibold text-red-600">
                      {fieldErrors.name}
                    </p>
                  )}
                </div>
              </label>

              <label className="label-field">
                Email ID
                <div className="relative">
                  <Mail className="pointer-events-none absolute left-4 top-5 text-slate-400" size={18} />
                  <input value={profile.email} disabled className="input-field !pl-11" />
                </div>
              </label>

              <label className="label-field">
                Admin ID
                <div className="relative">
                  <IdCard className="pointer-events-none absolute left-4 top-5 text-slate-400" size={18} />
                  <input value={profile.employeeId || "System assigned"} disabled className="input-field !pl-11" />
                </div>
              </label>

              <label className="label-field">
                Phone Number
                <div className="relative">
                  <Phone className="pointer-events-none absolute left-4 top-5 text-slate-400" size={18} />
                  <input
                    name="phone"
                    value={profile.phone}
                    onChange={handleChange}
                    disabled={!isEditing}
                    className="input-field !pl-11"
                    placeholder="10 digit mobile number"
                  />
                  {fieldErrors.phone && (
                    <p className="mt-1 text-sm font-semibold text-red-600">
                      {fieldErrors.phone}
                    </p>
                  )}
                </div>
              </label>

              <label className="label-field md:col-span-2">
                Address
                <input
                  name="address"
                  value={profile.address}
                  onChange={handleChange}
                  disabled={!isEditing}
                  className="input-field"
                  placeholder="Admin contact address"
                />
              </label>
            </div>

            {isEditing && (
              <button type="submit" className="btn-primary mt-6">
                <Save size={18} />
                Save Changes
              </button>
            )}
          </form>
        </SectionCard>
      </PageContent>
    </DashboardLayout>
  );
};

export default AdminProfile;
