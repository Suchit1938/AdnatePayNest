import Sidebar from "../components/dashboard/Sidebar";

const DashboardLayout = ({ children }) => {
  return (
    <div className="min-h-screen bg-bank-surface">
      <Sidebar />

      <main className="ml-64 min-h-screen overflow-y-auto bg-bank-surface">
        <div className="mx-auto max-w-[1400px] p-5 sm:p-8">{children}</div>
      </main>
    </div>
  );
};

export default DashboardLayout;
