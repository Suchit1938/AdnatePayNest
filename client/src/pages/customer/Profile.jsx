import { useEffect, useMemo, useRef, useState } from "react";
import { BadgeCheck, Building2, IdCard, Pencil, Phone, Save, User, X } from "lucide-react";
import api from "../../api/axios";
import StatsCard from "../../components/dashboard/StatsCard";
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
        <PageHeader title="Profile" subtitle="Manage your personal customer details.">
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

        <div className="stat-grid">
          <StatsCard
            title="Profile ID"
            value={profile.customerId || "—"}
            icon={BadgeCheck}
            accent="bg-blue-500"
            iconTone="bg-blue-50 text-blue-600"
            badge={{ text: profile.accountType || "Account holder", tone: "neutral" }}
          />
          <StatsCard
            title="Account Holder"
            value={profile.name.split(" ")[0] || "—"}
            icon={User}
            accent="bg-emerald-500"
            iconTone="bg-emerald-50 text-emerald-600"
            footer={{ text: profile.email }}
          />
          <StatsCard
            title="Bank"
            value={profile.bankName}
            icon={Building2}
            accent="bg-violet-500"
            iconTone="bg-violet-50 text-violet-600"
            footer={{ text: profile.ifsc ? `IFSC ${profile.ifsc}` : "IFSC not set" }}
          />
          <StatsCard
            title="Phone"
            value={profile.phone || "—"}
            icon={Phone}
            accent="bg-amber-500"
            iconTone="bg-amber-50 text-amber-600"
            footer={{ text: profile.panNumber ? `PAN ${profile.panNumber}` : "PAN not set" }}
          />
        </div>

        <SectionCard
          title="Database Profile"
          subtitle="Your profile is loaded from the database each time this page opens."
          className="max-w-5xl"
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
      </PageContent>
    </DashboardLayout>
  );
};

export default Profile;
