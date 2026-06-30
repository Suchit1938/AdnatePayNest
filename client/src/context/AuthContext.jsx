import { useCallback, useEffect, useMemo, useState } from "react";

import api from "../api/axios";
import { AuthContext } from "./AuthContextValue";

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(() => {
    const storedUser = localStorage.getItem("adnate-user");
    return storedUser ? JSON.parse(storedUser) : null;
  });
  const [token, setToken] = useState(() => localStorage.getItem("adnate-token"));

  useEffect(() => {
    if (user) {
      localStorage.setItem("adnate-user", JSON.stringify(user));
      return;
    }

    localStorage.removeItem("adnate-user");
  }, [user]);

  useEffect(() => {
    if (token) {
      localStorage.setItem("adnate-token", token);
      return;
    }

    localStorage.removeItem("adnate-token");
  }, [token]);

  useEffect(() => {
    if (!token) {
      return;
    }

    let isMounted = true;

    api
      .get("/users/me")
      .then(({ data }) => {
        if (isMounted) {
          setUser(data.user);
        }
      })
      .catch((error) => {
        if (!isMounted) {
          return;
        }

        if ([401, 403].includes(error.response?.status)) {
          setUser(null);
          setToken(null);
        }
      });

    return () => {
      isMounted = false;
    };
  }, [token]);

  useEffect(() => {
    const clearAuth = () => {
      setUser(null);
      setToken(null);
    };

    window.addEventListener("adnate-auth-cleared", clearAuth);

    return () => {
      window.removeEventListener("adnate-auth-cleared", clearAuth);
    };
  }, []);

  const login = useCallback(async (email, password) => {
    const { data } = await api.post("/auth/login", { email, password });

    setToken(data.token);
    setUser(data.user);

    return data.user;
  }, []);

  const setSessionUser = useCallback((nextUser) => {
    setUser(nextUser);
  }, []);

  const logout = useCallback(async () => {
    const currentToken = localStorage.getItem("adnate-token");

    setUser(null);
    setToken(null);

    if (!currentToken) {
      return;
    }

    try {
      await api.post(
        "/auth/logout",
        null,
        {
          headers: {
            Authorization: `Bearer ${currentToken}`,
          },
        }
      );
    } catch {
      // The local session is already cleared; server logout is best-effort.
    }
  }, []);

  const authValue = useMemo(
    () => ({ user, token, login, logout, setSessionUser }),
    [user, token, login, logout, setSessionUser]
  );

  return (
    <AuthContext.Provider value={authValue}>
      {children}
    </AuthContext.Provider>
  );
};
