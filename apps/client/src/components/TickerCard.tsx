"use client"
import React from 'react';
import { Stat, HStack, CloseButton } from '@chakra-ui/react';
import { useSelector } from '@xstate/store/react';
import { useMutation } from "@connectrpc/connect-query";
import { TradViewService } from "@tradview/proto";
import { toaster } from "@/components/ui/toaster";
import { priceStore } from '@/stores/priceStore';


interface TickerCardProps {
  ticker: string;
}

export const TickerCard = React.memo(({ ticker }: TickerCardProps) => {
  const price = useSelector(
    priceStore,
    (state) => state.context.tickers[ticker]?.price,
    (a, b) => a === b
  );


  const removeTickerMutation = useMutation(TradViewService.method.removeTicker, {
    onSuccess: (response) => {
      if (response.success) {
        console.log('[RemoveTicker] Successfully removed ticker:', ticker);
        priceStore.send({ type: 'removeTicker', ticker: ticker });
        toaster.create({
          title: "Ticker Removed Successfully",
          description: `${response.tickerId} has been removed from your watchlist`,
          type: "success",
          duration: 3000,
          closable: true,
        });
      } else {
        console.error('[RemoveTicker] Server rejected removal:', response.message);
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
      console.error('[RemoveTicker] Network error:', error.message);
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

  // Show loading state if no price data yet
  if (!price) {
    return (
      <Stat.Root maxW="240px" borderWidth="1px" p="4" rounded="md">
        <HStack justify="space-between">
          <Stat.Label>{ticker}</Stat.Label>
          <CloseButton
            size="sm"
            onClick={handleRemove}
            disabled={removeTickerMutation.isPending}
          />
        </HStack>
        <Stat.ValueText color="gray.400">Loading...</Stat.ValueText>
      </Stat.Root>
    );
  }

  return (
    <Stat.Root borderWidth="1px" p="4" rounded="md">
      <HStack justify="space-between">
        <Stat.Label>{ticker}</Stat.Label>
        <CloseButton
          size="sm"
          onClick={handleRemove}
          disabled={removeTickerMutation.isPending}
        />
      </HStack>
      <HStack gap="3">
        <Stat.ValueText
          key={price}
          animation="scale-in 0.3s ease-out, pulse 0.5s ease-out 0.3s"
        >
          {price}
          <Stat.ValueUnit>USD</Stat.ValueUnit>
        </Stat.ValueText>
      </HStack>
    </Stat.Root >
  );
});
