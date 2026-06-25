import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeftRight, Wallet } from "lucide-react";
import api from "../../api/axios";
import StatsCard from "../../components/dashboard/StatsCard";
import PageContent from "../../components/ui/PageContent";
import PageHeader from "../../components/ui/PageHeader";
import SectionCard from "../../components/ui/SectionCard";
import { useToast } from "../../components/ui/useToast";
import DashboardLayout from "../../layouts/DashboardLayout";
import { BANK_NAME, formatCurrency, maskAccountNumber } from "../../data/mockData";
import { useAuth } from "../../context/useAuth";

const createTransferIdempotencyKey = () => {
  if (window.crypto?.randomUUID) {
    return window.crypto.randomUUID();
  }

  return `transfer-${Date.now()}-${Math.random().toString(36).slice(2)}`;
};

const TransferFunds = () => {
  const toast = useToast();
  const { setSessionUser, user } = useAuth();
  const userAccounts = useMemo(
    () =>
      user?.accounts?.length
        ? user.accounts
        : [user?.account].filter(Boolean),
    [user]
  );
  const [beneficiaries, setBeneficiaries] = useState([]);
  const [transferMode, setTransferMode] = useState("beneficiary");
  const [formData, setFormData] = useState({
    beneficiaryId: "",
    fromAccountNumber: "",
    toAccountNumber: "",
    amount: "",
    remarks: "",
  });
  const [ownFormData, setOwnFormData] = useState({
    fromAccountNumber: "",
    toAccountNumber: "",
    amount: "",
    remarks: "",
  });
  const [isTransferring, setIsTransferring] = useState(false);
  const [isOwnTransferring, setIsOwnTransferring] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const transferLocks = useRef({
    beneficiary: false,
    own: false,
  });
  const firstAccountNumber = userAccounts[0]?.accountNumber || "";

  useEffect(() => {
    api.get("/users/beneficiaries").then(({ data }) => {
      setBeneficiaries(data.beneficiaries || []);
    });
  }, []);

  const selectedBeneficiary =
    beneficiaries.find(
      (beneficiary) => String(beneficiary.id) === formData.beneficiaryId
    ) || beneficiaries[0];
  const selectedBeneficiaryAccounts = selectedBeneficiary?.accounts?.length
    ? selectedBeneficiary.accounts
    : [{ accountNumber: selectedBeneficiary?.account, accountType: selectedBeneficiary?.accountType }].filter(
        (account) => account.accountNumber
      );
  const effectiveFormData = {
    ...formData,
    beneficiaryId: String(selectedBeneficiary?.id ?? ""),
    fromAccountNumber: userAccounts.some(
      (account) => account.accountNumber === formData.fromAccountNumber
    )
      ? formData.fromAccountNumber
      : firstAccountNumber,
    toAccountNumber: selectedBeneficiaryAccounts.some(
      (account) => account.accountNumber === formData.toAccountNumber
    )
      ? formData.toAccountNumber
      : selectedBeneficiaryAccounts[0]?.accountNumber || "",
  };
  const effectiveOwnFormData = {
    ...ownFormData,
    fromAccountNumber: userAccounts.some(
      (account) => account.accountNumber === ownFormData.fromAccountNumber
    )
      ? ownFormData.fromAccountNumber
      : firstAccountNumber,
    toAccountNumber: userAccounts.some(
      (account) => account.accountNumber === ownFormData.toAccountNumber
    )
      ? ownFormData.toAccountNumber
      : userAccounts.find(
          (account) => account.accountNumber !== firstAccountNumber
        )?.accountNumber || "",
  };
  const selectedFromAccount = userAccounts.find(
    (account) => account.accountNumber === effectiveFormData.fromAccountNumber
  );
  const selectedOwnFromAccount = userAccounts.find(
    (account) => account.accountNumber === effectiveOwnFormData.fromAccountNumber
  );
  const selectedOwnToAccount = userAccounts.find(
    (account) => account.accountNumber === effectiveOwnFormData.toAccountNumber
  );
  const selectedTransferLimit = Number(selectedFromAccount?.transferLimit || 0);
  const selectedBalance = Number(selectedFromAccount?.balance || 0);
  const selectedOdLimit = Number(selectedFromAccount?.overdraftLimit || 0);
  const selectedOdUsed = Number(selectedFromAccount?.overdraftUsed || 0);
  const selectedOdAvailable = Math.max(0, selectedOdLimit - selectedOdUsed);
  const beneficiaryTransferAmount = Number(formData.amount || 0);
  const overdraftNeeded = Math.max(0, beneficiaryTransferAmount - selectedBalance);
  const ownTransferAmount = Number(ownFormData.amount || 0);
  const beneficiaryAccounts = selectedBeneficiaryAccounts;

  const handleChange = (event) => {
    const { name, value } = event.target;
    setFormData((current) => {
      if (name === "beneficiaryId") {
        const beneficiary = beneficiaries.find(
          (item) => String(item.id) === value
        );
        const accounts = beneficiary?.accounts?.length
          ? beneficiary.accounts
          : [{ accountNumber: beneficiary?.account }].filter(
              (account) => account.accountNumber
            );

        return {
          ...current,
          beneficiaryId: value,
          toAccountNumber: accounts[0]?.accountNumber || "",
        };
      }

      return { ...current, [name]: value };
    });
  };

  const handleOwnChange = (event) => {
    const { name, value } = event.target;

    setOwnFormData((current) => {
      if (name === "fromAccountNumber") {
        const nextToAccount =
          current.toAccountNumber && current.toAccountNumber !== value
            ? current.toAccountNumber
            : userAccounts.find((account) => account.accountNumber !== value)?.accountNumber || "";

        return {
          ...current,
          fromAccountNumber: value,
          toAccountNumber: nextToAccount,
        };
      }

      return { ...current, [name]: value };
    });
  };

  const submitTransfer = async (event) => {
    event.preventDefault();
    if (transferLocks.current.beneficiary) return;

    setMessage("");
    setError("");

    if (
      !selectedBeneficiary ||
      !effectiveFormData.fromAccountNumber ||
      !effectiveFormData.toAccountNumber ||
      !formData.amount
    ) {
      toast.warning("Select a beneficiary, source account, destination account, and amount.");
      return;
    }

    try {
      transferLocks.current.beneficiary = true;
      setIsTransferring(true);
      const { data } = await api.post("/transfers", {
        ...effectiveFormData,
        idempotencyKey: createTransferIdempotencyKey(),
      });
      const isPendingApproval = data.transaction?.status === "pending" || data.approval;

      const successMessage = isPendingApproval
        ? `${formatCurrency(formData.amount)} is pending manager approval.`
        : `${formatCurrency(formData.amount)} transferred to ${selectedBeneficiary.name}.`;
      setMessage(successMessage);
      toast[isPendingApproval ? "info" : "success"](successMessage);
      if (!isPendingApproval) {
        const nextUser = {
          ...user,
          account: data.account,
          accounts: data.accounts,
          totalTransfers: (user?.totalTransfers || 0) + 1,
        };

        setSessionUser(nextUser);
      }
      setFormData((current) => ({ ...current, amount: "", remarks: "" }));
    } catch (transferError) {
      const errorMessage = transferError.response?.data?.message || "Transfer failed.";
      setError(errorMessage);
      toast.error(errorMessage);
    } finally {
      transferLocks.current.beneficiary = false;
      setIsTransferring(false);
    }
  };

  const submitOwnTransfer = async (event) => {
    event.preventDefault();
    if (transferLocks.current.own) return;

    setMessage("");
    setError("");

    if (userAccounts.length < 2) {
      const errorMessage = "You need at least two accounts for own account transfer.";
      setError(errorMessage);
      toast.warning(errorMessage);
      return;
    }

    if (
      !effectiveOwnFormData.fromAccountNumber ||
      !effectiveOwnFormData.toAccountNumber ||
      !ownFormData.amount
    ) {
      const errorMessage = "Select both accounts and enter an amount.";
      setError(errorMessage);
      toast.warning(errorMessage);
      return;
    }

    if (effectiveOwnFormData.fromAccountNumber === effectiveOwnFormData.toAccountNumber) {
      const errorMessage = "From and to accounts cannot be the same.";
      setError(errorMessage);
      toast.warning(errorMessage);
      return;
    }

    if (ownTransferAmount < 1) {
      const errorMessage = "Enter an amount greater than 0.";
      setError(errorMessage);
      toast.warning(errorMessage);
      return;
    }

    if (ownTransferAmount > Number(selectedOwnFromAccount?.balance || 0)) {
      const errorMessage = "Insufficient balance. OD is not available for own account transfer.";
      setError(errorMessage);
      toast.warning(errorMessage);
      return;
    }

    try {
      transferLocks.current.own = true;
      setIsOwnTransferring(true);
      const { data } = await api.post("/transfers/own-account", {
        ...effectiveOwnFormData,
        idempotencyKey: createTransferIdempotencyKey(),
      });

      const successMessage = `${formatCurrency(ownFormData.amount)} moved from ${selectedOwnFromAccount?.accountType || "account"} to ${selectedOwnToAccount?.accountType || "account"}.`;
      setMessage(successMessage);
      toast.success(successMessage);
      const nextUser = {
        ...user,
        account: data.account,
        accounts: data.accounts,
        totalTransfers: (user?.totalTransfers || 0) + 1,
      };

      setSessionUser(nextUser);
      setOwnFormData((current) => ({ ...current, amount: "", remarks: "" }));
    } catch (transferError) {
      const errorMessage =
        transferError.response?.data?.message || "Own account transfer failed.";
      setError(errorMessage);
      toast.error(errorMessage);
    } finally {
      transferLocks.current.own = false;
      setIsOwnTransferring(false);
    }
  };

  const totalBalance = userAccounts.reduce(
    (sum, account) => sum + Number(account.balance || 0),
    0
  );

  return (
    <DashboardLayout>
      <PageContent>
        <PageHeader
          title="Transfer Funds"
          subtitle={`Move funds between your accounts or to saved ${BANK_NAME} payees.`}
        />

        <div className="stat-grid">
          <StatsCard
            title="Available Balance"
            value={formatCurrency(totalBalance)}
            icon={Wallet}
            accent="bg-blue-500"
            iconTone="bg-blue-50 text-blue-600"
            badge={{ text: `${userAccounts.length} account${userAccounts.length === 1 ? "" : "s"}`, tone: "neutral" }}
          />
          <StatsCard
            title="Per Transfer Limit"
            value={selectedTransferLimit > 0 ? formatCurrency(selectedTransferLimit) : "No limit"}
            icon={ArrowLeftRight}
            accent="bg-amber-500"
            iconTone="bg-amber-50 text-amber-600"
            footer={{ text: "For the selected account" }}
          />
        </div>

        <SectionCard
          title={transferMode === "own" ? "Own Account Transfer" : "Payee Transfer"}
          subtitle={
            transferMode === "own"
              ? "Move funds instantly between your own accounts"
              : "Send funds to a saved beneficiary"
          }
        >
          {message && <div className="alert-success mb-6">{message}</div>}
          {error && <div className="alert-error mb-6">{error}</div>}

          <div className="mb-6 grid grid-cols-2 gap-2 rounded-xl bg-slate-100 p-1">
            <button
              type="button"
              onClick={() => {
                setTransferMode("beneficiary");
                setMessage("");
                setError("");
              }}
              className={`rounded-lg px-4 py-2 text-sm font-bold transition ${
                transferMode === "beneficiary"
                  ? "bg-white text-blue-700 shadow-sm"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              Beneficiary
            </button>
            <button
              type="button"
              onClick={() => {
                setTransferMode("own");
                setMessage("");
                setError("");
              }}
              className={`rounded-lg px-4 py-2 text-sm font-bold transition ${
                transferMode === "own"
                  ? "bg-white text-blue-700 shadow-sm"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              Own Account
            </button>
          </div>

          {transferMode === "beneficiary" ? (
            <form onSubmit={submitTransfer} className="grid grid-cols-1 gap-x-5 gap-y-5 lg:grid-cols-2">

        <label className="label-field">
          From Account
          <select
            name="fromAccountNumber"
            value={effectiveFormData.fromAccountNumber}
            onChange={handleChange}
            className="input-field"
          >
            {userAccounts.map((account) => (
              <option key={account.accountNumber} value={account.accountNumber}>
                {account.accountType} - {maskAccountNumber(account.accountNumber)} -{" "}
                {formatCurrency(account.balance || 0)}
                {account.transferLimit
                  ? ` - Limit ${formatCurrency(account.transferLimit)}`
                  : ""}
              </option>
            ))}
          </select>
          {selectedTransferLimit > 0 && (
            <span className="mt-2 block text-xs font-semibold text-slate-500">
              Per transfer limit: {formatCurrency(selectedTransferLimit)}. Higher amounts need manager approval.
            </span>
          )}
        </label>

        {selectedFromAccount && (
          <div className="rounded-xl border border-blue-100 bg-blue-50 p-4 text-sm text-blue-900 lg:col-span-2">
            <div className="grid gap-3 sm:grid-cols-3">
              <div>
                <p className="font-semibold">Balance (₹)</p>
                <p className="mt-1 text-lg font-bold">{formatCurrency(selectedBalance)}</p>
              </div>
              <div>
                <p className="font-semibold">OD Available (₹)</p>
                <p className="mt-1 text-lg font-bold">{formatCurrency(selectedOdAvailable)}</p>
              </div>
              <div>
                <p className="font-semibold">OD Uses (/month)</p>
                <p className="mt-1 text-lg font-bold">
                  {selectedFromAccount.odCountThisMonth || 0} / {selectedFromAccount.odMonthlyUseLimit ?? 3}
                </p>
              </div>
            </div>
            {beneficiaryTransferAmount > 0 && (
              <p className="mt-3 font-semibold">
                {overdraftNeeded > 0
                  ? `${formatCurrency(overdraftNeeded)} will use OD from this ${selectedFromAccount.accountType} account.`
                  : "This transfer can be covered by the selected account balance."}
              </p>
            )}
            {selectedFromAccount.odBlocked && (
              <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 font-semibold text-red-700">
                OD is blocked for this account until the next monthly reset.
              </p>
            )}
          </div>
        )}

        <label className="label-field">
          Beneficiary
          <select
            name="beneficiaryId"
            value={effectiveFormData.beneficiaryId}
            onChange={handleChange}
            className="input-field"
            disabled={beneficiaries.length === 0}
          >
            {beneficiaries.length === 0 && (
              <option value="">No saved beneficiaries</option>
            )}
            {beneficiaries.map((beneficiary) => (
              <option key={beneficiary.id} value={beneficiary.id}>
                {beneficiary.name} - {beneficiary.customerId}
              </option>
            ))}
          </select>
        </label>

        <label className="label-field">
          Beneficiary Account
          <select
            name="toAccountNumber"
            value={effectiveFormData.toAccountNumber}
            onChange={handleChange}
            className="input-field"
            disabled={beneficiaryAccounts.length === 0}
          >
            {beneficiaryAccounts.length === 0 && (
              <option value="">No beneficiary account selected</option>
            )}
            {beneficiaryAccounts.map((account) => (
              <option key={account.accountNumber} value={account.accountNumber}>
                {account.accountType || "Account"} - {maskAccountNumber(account.accountNumber)}
              </option>
            ))}
          </select>
        </label>

        <label className="label-field">
          Amount
          <input
            name="amount"
            type="number"
            min="1"
            value={formData.amount}
            onChange={handleChange}
            className="input-field"
            placeholder="Enter amount"
          />
        </label>

        <label className="label-field lg:col-span-2">
          Remarks
          <input
            name="remarks"
            value={formData.remarks}
            onChange={handleChange}
            className="input-field"
            placeholder="Optional note"
          />
        </label>

            <button
              type="submit"
              className="btn-primary w-full lg:col-span-2 lg:w-fit"
              disabled={beneficiaries.length === 0 || isTransferring}
            >
              {isTransferring ? "Processing..." : "Send Transfer Request"}
            </button>
          </form>
          ) : (
            <form onSubmit={submitOwnTransfer} className="grid grid-cols-1 gap-x-5 gap-y-5 lg:grid-cols-2">
              {userAccounts.length < 2 && (
                <div className="alert-error lg:col-span-2">
                  You need at least two accounts to transfer money between your own accounts.
                </div>
              )}

              <label className="label-field">
                From Account
                <select
                  name="fromAccountNumber"
                  value={effectiveOwnFormData.fromAccountNumber}
                  onChange={handleOwnChange}
                  className="input-field"
                  disabled={userAccounts.length < 2}
                >
                  {userAccounts.map((account) => (
                    <option key={account.accountNumber} value={account.accountNumber}>
                      {account.accountType} - {maskAccountNumber(account.accountNumber)} -{" "}
                      {formatCurrency(account.balance || 0)}
                    </option>
                  ))}
                </select>
              </label>

              <label className="label-field">
                To Account
                <select
                  name="toAccountNumber"
                  value={effectiveOwnFormData.toAccountNumber}
                  onChange={handleOwnChange}
                  className="input-field"
                  disabled={userAccounts.length < 2}
                >
                  {userAccounts
                    .filter((account) => account.accountNumber !== effectiveOwnFormData.fromAccountNumber)
                    .map((account) => (
                      <option key={account.accountNumber} value={account.accountNumber}>
                        {account.accountType} - {maskAccountNumber(account.accountNumber)} -{" "}
                        {formatCurrency(account.balance || 0)}
                      </option>
                    ))}
                </select>
              </label>

              <label className="label-field">
                Amount
                <input
                  name="amount"
                  type="number"
                  min="1"
                  value={ownFormData.amount}
                  onChange={handleOwnChange}
                  className="input-field"
                  placeholder="Enter amount"
                  disabled={userAccounts.length < 2}
                />
              </label>

              {selectedOwnFromAccount && selectedOwnToAccount && ownTransferAmount > 0 && (
                <div className="rounded-xl border border-blue-100 bg-blue-50 p-4 text-sm text-blue-900 lg:col-span-2">
                  <p className="font-bold">Transfer Preview</p>
                  <div className="mt-3 grid gap-3 sm:grid-cols-2">
                    <div>
                      <p className="font-semibold">{selectedOwnFromAccount.accountType} after transfer</p>
                      <p className="mt-1 text-lg font-bold">
                        {formatCurrency(
                          Math.max(0, Number(selectedOwnFromAccount.balance || 0) - ownTransferAmount)
                        )}
                      </p>
                    </div>
                    <div>
                      <p className="font-semibold">{selectedOwnToAccount.accountType} after transfer</p>
                      <p className="mt-1 text-lg font-bold">
                        {formatCurrency(Number(selectedOwnToAccount.balance || 0) + ownTransferAmount)}
                      </p>
                    </div>
                  </div>
                  <p className="mt-3 font-semibold">
                    OD and manager approval are not applied to own account transfers.
                  </p>
                </div>
              )}

              <label className="label-field">
                Remarks
                <input
                  name="remarks"
                  value={ownFormData.remarks}
                  onChange={handleOwnChange}
                  className="input-field"
                  placeholder="Optional note"
                  disabled={userAccounts.length < 2}
                />
              </label>

              <button
                type="submit"
                className="btn-primary w-full lg:col-span-2 lg:w-fit"
                disabled={userAccounts.length < 2 || isOwnTransferring}
              >
                {isOwnTransferring ? "Processing..." : "Transfer Between Own Accounts"}
              </button>
            </form>
          )}
        </SectionCard>
      </PageContent>
    </DashboardLayout>
  );
};

export default TransferFunds;
