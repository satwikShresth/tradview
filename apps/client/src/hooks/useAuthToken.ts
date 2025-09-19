"use client";
import { useContext } from "react";
import { UserSessionContext } from "@/components/AuthProvider";

export const useAuthToken = () => {
  return useContext(UserSessionContext);
};
