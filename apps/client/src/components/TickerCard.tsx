"use client"

import React from 'react';
import { Stat, Badge, HStack, VStack, Card, CloseButton } from '@chakra-ui/react';
import { useSelector } from '@xstate/store/react';
import { useMutation } from "@connectrpc/connect-query";
import { TradViewService } from "@tradview/proto";
import { toaster } from "@/components/ui/toaster";
import { priceStore, type PriceData } from '@/stores/priceStore';

interface TickerCardProps {
  ticker: string;
}

export const TickerCard = React.memo(({ ticker }: TickerCardProps) => {
  const priceData = useSelector(
    priceStore,
    (state) => state.context.tickers[ticker] as PriceData | undefined
  );

  const removeTickerMutation = useMutation(TradViewService.method.removeTicker, {
    onSuccess: (response) => {
      if (response.success) {
        priceStore.send({ type: 'removeTicker', ticker: ticker });
        toaster.create({
          title: "Ticker Removed Successfully",
          description: `${response.tickerId} has been removed from your watchlist`,
          type: "success",
          duration: 3000,
          closable: true,
        });
      } else {
        toaster.create({
          title: "Failed to Remove Ticker",
          description: response.message || "Unknown error occurred",
          type: "error",
          duration: 5000,
          closable: true,
        });
      }
    },
    onError: (error) => {
      toaster.create({
        title: "Network Error",
        description: `Failed to connect to server: ${error.message}`,
        type: "error",
        duration: 5000,
        closable: true,
      });
    },
  });

  const handleRemove = () => {
    removeTickerMutation.mutate({ tickerId: ticker });
  };

  // Show loading state if no data for this ticker yet or price is empty
  if (!priceData || !priceData.price) {
    return (
      <Card.Root>
        <Card.Body>
          <Stat.Root>
            <HStack justify="space-between" align="start">
              <VStack align="start" gap={1} flex="1">
                <Stat.Label fontSize="sm" fontWeight="medium" color="gray.600">
                  {ticker}
                </Stat.Label>
                <Stat.ValueText fontSize="xl" color="gray.400">
                  Loading...
                </Stat.ValueText>
              </VStack>
              <CloseButton
                size="sm"
                onClick={handleRemove}
                disabled={removeTickerMutation.isPending}
              />
            </HStack>
          </Stat.Root>
        </Card.Body>
      </Card.Root>
    );
  }

  const isPositive = priceData.change?.startsWith('+');
  const isNegative = priceData.change?.startsWith('-');

  return (
    <Card.Root>
      <Card.Body>
        <Stat.Root>
          <HStack justify="space-between" align="start">
            <VStack align="start" gap={2} flex="1">
              <Stat.Label fontSize="md" fontWeight="medium">
                {ticker}
              </Stat.Label>
              <Stat.ValueText fontSize="xl" fontWeight="semibold">
                <HStack align='baseline'>
                  {priceData.price} <Stat.ValueUnit>USD</Stat.ValueUnit>
                </HStack>
              </Stat.ValueText>
              {priceData.change && (
                <Badge
                  colorPalette={isPositive ? "green" : isNegative ? "red" : "gray"}
                  variant="subtle"
                  size="sm"
                >
                  {isPositive && <Stat.UpIndicator />}
                  {isNegative && <Stat.DownIndicator />}
                  {priceData.change}
                </Badge>
              )}
            </VStack>
            <CloseButton
              size="sm"
              onClick={handleRemove}
              disabled={removeTickerMutation.isPending}
            />
          </HStack>
        </Stat.Root>
      </Card.Body>
    </Card.Root >
  );
});
