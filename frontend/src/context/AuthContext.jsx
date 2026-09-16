import React, { createContext, useState, useEffect, useContext, useCallback } from 'react';

const AuthContext = createContext(null);
const sessionCacheKey = 'sgal_session_cache';

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  // true cuando la base no tiene ningún usuario Desarrollador: el sistema debe
  // pedir la creación del usuario base en lugar del login.
  const [needsSetup, setNeedsSetup] = useState(false);

  const refreshSetupStatus = useCallback(async () => {
    try {
      const response = await fetch('/api/auth/bootstrap-status');
      if (!response.ok) return false;
      const data = await response.json();
      setNeedsSetup(Boolean(data.requiresBootstrap));
      return Boolean(data.requiresBootstrap);
    } catch {
      return false;
    }
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const response = await fetch('/api/auth/me');
        const data = response.ok ? await response.json() : null;
        setUser(data);
        if (data) {
          localStorage.setItem(sessionCacheKey, JSON.stringify(data));
        } else {
          localStorage.removeItem(sessionCacheKey);
          // Sin sesión: comprobamos si falta el usuario base.
          await refreshSetupStatus();
        }
      } catch {
        setUser(null);
        await refreshSetupStatus();
      } finally {
        setLoading(false);
      }
    })();
  }, [refreshSetupStatus]);

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
      localStorage.setItem(sessionCacheKey, JSON.stringify(data));
      return data;
    } catch (error) {
      throw error;
    }
  };

  const createBaseUser = async (payload) => {
    const response = await fetch('/api/auth/bootstrap', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.mensaje || 'Error al crear el usuario base');
    }

    setUser(data);
    setNeedsSetup(false);
    localStorage.setItem(sessionCacheKey, JSON.stringify(data));
    return data;
  };

  const logout = async () => {
    try { await fetch('/api/auth/logout', { method: 'POST' }); } catch { /* limpia estado local igualmente */ }
    setUser(null);
    localStorage.removeItem(sessionCacheKey);
  };

  const updatePasswordState = (newSessionData) => {
    const updated = { ...user, ...newSessionData };
    setUser(updated);
    localStorage.setItem(sessionCacheKey, JSON.stringify(updated));
  };

  const can = useCallback((permission) => Boolean(user?.permissions?.includes(permission)), [user]);
  const canAny = useCallback((...permissions) => permissions.some(can), [can]);

  return (
    <AuthContext.Provider value={{ user, login, logout, loading, needsSetup, createBaseUser, refreshSetupStatus, updatePasswordState, can, canAny }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
