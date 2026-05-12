import { StyleSheet, View } from "react-native";

interface Props {
  uid: number;
  isLocal?: boolean;
  style?: any;
  nativeId?: string;
}

export function AgoraRemoteView({ uid, style }: Props) {
  return <View style={[styles.fill, style]} />;
}

export function AgoraLocalView({ style }: { style?: any; nativeId?: string }) {
  return <View style={[styles.fill, style]} />;
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
});
