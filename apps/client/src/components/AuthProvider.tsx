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
import { getToken } from "@/queryOptions";

export interface TokenResponse {
  token: string;
}

export const UserSessionContext = createContext<string | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const existingToken = typeof window !== 'undefined' ? Cookies.get(env.NEXT_PUBLIC_SESSION_COOKIE_NAME) : null;

  console.log('[AuthProvider] Initializing with existing token:', existingToken ? 'Found' : 'Not found');

  const { data: token, isLoading, isError, error, refetch } = useQuery({
    ...getToken,
    enabled: !existingToken,
    retry: 3,
    select: (data: TokenResponse) => {
      const tokenString = data.token;
      // Set cookie on successful token generation
      if (tokenString && !existingToken) {
        console.log('[AuthProvider] Generated new token, setting cookie');
        Cookies.set(env.NEXT_PUBLIC_SESSION_COOKIE_NAME, tokenString, {
          expires: 7,
          sameSite: 'strict'
        });
      }
      return tokenString;
    }
  });

  if (isError) {
    console.error('[AuthProvider] Token generation failed:', error?.message);
    Cookies.remove(env.NEXT_PUBLIC_SESSION_COOKIE_NAME);
  }

  const currentToken = existingToken || token;
  console.log('[AuthProvider] Current session state:', {
    hasExistingToken: !!existingToken,
    hasNewToken: !!token,
    isLoading,
    isError
  });

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
