import React, { createContext, useContext, useState, useEffect } from 'react';

const AuthContext = createContext(null);

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000/api';

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => {
    try {
      const storedUser = localStorage.getItem('crisisai_user');
      return storedUser ? JSON.parse(storedUser) : null;
    } catch {
      return null;
    }
  });

  const [token, setToken] = useState(() => {
    try {
      return localStorage.getItem('crisisai_token') || null;
    } catch {
      return null;
    }
  });

  const [loading, setLoading] = useState(false);

  // Optional: verify token validity on initial mount if stored
  useEffect(() => {
    let isMounted = true;

    const verifySession = async () => {
      if (!token) return;
      try {
        const response = await fetch(`${API_BASE_URL}/auth/me`, {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });
        if (!response.ok) {
          // Token is expired or invalid
          if (isMounted) {
            logout();
          }
        } else {
          const data = await response.json();
          if (isMounted && data.data?.user) {
            setUser(data.data.user);
            try {
              localStorage.setItem('crisisai_user', JSON.stringify(data.data.user));
            } catch {
              // Ignore storage errors
            }
          }
        }
      } catch {
        // Network errors shouldn't immediately log user out if offline
      }
    };

    verifySession();

    return () => {
      isMounted = false;
    };
  }, [token]);

  const login = async (email, password) => {
    setLoading(true);
    try {
      const response = await fetch(`${API_BASE_URL}/auth/login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email, password }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || 'Login failed. Please check your credentials.');
      }

      const receivedToken = data.data?.token;
      const receivedUser = data.data?.user;

      if (receivedToken) {
        setToken(receivedToken);
        try {
          localStorage.setItem('crisisai_token', receivedToken);
        } catch {
          // Ignore storage quota errors
        }
      }

      if (receivedUser) {
        setUser(receivedUser);
        try {
          localStorage.setItem('crisisai_user', JSON.stringify(receivedUser));
        } catch {
          // Ignore storage quota errors
        }
      }

      return data.data;
    } finally {
      setLoading(false);
    }
  };

  const logout = () => {
    setToken(null);
    setUser(null);
    try {
      localStorage.removeItem('crisisai_token');
      localStorage.removeItem('crisisai_user');
    } catch {
      // Ignore storage errors
    }
  };

  const value = {
    user,
    token,
    isAuthenticated: Boolean(token && user),
    loading,
    login,
    logout,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}

export default AuthContext;
