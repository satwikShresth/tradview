"use client"
import React, { useMemo } from "react";
import { Card, Heading, SimpleGrid } from "@chakra-ui/react";
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
  const tickers = useSelector(priceStore, (state) => state.context.tickers);
  const tickerKeys = useMemo(() => Object.keys(tickers), [tickers]);
  if (tickerKeys.length === 0) {
    return null;
  }

  return (
    <Card.Root>
      <Card.Header>
        <Heading size="lg">Live Prices</Heading>
      </Card.Header>
      <Card.Body>
        <SimpleGrid columns={{ base: 1, md: 2, lg: 3 }} gap={4}>
          {tickerKeys.map((ticker) => (
            <TickerCard key={ticker} ticker={ticker} />
          ))}
        </SimpleGrid>
      </Card.Body>
    </Card.Root>
  );
});
