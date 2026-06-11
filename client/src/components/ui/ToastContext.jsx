import { createContext, useCallback, useContext, useMemo, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Info,
  Loader2,
  X,
  XCircle,
} from "lucide-react";

const ToastContext = createContext(null);

const toastStyles = {
  success: {
    icon: CheckCircle2,
    wrapper: "border-emerald-200 bg-emerald-50 text-emerald-800",
    iconTone: "text-emerald-600",
  },
  error: {
    icon: XCircle,
    wrapper: "border-red-200 bg-red-50 text-red-800",
    iconTone: "text-red-600",
  },
  warning: {
    icon: AlertTriangle,
    wrapper: "border-amber-200 bg-amber-50 text-amber-800",
    iconTone: "text-amber-600",
  },
  info: {
    icon: Info,
    wrapper: "border-blue-200 bg-blue-50 text-blue-800",
    iconTone: "text-blue-600",
  },
  loading: {
    icon: Loader2,
    wrapper: "border-slate-200 bg-white text-slate-800",
    iconTone: "animate-spin text-slate-600",
  },
};

export const ToastProvider = ({ children }) => {
  const [toasts, setToasts] = useState([]);

  const dismissToast = useCallback((id) => {
    setToasts((currentToasts) =>
      currentToasts.filter((toast) => toast.id !== id)
    );
  }, []);

  const showToast = useCallback(
    ({ title, message, type = "info", duration = 4000 }) => {
      const id =
        typeof crypto !== "undefined" && crypto.randomUUID
          ? crypto.randomUUID()
          : `${Date.now()}-${Math.random()}`;

      setToasts((currentToasts) => [
        ...currentToasts,
        {
          id,
          title,
          message,
          type,
        },
      ]);

      if (duration > 0 && type !== "loading") {
        window.setTimeout(() => dismissToast(id), duration);
      }

      return id;
    },
    [dismissToast]
  );

  const value = useMemo(
    () => ({
      dismissToast,
      showToast,
      success: (message, options = {}) =>
        showToast({ ...options, message, type: "success" }),
      error: (message, options = {}) =>
        showToast({ ...options, message, type: "error", duration: 5000 }),
      warning: (message, options = {}) =>
        showToast({ ...options, message, type: "warning", duration: 5000 }),
      info: (message, options = {}) =>
        showToast({ ...options, message, type: "info" }),
      loading: (message, options = {}) =>
        showToast({ ...options, message, type: "loading", duration: 0 }),
    }),
    [dismissToast, showToast]
  );

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="fixed right-4 top-4 z-[100] flex w-[calc(100vw-2rem)] max-w-sm flex-col gap-3">
        {toasts.map((toast) => {
          const style = toastStyles[toast.type] || toastStyles.info;
          const Icon = style.icon;

          return (
            <div
              key={toast.id}
              className={`rounded-xl border p-4 shadow-lg ${style.wrapper}`}
              role="status"
            >
              <div className="flex items-start gap-3">
                <Icon className={`mt-0.5 shrink-0 ${style.iconTone}`} size={20} />
                <div className="min-w-0 flex-1">
                  {toast.title && (
                    <p className="font-bold leading-5">{toast.title}</p>
                  )}
                  <p className={toast.title ? "mt-1 text-sm leading-5" : "text-sm leading-5"}>
                    {toast.message}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => dismissToast(toast.id)}
                  className="rounded-lg p-1 opacity-70 transition hover:bg-white/60 hover:opacity-100"
                  aria-label="Dismiss notification"
                >
                  <X size={16} />
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
};

export const useToast = () => {
  const context = useContext(ToastContext);

  if (!context) {
    throw new Error("useToast must be used within ToastProvider");
  }

  return context;
};
