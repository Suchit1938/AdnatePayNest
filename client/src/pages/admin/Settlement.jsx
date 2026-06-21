import DashboardLayout from "../../layouts/DashboardLayout";
import SettlementReportView from "../../components/settlement/SettlementReportView";

const AdminSettlement = () => (
  <DashboardLayout>
    <SettlementReportView mode="admin" />
  </DashboardLayout>
);

export default AdminSettlement;
