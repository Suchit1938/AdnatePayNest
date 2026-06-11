import { useEffect, useState } from "react";

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

  const login = async (email, password) => {
    const { data } = await api.post("/auth/login", { email, password });

    setToken(data.token);
    setUser(data.user);

    return data.user;
  };

  const setSessionUser = (nextUser) => {
    setUser(nextUser);
  };

  const logout = () => {
    setUser(null);
    setToken(null);
  };

  return (
    <AuthContext.Provider value={{ user, token, login, logout, setSessionUser }}>
      {children}
    </AuthContext.Provider>
  );
};
