import Sidebar from "../components/dashboard/Sidebar";

const DashboardLayout = ({ children }) => {
  return (
    <div className="min-h-screen bg-bank-surface">
      <Sidebar />

      <main className="min-h-screen min-w-0 overflow-y-auto bg-bank-surface pb-[calc(6.5rem+env(safe-area-inset-bottom))] lg:ml-64 lg:pb-0">
        <div className="mx-auto w-full min-w-0 max-w-[1680px] px-3 py-4 sm:px-5 sm:py-6 lg:p-8">
          {children}
        </div>
      </main>
    </div>
  );
};

export default DashboardLayout;
