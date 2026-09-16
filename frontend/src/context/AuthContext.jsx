import React, { createContext, useState, useEffect, useContext } from 'react';

const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const storedUser = localStorage.getItem('sietevidas_session');
    if (storedUser) {
      try {
        setUser(JSON.parse(storedUser));
      } catch (e) {
        localStorage.removeItem('sietevidas_session');
      }
    }
    setLoading(false);
  }, []);

  const login = async (nombreUsuario, pass) => {
    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ nombreUsuario, pass }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.mensaje || 'Error al iniciar sesión');
      }

      setUser(data);
      localStorage.setItem('sietevidas_session', JSON.stringify(data));
      return data;
    } catch (error) {
      throw error;
    }
  };

  const logout = () => {
    setUser(null);
    localStorage.removeItem('sietevidas_session');
  };

  const updatePasswordState = (newSessionData) => {
    const updated = { ...user, ...newSessionData };
    setUser(updated);
    localStorage.setItem('sietevidas_session', JSON.stringify(updated));
  };

  return (
    <AuthContext.Provider value={{ user, login, logout, loading, updatePasswordState }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
