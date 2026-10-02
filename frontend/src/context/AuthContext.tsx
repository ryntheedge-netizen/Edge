import React, { createContext, useContext, useState, useEffect } from 'react';

interface AuthContextType {
  token: string | null;
  isAuthenticated: boolean;
  permissions: string[];
  username: string | null;
  login: (password: string, username?: string) => Promise<{ success: boolean; message?: string }>;
  logout: () => void;
  hasPermission: (perm: string) => boolean;
}

const AuthContext = createContext<AuthContextType>({
  token: null,
  isAuthenticated: false,
  permissions: [],
  username: null,
  login: async () => ({ success: false, message: 'Not initialized' }),
  logout: () => {},
  hasPermission: () => false,
});

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [token, setToken] = useState<string | null>(localStorage.getItem('bull_ring_admin_token'));
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(!!token);
  const [permissions, setPermissions] = useState<string[]>([]);
  const [username, setUsername] = useState<string | null>(null);

  useEffect(() => {
    if (token) {
      localStorage.setItem('bull_ring_admin_token', token);
      setIsAuthenticated(true);
      try {
        const payload = JSON.parse(atob(token.split('.')[1]));
        // Support old format where role was a string, map to permission if necessary, but new format uses permissions array
        const perms = payload.permissions || (payload.role ? [payload.role.toUpperCase()] : []);
        setPermissions(perms);
        setUsername(payload.username || null);
      } catch (e) {
        setPermissions([]);
        setUsername(null);
      }
    } else {
      localStorage.removeItem('bull_ring_admin_token');
      setIsAuthenticated(false);
      setPermissions([]);
      setUsername(null);
    }
  }, [token]);

  const login = async (password: string, username?: string): Promise<{ success: boolean; message?: string }> => {
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password, username }),
      });

      const data = await res.json();
      if (res.ok && data.token) {
        setToken(data.token);
        return { success: true };
      }
      return { success: false, message: data.error || 'Invalid credentials' };
    } catch (err) {
      console.error('Login request failed:', err);
      return { success: false, message: 'Network error. Please try again.' };
    }
  };

  const logout = () => {
    setToken(null);
  };

  const hasPermission = (perm: string) => {
    return permissions.includes('EDGE_SUPERADMIN') || permissions.includes(perm);
  };

  return (
    <AuthContext.Provider value={{ token, isAuthenticated, permissions, username, login, logout, hasPermission }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
