import { Stack } from "expo-router";
import React from "react";

import { ErrorBoundary } from "@/components/ErrorBoundary";
import { ScreenErrorFallback } from "@/components/ScreenErrorFallback";

export default function CallLayout() {
  return (
    <ErrorBoundary
      FallbackComponent={(props) => (
        <ScreenErrorFallback
          {...props}
          title="Call couldn't start"
          message="There was a problem with this call screen. Go back and try calling again."
        />
      )}
    >
      <Stack screenOptions={{ headerShown: false, presentation: "fullScreenModal" }}>
        <Stack.Screen name="[id]" />
      </Stack>
    </ErrorBoundary>
  );
}
