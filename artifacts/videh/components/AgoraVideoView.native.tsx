import { createAgoraRtcEngine, RtcSurfaceView, VideoSourceType } from "react-native-agora";
import { StyleSheet, View } from "react-native";

interface Props {
  uid: number;
  isLocal?: boolean;
  style?: any;
}

export function AgoraRemoteView({ uid, style }: Props) {
  return <RtcSurfaceView canvas={{ uid }} style={[styles.fill, style]} />;
}

export function AgoraLocalView({ style }: { style?: any }) {
  return (
    <RtcSurfaceView
      canvas={{ uid: 0, sourceType: VideoSourceType.VideoSourceCamera }}
      style={[styles.fill, style]}
    />
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
});
