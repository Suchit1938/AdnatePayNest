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
    account: "",
  });
  const [verifiedPayee, setVerifiedPayee] = useState(null);
  const [message, setMessage] = useState("");
  const [isVerifying, setIsVerifying] = useState(false);
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
    setVerifiedPayee(null);
    setMessage("");
  };

  const verifyBeneficiary = async (event) => {
    event.preventDefault();
    setMessage("");

    if (!formData.account) {
      setMessage("Enter beneficiary account number.");
      toast.warning("Enter beneficiary account number.");
      return;
    }

    try {
      setIsVerifying(true);
      const { data } = await api.post("/users/beneficiaries/verify", {
        account: formData.account,
      });

      setVerifiedPayee(data.beneficiary);
      setMessage(data.message || "Payee verified. Confirm to save this payee.");
      toast.success(data.message || "Payee verified.");
    } catch (error) {
      const errorMessage = error.response?.data?.message || "Unable to verify payee.";
      setVerifiedPayee(null);
      setMessage(errorMessage);
      toast.error(errorMessage);
    } finally {
      setIsVerifying(false);
    }
  };

  const addBeneficiary = async () => {
    setMessage("");

    if (!verifiedPayee) {
      setMessage("Verify payee details before saving.");
      toast.warning("Verify payee details before saving.");
      return;
    }

    try {
      setIsSaving(true);
      const { data } = await api.post("/users/beneficiaries", {
        account: verifiedPayee.accountNumber,
        confirmed: true,
      });

      setBeneficiaries(data.beneficiaries || []);
      setFormData({
        account: "",
      });
      setVerifiedPayee(null);
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
          <form onSubmit={verifyBeneficiary} className="card-padded">
            <h2 className="text-xl font-bold text-slate-900">Add Payee</h2>

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

          {verifiedPayee && (
            <div className="mt-5 rounded-lg border border-emerald-100 bg-emerald-50 p-4">
              <p className="text-xs font-bold uppercase tracking-[0.12em] text-emerald-700">
                Verified Payee
              </p>
              <p className="mt-2 text-base font-bold text-slate-950">{verifiedPayee.name}</p>
              <p className="mt-1 text-sm text-slate-600">
                {verifiedPayee.customerId} | {verifiedPayee.accountType || "Account"}
              </p>
              <p className="mt-1 text-sm text-slate-600">
                {verifiedPayee.bankName || BANK_NAME} - {verifiedPayee.maskedAccountNumber}
              </p>
              <p className="mt-1 text-sm text-slate-600">IFSC {verifiedPayee.ifsc}</p>
            </div>
          )}

          <button
            type="submit"
            className="btn-primary mt-6 w-full"
            disabled={isVerifying || isSaving}
          >
            {isVerifying ? "Verifying..." : "Verify Payee"}
          </button>

          <button
            type="button"
            onClick={addBeneficiary}
            className="btn-primary mt-3 w-full"
            disabled={!verifiedPayee || isSaving}
          >
            {isSaving ? "Saving..." : "Confirm Add Payee"}
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
