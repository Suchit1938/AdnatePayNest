import { BrowserRouter, Navigate, Routes, Route } from "react-router-dom";

import { AuthProvider } from "../context/AuthContext";
import ProtectedRoutes from "./ProtectedRoutes";
import Login from "../pages/auth/Login";
import ForcePasswordChange from "../pages/auth/ForcePasswordChange";
import AdminDashboard from "../pages/admin/Dashboard";
import AdminCustomers from "../pages/admin/Customers";
import AdminClassifications from "../pages/admin/Classifications";
import AdminReports from "../pages/admin/Reports";
import AdminSettlement from "../pages/admin/Settlement";
import AdminNotifications from "../pages/admin/Notifications";
import AdminProfile from "../pages/admin/Profile";
import AdminBusinessRules from "../pages/admin/BusinessRules";
import AdminFixedDeposits from "../pages/admin/FixedDeposits";
import ManagerDashboard from "../pages/manager/Dashboard";
import Dashboard from "../pages/customer/Dashboard";
import TransferFunds from "../pages/customer/TransferFunds";
import Transactions from "../pages/customer/Transactions";
import Notifications from "../pages/customer/Notifications";
import Accounts from "../pages/customer/Accounts";
import Beneficiaries from "../pages/customer/Beneficiaries";
import Statement from "../pages/customer/Statement";
import Profile from "../pages/customer/Profile";
import Overdraft from "../pages/customer/Overdraft";
import Loans from "../pages/customer/Loans";
import Deposits from "../pages/customer/Deposits";

const customerRoute = (element) => (
  <ProtectedRoutes allowedRoles={["customer"]}>
    {element}
  </ProtectedRoutes>
);

const adminRoute = (element) => (
  <ProtectedRoutes allowedRoles={["admin"]}>
    {element}
  </ProtectedRoutes>
);

const authenticatedRoute = (element) => (
  <ProtectedRoutes allowedRoles={["customer", "admin", "manager"]}>
    {element}
  </ProtectedRoutes>
);

const AppRoutes = () => {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route
            path="/force-password-change"
            element={authenticatedRoute(<ForcePasswordChange />)}
          />

          <Route path="/customer" element={<Navigate to="/" replace />} />

          <Route
            path="/admin"
            element={adminRoute(<AdminDashboard />)}
          />
          <Route
            path="/admin/users"
            element={adminRoute(<AdminCustomers />)}
          />
          <Route
            path="/admin/customers"
            element={adminRoute(<AdminCustomers managementMode="customers" />)}
          />
          <Route
            path="/admin/managers"
            element={adminRoute(<AdminCustomers managementMode="managers" />)}
          />
          <Route
            path="/admin/classifications"
            element={adminRoute(<AdminClassifications />)}
          />
          <Route
            path="/admin/reports"
            element={adminRoute(<AdminReports />)}
          />
          <Route
            path="/admin/settlement"
            element={adminRoute(<AdminSettlement />)}
          />
          <Route
            path="/admin/business-rules"
            element={adminRoute(<AdminBusinessRules />)}
          />
          <Route
            path="/admin/fixed-deposits"
            element={adminRoute(<AdminFixedDeposits />)}
          />
          <Route
            path="/admin/notifications"
            element={adminRoute(<AdminNotifications />)}
          />
          <Route
            path="/admin/profile"
            element={adminRoute(<AdminProfile />)}
          />
          <Route
            path="/admin/customers/create"
            element={<Navigate to="/admin/users" replace />}
          />
          <Route
            path="/admin/managers/create"
            element={<Navigate to="/admin/users" replace />}
          />
          <Route
            path="/admin/:section"
            element={adminRoute(<AdminDashboard />)}
          />

          <Route
            path="/manager"
            element={
              <ProtectedRoutes allowedRoles={["manager"]}>
                <ManagerDashboard />
              </ProtectedRoutes>
            }
          />
          <Route
            path="/manager/:section"
            element={
              <ProtectedRoutes allowedRoles={["manager"]}>
                <ManagerDashboard />
              </ProtectedRoutes>
            }
          />

          <Route path="/" element={customerRoute(<Dashboard />)} />
          <Route path="/transfer" element={customerRoute(<TransferFunds />)} />
          <Route path="/accounts" element={customerRoute(<Accounts />)} />
          <Route path="/overdraft" element={customerRoute(<Overdraft />)} />
          <Route path="/loans" element={customerRoute(<Loans />)} />
          <Route path="/deposits" element={customerRoute(<Deposits />)} />
          <Route path="/fixed-deposits" element={customerRoute(<Deposits defaultTab="fixed" />)} />
          <Route path="/recurring-deposits" element={customerRoute(<Deposits defaultTab="recurring" />)} />
          <Route path="/beneficiaries" element={customerRoute(<Beneficiaries />)} />
          <Route path="/transactions" element={customerRoute(<Transactions />)} />
          <Route path="/statement" element={customerRoute(<Statement />)} />
          <Route path="/notifications" element={customerRoute(<Notifications />)} />
          <Route path="/profile" element={customerRoute(<Profile />)} />

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
};

export default AppRoutes;
