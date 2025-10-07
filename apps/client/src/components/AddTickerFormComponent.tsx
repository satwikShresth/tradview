"use client"

import React from "react";
import { useMutation } from "@connectrpc/connect-query";
import { TradViewService } from "@tradview/proto";
import { useForm } from "@tanstack/react-form";
import { useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import { Button, HStack, Card, Heading, Field, Text, Center } from "@chakra-ui/react";
import { AsyncCreatableSelect } from 'chakra-react-select';
import { toaster } from "@/components/ui/toaster";
import { priceStore } from "@/stores/priceStore";
import { tickerAutocomplete, validateTicker, type TickerSuggestion } from "@/queryOptions";

const tickerSchema = z.object({
  tickerId: z.string().min(1, "Ticker required").toUpperCase()
});

const validateTickerWithZod = (tickerId: string) => {
  const result = tickerSchema.safeParse({ tickerId });
  return result.success ? undefined : result.error.issues[0]?.message || "Invalid ticker";
};

export interface AutocompleteOptions {
  value: string;
  label: string;
  variant: string;
  data?: TickerSuggestion;
}

export const convertTickerFunc = (suggestion: TickerSuggestion | string | undefined): AutocompleteOptions => {
  if (typeof suggestion === 'string') {
    return { value: suggestion.toUpperCase(), label: suggestion.toUpperCase(), variant: 'subtle' };
  }
  if (suggestion?.symbol && suggestion?.name) {
    return { value: suggestion.symbol, label: `${suggestion.symbol} - ${suggestion.name}`, variant: 'subtle', data: suggestion };
  }
  return { value: '', label: '', variant: 'subtle' };
};


export const isInvalid = (field: any) => !field.state.meta.isValid;

export const AddTickerFormComponent = () => {
  const queryClient = useQueryClient();
  const addTickerMutation = useMutation(TradViewService.method.addTicker, {
    onSuccess: (response) => {
      if (response.success) {
        console.log('[AddTicker] Successfully added ticker:', response.tickerId);
        priceStore.send({ type: 'addPlaceholderTicker', ticker: response.tickerId });
        toaster.create({ title: "Success", description: `${response.tickerId} added`, type: "success" });
        form.reset();
      } else {
        console.error('[AddTicker] Server rejected ticker:', response.message);
        toaster.create({ title: "Failed", description: response.message, type: "error" });
      }
    },
    onError: (error) => {
      console.error('[AddTicker] Network/validation error:', error.message);
      toaster.create({ title: "Error", description: error.message, type: "error" });
    },
  });

  const form = useForm({
    defaultValues: {
      tickerId: ""
    },
    onSubmit: async ({ value: { tickerId } }) => {
      await addTickerMutation
        .mutateAsync({ tickerId: tickerId.trim().toUpperCase() })
        .catch(() => { })
    },
  });

  return (
    <Center>

      <Card.Root minWidth="500px" maxWidth='900px'>
        <Card.Header>
          <Heading size="lg">Add New Ticker</Heading>
        </Card.Header>
        <Card.Body>
          <HStack gap={4} align='center'>
            <form.Field
              name="tickerId"
              validators={{
                onChange: ({ value }) => validateTickerWithZod(value),
                onSubmitAsync: async ({ value: tickerId }) => {
                  const zodError = validateTickerWithZod(tickerId);
                  if (zodError) return zodError;
                  return await queryClient
                    .fetchQuery(validateTicker(tickerId))
                    .then(({ totalCount }) => {
                      if (totalCount === 0) {
                        return `${tickerId} not found`;
                      }
                      return;
                    })
                    .catch(() => 'Validation failed');
                },
              }}
            >
              {(field) => (
                <Field.Root
                  required
                  invalid={isInvalid(field)}
                >
                  <Field.Label>
                    Ticker ID <Field.RequiredIndicator />
                  </Field.Label>
                  {/*@ts-ignore: chakra-react-select types*/}
                  <AsyncCreatableSelect
                    name={field.name}
                    invalid={isInvalid(field)}
                    value={field.state.value ? convertTickerFunc(field.state.value) : null}
                    onChange={(option: AutocompleteOptions | null) => {
                      const value = option?.value || '';
                      field.handleChange(value.toUpperCase());
                    }}
                    onBlur={field.handleBlur}
                    placeholder="Search (e.g., BTC, ETH)"
                    size="lg"
                    isDisabled={addTickerMutation.isPending}
                    loadOptions={async (inputValue: string) => {
                      if (!inputValue || inputValue.length < 1) {
                        return await Promise.resolve([]);
                      }

                      return await queryClient
                        .ensureQueryData(tickerAutocomplete(inputValue))
                        .then(({ data }) => data
                          .filter((item: any) => item.s && item.s.includes("USD")) // Only include USD pairs
                          .map((item: any) => convertTickerFunc({
                            symbol: item.s.split(":")[1], // BTCUSD
                            name: item.d[1], // Bitcoin
                            price: item.d[2] || 0, // 115773.05
                            fullSymbol: item.s, // CRYPTO:BTCUSD
                            marketCap: item.d[3], // Market cap if available
                          })) || []
                        )
                        .catch(() => {
                          return [];
                        });
                    }}
                    formatCreateLabel={(inputValue: string) => (
                      <Text as="span" color="gray.200">
                        use <Text as="span" fontWeight="bold">"{inputValue.toUpperCase()}"</Text>
                      </Text>
                    )}
                    noOptionsMessage={({ inputValue }: { inputValue: string }) =>
                      inputValue.length >= 1 ?
                        `No suggestions found for "${inputValue.toUpperCase()}"` :
                        "Type to search or enter a ticker"
                    }
                    loadingMessage={() => "Searching tickers..."}
                    isClearable
                    isSearchable
                    cacheOptions
                    defaultOptions={false}
                    menuIsOpen={undefined}
                    allowCreateWhileLoading={true}
                    createOptionPosition='last'
                  />
                  <Field.HelperText>
                    Search or enter ticker symbol.
                  </Field.HelperText>
                  <Field.ErrorText>
                    {field.state.meta.errors.join(", ")}
                  </Field.ErrorText>
                </Field.Root>
              )}
            </form.Field>
            <form.Subscribe
              selector={(state) => [state.canSubmit, state.isSubmitting, state.isPristine, state.isValidating]}
            >
              {([canSubmit, isSubmitting, isPristine, isValidating]) => (
                <Button
                  type='submit'
                  colorPalette='green'
                  disabled={isSubmitting || !canSubmit || isPristine}
                  loading={isSubmitting || isValidating}
                  loadingText='Submiting...'
                  onClick={() => form.handleSubmit()}
                >
                  Add Ticker
                </Button>
              )}
            </form.Subscribe>
          </HStack>
        </Card.Body>
      </Card.Root >
    </Center>
  );
};
