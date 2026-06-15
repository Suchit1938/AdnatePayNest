import Sidebar from "../components/dashboard/Sidebar";

const DashboardLayout = ({ children }) => {
  return (
    <div className="min-h-screen bg-bank-surface">
      <Sidebar />

      <main className="min-h-screen overflow-y-auto bg-bank-surface pb-24 lg:ml-64 lg:pb-0">
        <div className="mx-auto max-w-[1400px] px-3 py-4 sm:px-5 sm:py-6 lg:p-8">
          {children}
        </div>
      </main>
    </div>
  );
};

export default DashboardLayout;
