"use client"
import React, { useMemo, useEffect } from "react";
import { Card, Center, Heading, VStack, Box } from "@chakra-ui/react";
import { useTransport } from "@connectrpc/connect-query";
import { TradViewService } from "@tradview/proto";
import { createClient } from "@connectrpc/connect";
import { useQuery as useReactQuery } from "@tanstack/react-query";
import { useSelector } from '@xstate/store/react';
import { priceStreamQuery } from "@/queryOptions";
import { priceStore } from '@/stores/priceStore';
import { TickerCard } from "@/components/TickerCard";

export const PriceDisplay = React.memo(() => {
  const transport = useTransport();
  const client = useMemo(() => createClient(TradViewService, transport), [transport]);
  useReactQuery(priceStreamQuery(client));
  const tickerKeys = useSelector(
    priceStore,
    (state) => {
      const tickers = state.context.tickers;
      if (!tickers) return [];
      return Object.keys(tickers).sort();
    },
    (a, b) => {
      if (a?.length !== b?.length) return false;
      return a.every((key, index) => key === b[index]);
    }
  );

  // Add CSS keyframes for animations
  useEffect(() => {
    if (typeof document !== 'undefined' && !document.getElementById('ticker-animations')) {
      const style = document.createElement('style');
      style.id = 'ticker-animations';
      style.textContent = `
        @keyframes fadeInUp {
          0% {
            opacity: 0;
            transform: translateY(20px);
          }
          100% {
            opacity: 1;
            transform: translateY(0);
          }
        }
        
        @keyframes slideInLeft {
          0% {
            opacity: 0;
            transform: translateX(-30px);
          }
          100% {
            opacity: 1;
            transform: translateX(0);
          }
        }

        @media (prefers-reduced-motion: reduce) {
          *, *::before, *::after {
            animation-duration: 0.01ms !important;
            animation-iteration-count: 1 !important;
            transition-duration: 0.01ms !important;
          }
        }
      `;
      document.head.appendChild(style);
    }
  }, []);

  return (
    <Center>
      <Card.Root
        minWidth="400px"
        maxWidth="500px"
        style={{
          viewTransitionName: 'price-display-card',
        }}
      >
        <Card.Header>
          <Heading size="lg">Live Prices</Heading>
        </Card.Header>
        <Card.Body>
          <VStack
            gap={3}
            justify="center"
            align="stretch"
            width="100%"
            className="ticker-list"
          >
            {tickerKeys.map((ticker, index) => (
              <Box
                key={ticker}
                style={{
                  viewTransitionName: `ticker-${ticker}`,
                  contain: 'layout',
                  transition: 'all 0.3s ease-in-out',
                  animation: `fadeInUp 0.3s ease-out both`,
                  animationDelay: `${(index + 1) * 0.1}s`,
                }}
                onMouseEnter={(e) => {
                  if (window.matchMedia('(prefers-reduced-motion: no-preference)').matches) {
                    e.currentTarget.style.transform = 'translateY(-2px)';
                    e.currentTarget.style.boxShadow = '0 4px 12px rgba(0, 0, 0, 0.15)';
                  }
                }}
                onMouseLeave={(e) => {
                  if (window.matchMedia('(prefers-reduced-motion: no-preference)').matches) {
                    e.currentTarget.style.transform = 'translateY(0)';
                    e.currentTarget.style.boxShadow = 'none';
                  }
                }}
              >
                <TickerCard ticker={ticker} />
              </Box>
            ))}
          </VStack>
        </Card.Body>
      </Card.Root>
    </Center>
  );
});
