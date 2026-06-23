import {
  LayoutDashboard,
  ArrowLeftRight,
  Bell,
  CircleDollarSign,
  History,
  LogOut,
  Users,
  UserCircle,
  Landmark,
  FileBarChart,
  ListChecks,
  ClipboardCheck,
  ShieldCheck,
  Siren,
  UserCog,
  ReceiptText,
  WalletCards,
  UserRoundCheck,
  BadgeIndianRupee,
  PiggyBank,
  SlidersHorizontal,
} from "lucide-react";
import { NavLink, useNavigate } from "react-router-dom";
import brandLogo from "../../assets/brand/logo.png";
import { useAuth } from "../../context/useAuth";

const navItemsByRole = {
  customer: [
    { label: "Overview", path: "/", icon: LayoutDashboard },
    { label: "Transfers", path: "/transfer", icon: ArrowLeftRight },
    { label: "My Accounts", path: "/accounts", icon: WalletCards },
    { label: "Overdraft Facility", path: "/overdraft", icon: Landmark },
    { label: "Loans", path: "/loans", icon: BadgeIndianRupee },
    { label: "Fixed Deposits", path: "/fixed-deposits", icon: PiggyBank },
    { label: "Payees", path: "/beneficiaries", icon: UserRoundCheck },
    { label: "Transaction Activity", path: "/transactions", icon: History },
    { label: "Account Statement", path: "/statement", icon: ReceiptText },
    { label: "Alerts", path: "/notifications", icon: Bell },
    { label: "Profile", path: "/profile", icon: UserCircle },
  ],
  admin: [
    { label: "Control Center", path: "/admin", icon: LayoutDashboard },
    { label: "Users & Access", path: "/admin/users", icon: UserCog },
    { label: "Customers", path: "/admin/customers", icon: Users },
    { label: "Managers", path: "/admin/managers", icon: ShieldCheck },
    { label: "Tier Policies", path: "/admin/classifications", icon: BadgeIndianRupee },
    { label: "Business Rules", path: "/admin/business-rules", icon: SlidersHorizontal },
    { label: "Fixed Deposits", path: "/admin/fixed-deposits", icon: PiggyBank },
    { label: "Reports", path: "/admin/reports", icon: FileBarChart },
    { label: "Settlement Ledger", path: "/admin/settlement", icon: Landmark },
    { label: "System Alerts", path: "/admin/notifications", icon: Bell },
    { label: "Profile", path: "/admin/profile", icon: UserCircle },
  ],
  manager: [
    { label: "Manager Overview", path: "/manager", icon: LayoutDashboard },
    { label: "Pending Reviews", path: "/manager/approvals", icon: ListChecks },
    { label: "Loan Reviews", path: "/manager/loans", icon: BadgeIndianRupee },
    { label: "Loan Portfolio", path: "/manager/loan-portfolio", icon: FileBarChart },
    { label: "Decision History", path: "/manager/approval-history", icon: ClipboardCheck },
    { label: "OD Monitoring", path: "/manager/overdraft", icon: CircleDollarSign },
    { label: "Tier Policies", path: "/manager/policies", icon: BadgeIndianRupee },
    { label: "Risk Escalations", path: "/manager/escalations", icon: Siren },
    { label: "Transactions", path: "/manager/transactions", icon: History },
    { label: "Alerts", path: "/manager/notifications", icon: Bell },
    { label: "Profile", path: "/manager/profile", icon: UserCircle },
  ],
};

const roleLabels = {
  customer: "Customer",
  admin: "Administrator",
  manager: "Manager",
};

const navEndPaths = new Set(["/", "/admin", "/admin/users", "/admin/customers", "/admin/managers", "/manager"]);

const Sidebar = () => {
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  const navItems = navItemsByRole[user?.role] ?? [];
  const initials = (user?.name || "U")
    .split(" ")
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  const handleLogout = () => {
    logout();
    navigate("/login", { replace: true });
  };

  return (
    <>
    <aside className="fixed inset-y-0 left-0 z-40 hidden h-screen w-64 flex-col bg-bank-sidebar text-white shadow-2xl shadow-blue-950/20 lg:flex">
      <div className="shrink-0 border-b border-white/15 px-5 py-5">
        <div className="flex items-center gap-3">
          <img
            src={brandLogo}
            alt="AdnatePayNest logo"
            className="h-12 w-12 shrink-0 rounded-full bg-white object-cover shadow-md ring-1 ring-white/30"
          />
          <div className="min-w-0">
            <p className="truncate text-lg font-bold leading-tight">AdnatePayNest</p>
            <p className="text-xs font-medium italic text-blue-100/90">
              Our Technology, Your Trust
            </p>
          </div>
        </div>
      </div>

      {user && (
        <div className="mx-4 mt-4 shrink-0 rounded-lg border border-white/20 bg-white/10 p-3 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-bank-accent text-sm font-bold shadow-sm">
              {initials}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold">{user.name}</p>
              <p className="truncate text-xs text-blue-100/75">
                {roleLabels[user.role] || user.role}
              </p>
            </div>
          </div>
        </div>
      )}

      <nav className="app-scrollbar mt-4 min-h-0 flex-1 overflow-y-auto overflow-x-hidden px-3 py-2">
        <ul className="flex flex-col gap-1">
          {navItems.map(({ label, path, icon: Icon }) => (
            <li key={label}>
              <NavLink
                to={path}
                end={navEndPaths.has(path)}
                className={({ isActive }) =>
                  [
                    "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
                    isActive
                      ? "bg-bank-accent text-white shadow-sm hover:bg-bank-accent-hover"
                      : "text-blue-50/90 hover:bg-bank-sidebar-hover hover:text-white",
                  ].join(" ")
                }
              >
                <Icon size={18} strokeWidth={2} className="shrink-0" />
                <span className="truncate">{label}</span>
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>

      <div className="shrink-0 border-t border-white/15 p-3">
        <button
          type="button"
          onClick={handleLogout}
          className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-blue-50/90 transition-colors hover:bg-white/10 hover:text-white"
        >
          <LogOut size={18} className="shrink-0" />
          Logout
        </button>
      </div>
    </aside>
    <nav className="fixed inset-x-0 bottom-0 z-50 border-t border-bank-card-border bg-white/95 px-2 py-2 shadow-2xl shadow-slate-900/15 backdrop-blur lg:hidden">
      <div className="app-scrollbar flex items-center gap-2 overflow-x-auto pb-1">
        {navItems.map(({ label, path, icon: Icon }) => (
          <NavLink
            key={label}
            to={path}
            end={navEndPaths.has(path)}
            className={({ isActive }) =>
              [
                "flex min-w-[76px] shrink-0 flex-col items-center justify-center gap-1 rounded-lg px-2 py-2 text-[11px] font-bold transition-colors",
                isActive
                  ? "bg-bank-accent text-white shadow-sm"
                  : "text-slate-600 hover:bg-bank-surface hover:text-bank-eyebrow",
              ].join(" ")
            }
          >
            <Icon size={18} strokeWidth={2} />
            <span className="max-w-[72px] truncate">{label}</span>
          </NavLink>
        ))}
        <button
          type="button"
          onClick={handleLogout}
          className="flex min-w-[76px] shrink-0 flex-col items-center justify-center gap-1 rounded-lg px-2 py-2 text-[11px] font-bold text-red-600 hover:bg-red-50"
        >
          <LogOut size={18} />
          <span>Logout</span>
        </button>
      </div>
    </nav>
    </>
  );
};

export default Sidebar;
