'use client';

import { createContext, ReactNode } from "react";
import Cookies from 'js-cookie';
import { env } from "@/env";
import {
  AbsoluteCenter,
  Box,
  HStack,
  VStack,
  Spinner,
  Text,
  Button
} from "@chakra-ui/react";
import { useQuery } from "@tanstack/react-query";
import { getToken, verifyToken } from "@/queryOptions";

export interface TokenResponse {
  token: string;
}

export const UserSessionContext = createContext<string | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const existingToken = typeof window !== 'undefined' ? Cookies.get(env.NEXT_PUBLIC_SESSION_COOKIE_NAME) : null;

  const { data: tokenVerification, isLoading: isVerifying } = useQuery({
    ...verifyToken(existingToken || ''),
    enabled: !!existingToken,
  });

  const shouldFetchNewToken = !existingToken || (tokenVerification && !tokenVerification.valid);

  const { data: newToken, isLoading: isGenerating, isError, error, refetch } = useQuery({
    ...getToken,
    enabled: shouldFetchNewToken,
    select: ({ token }) => {
      if (existingToken && tokenVerification && !tokenVerification.valid) {
        console.log('Purging invalid token:', tokenVerification.message);
        Cookies.remove(
          env.NEXT_PUBLIC_SESSION_COOKIE_NAME,
          {
            domain: env.NEXT_PUBLIC_COOKIE_DOMAIN !== 'localhost' ? env.NEXT_PUBLIC_COOKIE_DOMAIN : undefined,
          }
        );
      }

      if (token && token !== existingToken) {
        Cookies.set(
          env.NEXT_PUBLIC_SESSION_COOKIE_NAME,
          token,
          {
            expires: env.NEXT_PUBLIC_SESSION_EXPIRES_DAYS,
            sameSite: 'lax',
            secure: env.NEXT_PUBLIC_COOKIE_SECURE,
            domain: env.NEXT_PUBLIC_COOKIE_DOMAIN !== 'localhost' ? env.NEXT_PUBLIC_COOKIE_DOMAIN : undefined,
          });
      }
      return token
    }
  });

  const currentToken = existingToken && tokenVerification?.valid ? existingToken : newToken;

  const isLoading = isVerifying || isGenerating;

  if (isLoading) {
    return (
      <Box position="relative" minH="100vh" w="100%">
        <AbsoluteCenter mt='80' axis='horizontal' >
          <VStack gap={4}>
            <HStack gap={3}>
              <Spinner size="lg" colorPalette="blue" />
              <Text fontSize="lg" fontWeight="medium">
                Setting up your session...
              </Text>
            </HStack>
            <Text fontSize="sm" color="fg.muted">
              Generating unique identifier for your session
            </Text>
          </VStack>
        </AbsoluteCenter>
      </Box>
    );
  }

  if (isError) {
    return (
      <Box position="relative" minH="100vh" w="100%">
        <AbsoluteCenter>
          <VStack gap={6} textAlign="center" maxW="md">
            <Box
              bg="red.50"
              color="red.600"
              p={4}
              borderRadius="md"
              borderWidth="1px"
              borderColor="red.200"
            >
              <VStack gap={3}>
                <Text fontSize="lg" fontWeight="semibold">
                  Session Setup Failed
                </Text>
                <Text fontSize="sm" color="red.500">
                  {error.message || "Unable to generate session identifier. Please try again."}
                </Text>
              </VStack>
            </Box>
            <Button
              colorScheme="blue"
              onClick={() => refetch()}
              size="lg"
            >
              Retry Setup
            </Button>
          </VStack>
        </AbsoluteCenter>
      </Box>
    );
  }

  return (
    <UserSessionContext.Provider value={currentToken || null}>
      {children}
    </UserSessionContext.Provider>
  );
}
