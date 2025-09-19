"use client";

import React from "react";
import { Box, VStack } from "@chakra-ui/react";
import { HeaderSection } from "@/components/HeaderSection";
import { AddTickerFormComponent } from "@/components/AddTickerFormComponent";
import { PriceDisplay } from "@/components/PriceDisplay";
import { FooterSection } from "@/components/FooterSection";


export default function Home() {
  return (
    <Box mx="auto" p={6}>
      <VStack gap={6} align="stretch">
        <HeaderSection />
        <AddTickerFormComponent />
        <PriceDisplay />
        <FooterSection />
      </VStack>
    </Box>
  );
}
