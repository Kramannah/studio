
"use client"

import { createContext, useContext, useState, useEffect, ReactNode, useMemo } from 'react';
import { auth, db } from '@/lib/firebase';
import { onAuthStateChanged, User, signOut as firebaseSignOut } from 'firebase/auth';
import { doc, onSnapshot, setDoc } from 'firebase/firestore';
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
    // RESILIENCY: Hard timeout for loading to prevent veteran accounts from getting stuck
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
        
        // Profile Healing Logic for veteran accounts (NL-02, CL-01)
        unsubscribeProfile = onSnapshot(profileRef, (docSnap) => {
          if (docSnap.exists()) {
            setProfile({ id: docSnap.id, ...docSnap.data() } as UserProfile);
          } else {
            // Document missing: Create a default profile to stop rule crashes
            setDoc(profileRef, {
                userId: firebaseUser.uid,
                email: firebaseUser.email,
                firstName: "User",
                lastName: "",
                role: "PMR",
                updatedAt: new Date().toISOString()
            }, { merge: true });
            setProfile(null);
          }
          setLoading(false);
          clearTimeout(timer);
        }, (err) => {
          // If a rule denied access to the profile itself, we still need to let the user in
          console.warn("Profile sync restricted (proceeding with basic access):", err);
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
