"use client"

import { createContext, useContext, useState, useEffect, ReactNode, useMemo } from 'react';
import { auth } from '@/lib/firebase';
import { onAuthStateChanged, User, signOut as firebaseSignOut } from 'firebase/auth';
import { useToast } from './use-toast';

interface AuthContextType {
  user: User | null;
  loading: boolean;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  loading: true,
  logout: () => {},
});

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  useEffect(() => {
    // Safety fallback: ensure loading is never stuck indefinitely
    const timer = setTimeout(() => {
      setLoading(false);
    }, 8000);

    if (!auth) {
        setLoading(false);
        clearTimeout(timer);
        return;
    }

    const unsubscribe = onAuthStateChanged(auth, (firebaseUser) => {
      setUser(firebaseUser);
      setLoading(false);
      clearTimeout(timer);
    });

    return () => {
      unsubscribe();
      clearTimeout(timer);
    };
  }, []);

  const logout = async () => {
    if (!auth) return;
    try {
        await firebaseSignOut(auth);
        toast({ title: 'Logged Out', description: 'You have been successfully logged out.' });
    } catch (error) {
        toast({ variant: 'destructive', title: 'Logout Failed', description: 'An error occurred while logging out.' });
    }
  }

  const contextValue = useMemo(() => ({
    user,
    loading,
    logout
  }), [user, loading]);

  return (
    <AuthContext.Provider value={contextValue}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  return useContext(AuthContext);
};
