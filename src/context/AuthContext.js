import React, { createContext, useContext, useState } from 'react';

const AuthContext = createContext();

const ADMIN_CREDENTIALS = {
  email: 'admin',
  password: '123zerofold',
};

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(() => {
    if (typeof window !== 'undefined') {
      const storedUser = localStorage.getItem('invoiceAppUser');
      return storedUser ? JSON.parse(storedUser) : null;
    }
    return null;
  });
  const [loading, setLoading] = useState(false);

  const login = (email, password) => {
    if (email === ADMIN_CREDENTIALS.email && password === ADMIN_CREDENTIALS.password) {
      const loggedUser = { uid: 'admin-local', email: 'admin' };
      setUser(loggedUser);
      if (typeof window !== 'undefined') {
        localStorage.setItem('invoiceAppUser', JSON.stringify(loggedUser));
      }
      return Promise.resolve(loggedUser);
    }

    return Promise.reject(new Error('Invalid credentials.'));
  };

  const signup = () => {
    return Promise.reject(new Error('Signup is disabled. Use default credentials.'));
  };

  const logout = () => {
    setUser(null);
    if (typeof window !== 'undefined') {
      localStorage.removeItem('invoiceAppUser');
    }
    return Promise.resolve();
  };

  return (
    <AuthContext.Provider value={{ user, loading, login, signup, logout }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return context;
};
