import { StyleSheet, View } from "react-native";

interface Props {
  uid: number;
  isLocal?: boolean;
  style?: any;
  nativeId?: string;
}

export function AgoraRemoteView({ style, nativeId }: { style?: any; nativeId?: string }) {
  return <View nativeID={nativeId} style={[styles.fill, style]} />;
}

export function AgoraLocalView({ style, nativeId }: { style?: any; nativeId?: string }) {
  return <View nativeID={nativeId} style={[styles.fill, style]} />;
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
});
