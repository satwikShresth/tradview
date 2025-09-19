"use client"

import React from "react";
import { useMutation } from "@connectrpc/connect-query";
import { TradViewService } from "@tradview/proto";
import { useForm } from "@tanstack/react-form";
import { toaster } from "@/components/ui/toaster";
import { TickerInputForm } from "@/components/TickerInputForm";
import { priceStore } from "@/stores/priceStore";

export const AddTickerFormComponent = React.memo(() => {
  const addTickerMutation = useMutation(TradViewService.method.addTicker, {
    onSuccess: (response) => {
      if (response.success) {
        priceStore.send({
          type: 'addPlaceholderTicker',
          ticker: response.tickerId
        });

        toaster.create({
          title: "Ticker Added Successfully",
          description: `${response.tickerId} has been added to your watchlist`,
          type: "success",
          duration: 5000,
          closable: true,
        });
        form.reset();
      } else {
        toaster.create({
          title: "Failed to Add Ticker",
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

  const form = useForm({
    defaultValues: {
      tickerId: ""
    },
    onSubmit: async ({ value: { tickerId } }) => {
      if (!tickerId.trim()) {
        toaster.create({
          title: "Invalid Input",
          description: "Please enter a valid ticker ID",
          type: "warning",
          duration: 3000,
          closable: true,
        });
        return;
      }

      await addTickerMutation
        .mutateAsync({ tickerId: tickerId.trim().toUpperCase() })
        .catch(error => { console.error("Form submission error:", error) })
    },
    validators: {
      onBlur: ({ value }) => {
        if (!value.tickerId) {
          return "Ticker ID is required";
        }
        if (value.tickerId.length < 2) {
          return "Ticker ID must be at least 2 characters";
        }
        if (!/^[A-Za-z0-9]+$/.test(value.tickerId)) {
          return "Ticker ID can only contain letters and numbers";
        }
        return undefined;
      },
    },
  });

  return (
    <TickerInputForm
      form={form}
      mutation={addTickerMutation}
      onSubmit={() => form.handleSubmit()}
    />
  );
});
