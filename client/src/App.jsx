import AppRoutes from "./routes/AppRoutes";
import { ToastProvider } from "./components/ui/ToastContext";

function App() {
  return (
    <ToastProvider>
      <AppRoutes />
    </ToastProvider>
  );
}

export default App;
