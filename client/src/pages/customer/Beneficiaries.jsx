import { useEffect, useState } from "react";
import api from "../../api/axios";
import PageContent from "../../components/ui/PageContent";
import PageHeader from "../../components/ui/PageHeader";
import { useToast } from "../../components/ui/useToast";
import DashboardLayout from "../../layouts/DashboardLayout";
import { BANK_NAME, maskAccountNumber } from "../../data/mockData";

const Beneficiaries = () => {
  const toast = useToast();
  const [beneficiaries, setBeneficiaries] = useState([]);
  const [formData, setFormData] = useState({
    name: "",
    account: "",
  });
  const [message, setMessage] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    api
      .get("/users/beneficiaries")
      .then(({ data }) => setBeneficiaries(data.beneficiaries))
      .catch(() => {
        setMessage("Unable to load beneficiaries.");
        toast.error("Unable to load beneficiaries.");
      });
  }, [toast]);

  const handleChange = (event) => {
    const { name, value } = event.target;
    setFormData((current) => ({ ...current, [name]: value }));
  };

  const addBeneficiary = async (event) => {
    event.preventDefault();
    setMessage("");

    if (!formData.name || !formData.account) {
      setMessage("Enter beneficiary name and account number.");
      toast.warning("Enter beneficiary name and account number.");
      return;
    }

    try {
      setIsSaving(true);
      const { data } = await api.post("/users/beneficiaries", {
        name: formData.name,
        account: formData.account,
      });

      setBeneficiaries(data.beneficiaries || []);
      setFormData({
        name: "",
        account: "",
      });
      setMessage(data.message || "Beneficiary added.");
      toast.success(data.message || "Beneficiary added.");
    } catch (error) {
      const errorMessage = error.response?.data?.message || "Unable to add beneficiary.";
      setMessage(errorMessage);
      toast.error(errorMessage);
    } finally {
      setIsSaving(false);
    }
  };

  const removeBeneficiary = async (id) => {
    setMessage("");

    try {
      const { data } = await api.delete(`/users/beneficiaries/${id}`);
      setBeneficiaries(data.beneficiaries || []);
      setMessage(data.message || "Beneficiary removed.");
      toast.success(data.message || "Beneficiary removed.");
    } catch (error) {
      const errorMessage =
        error.response?.data?.message || "Unable to remove beneficiary.";
      setMessage(errorMessage);
      toast.error(errorMessage);
    }
  };

  return (
    <DashboardLayout>
      <PageContent>
        <PageHeader
          title="Payees"
          subtitle={`Add and remove saved ${BANK_NAME} transfer payees.`}
        />

        {message && <div className="alert-info">{message}</div>}

        <section className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          <form onSubmit={addBeneficiary} className="card-padded">
            <h2 className="text-xl font-bold text-slate-900">Add Payee</h2>

          <label className="label-field mt-5">
            Name
            <input
              name="name"
              value={formData.name}
              onChange={handleChange}
              className="input-field"
              placeholder="Full name"
            />
          </label>

          <label className="label-field mt-4">
            Account Number
            <input
              name="account"
              value={formData.account}
              onChange={handleChange}
              className="input-field"
              placeholder="Adnate Bank account number"
            />
          </label>

          <button
            type="submit"
            className="btn-primary mt-6 w-full"
            disabled={isSaving}
          >
            {isSaving ? "Adding..." : "Add Beneficiary"}
          </button>
        </form>

          <div className="card-padded lg:col-span-2">
            <h2 className="text-xl font-bold text-slate-900">Saved Payees</h2>
            <p className="mt-1 text-sm text-slate-500">
              Manage beneficiaries available for fund transfers.
            </p>

            <div className="mt-5 space-y-4">
              {beneficiaries.map((beneficiary) => {
              const accounts = beneficiary.accounts?.length
                ? beneficiary.accounts
                : [
                    {
                      accountNumber: beneficiary.account,
                      accountType: beneficiary.accountType,
                    },
                  ].filter((account) => account.accountNumber);

              return (
                <div
                  key={beneficiary.id}
                  className="activity-item items-center justify-between"
                >
                  <div>
                    <p className="font-bold text-slate-900">{beneficiary.name}</p>
                    <p className="mt-1 text-sm text-slate-500">
                      {beneficiary.customerId}
                    </p>
                    <div className="mt-2 space-y-1">
                      {accounts.map((account) => (
                        <p
                          key={account.accountNumber}
                          className="text-sm text-slate-500"
                        >
                          {BANK_NAME} - {account.accountType || "Account"} -{" "}
                          {maskAccountNumber(account.accountNumber)}
                        </p>
                      ))}
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => removeBeneficiary(beneficiary.id)}
                    className="btn-danger-soft shrink-0"
                  >
                    Remove
                  </button>
                </div>
              );
            })}

              {beneficiaries.length === 0 && (
                <div className="empty-state">No beneficiaries added yet.</div>
              )}
            </div>
          </div>
        </section>
      </PageContent>
    </DashboardLayout>
  );
};

export default Beneficiaries;
