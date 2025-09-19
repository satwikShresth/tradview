"use client"

import React from "react";
import {
  Button,
  HStack,
  Card,
  Heading,
  Input,
  Spinner,
  Field,
  Text
} from "@chakra-ui/react";

interface TickerInputFormProps {
  form: any;
  mutation: any;
  onSubmit: () => void;
}


export const TickerInputForm: React.FC<TickerInputFormProps> = ({
  form,
  mutation,
  onSubmit
}) => {
  return (
    <Card.Root>
      <Card.Header>
        <Heading size="lg">Add New Ticker</Heading>
      </Card.Header>
      <Card.Body>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onSubmit();
          }}
        >
          <HStack gap={4} align="stretch">
            <form.Field
              name="tickerId"
              children={(field: any) => (
                <Field.Root
                  required
                  invalid={!!field.state.meta.errors.length}
                >
                  <Field.Label>
                    Ticker ID <Field.RequiredIndicator />
                  </Field.Label>
                  <Input
                    name={field.name}
                    value={field.state.value}
                    onChange={(e) => field.handleChange(e.target.value)}
                    onBlur={field.handleBlur}
                    placeholder="Enter ticker ID (e.g., BTCUSD)"
                    size="lg"
                    textTransform="uppercase"
                    disabled={mutation.isPending}
                  />
                  <Field.HelperText>
                    Enter a cryptocurrency ticker (e.g., BTCUSD, ETHUSD)
                  </Field.HelperText>
                  {field.state.meta.errors.length > 0 && (
                    <Field.ErrorText>
                      {field.state.meta.errors.join(", ")}
                    </Field.ErrorText>
                  )}
                </Field.Root>
              )}
            />

            <HStack gap={5} pt={2}>
              <Button
                type="submit"
                colorScheme="blue"
                size="lg"
                disabled={mutation.isPending || !form.state.canSubmit}
              >
                {mutation.isPending ? (
                  <HStack>
                    <Spinner size="sm" />
                    <Text>Adding...</Text>
                  </HStack>
                ) : (
                  "Add Ticker"
                )}
              </Button>
            </HStack>
          </HStack>
        </form>
      </Card.Body>
    </Card.Root>
  );
};
