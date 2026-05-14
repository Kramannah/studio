
"use client"

import { useState } from 'react';
import { auth, db } from '@/lib/firebase';
import { createUserWithEmailAndPassword, signInWithEmailAndPassword } from 'firebase/auth';
import { doc, setDoc } from 'firebase/firestore';
import { useToast } from '@/hooks/use-toast';
import { Button } from './ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from './ui/card';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs';

export function LoginPage() {
    const { toast } = useToast();
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [loading, setLoading] = useState(false);

    const handleSignUp = async (e?: React.FormEvent) => {
        if (e) e.preventDefault();
        if (!email || !password) return;
        setLoading(true);
        try {
            const userCredential = await createUserWithEmailAndPassword(auth!, email, password);
            const user = userCredential.user;

            // Create initial user profile in Firestore to ensure visibility in Admin Dashboard
            if (db) {
                await setDoc(doc(db, "userProfiles", user.uid), {
                    userId: user.uid,
                    email: user.email,
                    firstName: "New",
                    lastName: "User",
                    code: "NEW",
                    updatedAt: new Date().toISOString()
                }, { merge: true });
            }

            toast({ title: "Account Created", description: "You have been successfully registered." });
        } catch (error: any) {
            toast({ variant: 'destructive', title: "Registration Failed", description: error.message });
        } finally {
            setLoading(false);
        }
    };

    const handleSignIn = async (e?: React.FormEvent) => {
        if (e) e.preventDefault();
        if (!email || !password) return;
        setLoading(true);
        try {
            await signInWithEmailAndPassword(auth!, email, password);
            toast({ title: "Signed In", description: "Welcome back!" });
        } catch (error: any) {
            toast({ variant: 'destructive', title: "Sign In Failed", description: error.message });
        } finally {
            setLoading(false);
        }
    };


    return (
        <div className="flex items-center justify-center min-h-screen bg-background p-4">
            <Tabs defaultValue="signin" className="w-full max-w-[400px]">
                <TabsList className="grid w-full grid-cols-2 mb-4">
                    <TabsTrigger value="signin" className="font-headline">Sign In</TabsTrigger>
                    <TabsTrigger value="signup" className="font-headline">Sign Up</TabsTrigger>
                </TabsList>
                <TabsContent value="signin">
                    <form onSubmit={handleSignIn}>
                        <Card className="border-2 shadow-lg">
                            <CardHeader>
                                <CardTitle className="font-headline text-2xl">Sign In</CardTitle>
                                <CardDescription>Enter your credentials to access your account.</CardDescription>
                            </CardHeader>
                            <CardContent className="space-y-4">
                                <div className="space-y-2">
                                    <Label htmlFor="email-signin">Email</Label>
                                    <Input 
                                        id="email-signin" 
                                        type="email" 
                                        placeholder="medrep@hovidinc.com" 
                                        value={email} 
                                        onChange={(e) => setEmail(e.target.value)} 
                                        required
                                    />
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="password-signin">Password</Label>
                                    <Input 
                                        id="password-signin" 
                                        type="password" 
                                        value={password} 
                                        onChange={(e) => setPassword(e.target.value)} 
                                        required
                                    />
                                </div>
                            </CardContent>
                            <CardFooter>
                                <Button type="submit" className="w-full font-headline h-11" disabled={loading}>
                                    {loading ? 'Signing In...' : 'Sign In'}
                                </Button>
                            </CardFooter>
                        </Card>
                    </form>
                </TabsContent>
                <TabsContent value="signup">
                    <form onSubmit={handleSignUp}>
                        <Card className="border-2 shadow-lg">
                            <CardHeader>
                                <CardTitle className="font-headline text-2xl">Sign Up</CardTitle>
                                <CardDescription>Create a new account to get started.</CardDescription>
                            </CardHeader>
                            <CardContent className="space-y-4">
                                <div className="space-y-2">
                                    <Label htmlFor="email-signup">Email</Label>
                                    <Input 
                                        id="email-signup" 
                                        type="email" 
                                        placeholder="medrep@hovidinc.com" 
                                        value={email} 
                                        onChange={(e) => setEmail(e.target.value)} 
                                        required
                                    />
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="password-signup">Password</Label>
                                    <Input 
                                        id="password-signup" 
                                        type="password" 
                                        value={password} 
                                        onChange={(e) => setPassword(e.target.value)} 
                                        required
                                    />
                                </div>
                            </CardContent>
                            <CardFooter>
                                <Button type="submit" className="w-full font-headline h-11" disabled={loading}>
                                    {loading ? 'Creating Account...' : 'Sign Up'}
                                </Button>
                            </CardFooter>
                        </Card>
                    </form>
                </TabsContent>
            </Tabs>
        </div>
    )
}
