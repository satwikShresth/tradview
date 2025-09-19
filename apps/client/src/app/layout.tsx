'use client';

import { Provider } from "@/components/ui/provider";
import { Toaster } from "@/components/ui/toaster";
import { QueryClientProvider } from "@tanstack/react-query";
import { ReactQueryDevtools } from "@tanstack/react-query-devtools";
import { queryClient } from "@/lib/queryClient";
import { AuthProvider } from "@/components/AuthProvider";
import { ConnectedTransportProvider } from "@/components/TransportProvider";
import { ReactNode } from "react";
import { Box, Center, Container, Flex } from "@chakra-ui/react";

// Main Layout Component
export default function RootLayout(props: { children: ReactNode }) {
  const { children } = props;

  return (
    <html suppressHydrationWarning>
      <body>
        <Provider>
          <Center>
            <Box width="100%" maxWidth={'1800px'} position="relative">
              <Flex direction="column" minH="100vh" w="90%" mx="auto">
                <Flex flex="1" scrollbar={'hidden'} overflowY="auto">
                  <Container mt={'6'} maxWidth={'1600px'} flex="1">
                    <QueryClientProvider client={queryClient}>
                      <AuthProvider>
                        <ConnectedTransportProvider>
                          {children}
                        </ConnectedTransportProvider>
                      </AuthProvider>
                      <ReactQueryDevtools initialIsOpen={false} />
                    </QueryClientProvider>
                  </Container>
                </Flex>
              </Flex>
            </Box>
          </Center>
          <Toaster />
        </Provider>
      </body>
    </html>
  );
}
