import { Stack } from "expo-router";

export default function ReelsLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="setup" />
      <Stack.Screen name="upload" />
      <Stack.Screen name="search" />
      <Stack.Screen name="hashtag/[tag]" />
      <Stack.Screen name="watch/[id]" />
      <Stack.Screen name="channel/[handle]" />
      <Stack.Screen name="channel/edit" />
    </Stack>
  );
}
