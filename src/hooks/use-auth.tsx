
"use client"

import { createContext, useContext, useState, useEffect, ReactNode, useMemo } from 'react';
import { auth, db } from '@/lib/firebase';
import { onAuthStateChanged, User, signOut as firebaseSignOut } from 'firebase/auth';
import { doc, onSnapshot, setDoc, getDoc } from 'firebase/firestore';
import { useToast } from './use-toast';
import type { UserProfile } from '@/lib/types';
import { MANAGER_TEAMS } from '@/lib/admins';

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
    // RESILIENCY: Hard timeout for loading state to prevent the dashboard from getting stuck
    const timer = setTimeout(() => {
      setLoading(false);
    }, 6000);

    if (!auth) {
        setLoading(false);
        clearTimeout(timer);
        return;
    }

    let unsubscribeProfile: (() => void) | null = null;

    const unsubscribeAuth = onAuthStateChanged(auth, async (firebaseUser) => {
      setUser(firebaseUser);
      
      if (unsubscribeProfile) {
        unsubscribeProfile();
        unsubscribeProfile = null;
      }

      if (firebaseUser && db) {
        const profileRef = doc(db, "userProfiles", firebaseUser.uid);
        
        // VETERAN PROFILE HEALING: Verify existence and correct roles to enable Security Rule access
        try {
            const snap = await getDoc(profileRef);
            const isManagerUID = Object.keys(MANAGER_TEAMS).includes(firebaseUser.uid);
            const targetRole = isManagerUID ? "Manager" : "PMR";

            if (!snap.exists()) {
                console.log(`Auto-generating ${targetRole} profile for UID: ${firebaseUser.uid}`);
                await setDoc(profileRef, {
                    userId: firebaseUser.uid,
                    email: firebaseUser.email,
                    firstName: firebaseUser.displayName?.split(' ')[0] || "User",
                    lastName: firebaseUser.displayName?.split(' ').slice(1).join(' ') || "",
                    role: targetRole,
                    updatedAt: new Date().toISOString()
                }, { merge: true });
            } else if (isManagerUID && snap.data()?.role !== 'Manager' && snap.data()?.role !== 'Admin') {
                // AUTO-UPGRADE: If UID is in manager list but role is still PMR, upgrade to allow approvals
                console.log("Upgrading profile to Manager role for Security Rule compliance...");
                await setDoc(profileRef, { role: "Manager", updatedAt: new Date().toISOString() }, { merge: true });
            }
        } catch (e) {
            console.warn("Profile heal restricted, proceeding with limited access:", e);
        }

        // Listen for real-time profile changes
        unsubscribeProfile = onSnapshot(profileRef, (docSnap) => {
          if (docSnap.exists()) {
            setProfile({ id: docSnap.id, ...docSnap.data() } as UserProfile);
          }
          setLoading(false);
          clearTimeout(timer);
        }, (err) => {
          console.warn("Profile sync error, accessing dashboard structure anyway:", err);
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
