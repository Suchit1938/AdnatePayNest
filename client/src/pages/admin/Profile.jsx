import { useEffect, useRef, useState } from "react";
import { BadgeCheck, IdCard, Mail, Pencil, Phone, Save, ShieldCheck, User, X } from "lucide-react";

import api from "../../api/axios";
import StatsCard from "../../components/dashboard/StatsCard";
import PageContent from "../../components/ui/PageContent";
import PageHeader from "../../components/ui/PageHeader";
import SectionCard from "../../components/ui/SectionCard";
import { useToast } from "../../components/ui/ToastContext";
import DashboardLayout from "../../layouts/DashboardLayout";
import { useAuth } from "../../context/useAuth";

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
          subtitle="Your administrator profile is loaded from the database."
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

        <div className="stat-grid">
          <StatsCard
            title="Administrator"
            value={profile.name.split(" ")[0] || "Admin"}
            icon={ShieldCheck}
            accent="bg-blue-500"
            iconTone="bg-blue-50 text-blue-600"
            footer={{ text: profile.email }}
          />
          <StatsCard
            title="Role"
            value="Admin"
            icon={BadgeCheck}
            accent="bg-emerald-500"
            iconTone="bg-emerald-50 text-emerald-600"
            badge={{ text: profile.status, tone: profile.status === "active" ? "success" : "warning" }}
          />
          <StatsCard
            title="Contact"
            value={profile.phone || "Not set"}
            icon={Phone}
            accent="bg-amber-500"
            iconTone="bg-amber-50 text-amber-600"
            footer={{ text: profile.address || "Address not set" }}
          />
        </div>

        <SectionCard
          title="Admin Profile Details"
          subtitle="Manage contact details while protected identity fields stay fixed."
          className="max-w-5xl"
        >
          <form onSubmit={saveProfile}>
            {message && (
              <div className={`${messageType === "success" ? "alert-success" : "alert-error"} mb-6`}>
                {message}
              </div>
            )}

            <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
              <label className="label-field">
                Full Name
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
