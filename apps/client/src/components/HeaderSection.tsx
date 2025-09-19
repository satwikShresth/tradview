"use client"

import React from "react";
import { Box, Text, Heading } from "@chakra-ui/react";

export const HeaderSection = React.memo(() => (
  <Box textAlign="center">
    <Heading size="2xl" mb={2}>
      TradView Price Tracker
    </Heading>
    <Text color="gray.600" fontSize="lg">
      Add cryptocurrency tickers to start tracking real-time prices
    </Text>
  </Box>
));
