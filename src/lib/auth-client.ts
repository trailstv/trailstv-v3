"use client";
import { createAuthClient } from "better-auth/react";

/** Browser-side auth: signIn.email, signUp.email, signIn.social, signOut, useSession. */
export const authClient = createAuthClient();
export const { useSession, signIn, signUp, signOut } = authClient;
