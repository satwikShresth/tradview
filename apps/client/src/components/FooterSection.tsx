"use client"

import React from "react";
import { Box, Text } from "@chakra-ui/react";

export const FooterSection = React.memo(() => (
  <Box>
    <Text fontSize="sm" color="gray.500" textAlign="center">
      💡 Tip: Popular tickers include BTCUSD, ETHUSD, ADAUSD, SOLUSD
    </Text>
  </Box>
));
