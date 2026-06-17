
"use client"

import { createContext, useContext, useState, useEffect, ReactNode, useMemo } from 'react';
import { auth, db } from '@/lib/firebase';
import { onAuthStateChanged, User, signOut as firebaseSignOut } from 'firebase/auth';
import { doc, onSnapshot } from 'firebase/firestore';
import { useToast } from './use-toast';
import type { UserProfile } from '@/lib/types';

interface AuthContextType {
  user: User | null;
  profile: UserProfile | null;
  loading: boolean;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  profile: null,
  loading: true,
  logout: () => {},
});

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  useEffect(() => {
    // RESILIENCY: 5-second hard timeout for initial loading to prevent "stuck" UI
    const timer = setTimeout(() => {
      setLoading(false);
    }, 5000);

    if (!auth) {
        setLoading(false);
        clearTimeout(timer);
        return;
    }

    let unsubscribeProfile: (() => void) | null = null;

    const unsubscribeAuth = onAuthStateChanged(auth, (firebaseUser) => {
      setUser(firebaseUser);
      
      if (unsubscribeProfile) {
        unsubscribeProfile();
        unsubscribeProfile = null;
      }

      if (firebaseUser && db) {
        const profileRef = doc(db, "userProfiles", firebaseUser.uid);
        // Sync profile data but ensure loading is cleared even on error
        unsubscribeProfile = onSnapshot(profileRef, (docSnap) => {
          if (docSnap.exists()) {
            setProfile({ id: docSnap.id, ...docSnap.data() } as UserProfile);
          } else {
            setProfile(null);
          }
          setLoading(false);
          clearTimeout(timer);
        }, (err) => {
          console.warn("Profile sync error (proceeding with limited access):", err);
          setLoading(false);
          clearTimeout(timer);
        });
      } else {
        setProfile(null);
        setLoading(false);
        clearTimeout(timer);
      }
    });

    return () => {
      unsubscribeAuth();
      if (unsubscribeProfile) unsubscribeProfile();
      clearTimeout(timer);
    };
  }, []);

  const logout = async () => {
    if (!auth) return;
    try {
        await firebaseSignOut(auth);
        toast({ title: 'Logged Out' });
    } catch (error) {
        toast({ variant: 'destructive', title: 'Logout Failed' });
    }
  }

  const contextValue = useMemo(() => ({
    user,
    profile,
    loading,
    logout
  }), [user, profile, loading, logout]);

  return (
    <AuthContext.Provider value={contextValue}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  return useContext(AuthContext);
};
