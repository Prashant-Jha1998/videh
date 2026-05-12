import React, { useEffect, useRef } from "react";
import { Animated, Image, StyleSheet, Text, View } from "react-native";

export default function SplashAnimScreen({ onDone }: { onDone?: () => void }) {
  const scale = useRef(new Animated.Value(0.6)).current;
  const opacity = useRef(new Animated.Value(0)).current;
  const textOpacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.sequence([
      Animated.parallel([
        Animated.spring(scale, { toValue: 1, useNativeDriver: false, tension: 60, friction: 8 }),
        Animated.timing(opacity, { toValue: 1, duration: 500, useNativeDriver: false }),
      ]),
      Animated.timing(textOpacity, { toValue: 1, duration: 400, useNativeDriver: false, delay: 100 }),
    ]).start(() => {
      setTimeout(() => onDone?.(), 800);
    });
  }, []);

  return (
    <View style={styles.container}>
      <Animated.View style={{ transform: [{ scale }], opacity }}>
        <Image
          source={require("@/assets/images/videh_logo.png")}
          style={styles.logo}
          resizeMode="contain"
        />
      </Animated.View>
      <Animated.View style={{ opacity: textOpacity }}>
        <Text style={styles.name}>Videh</Text>
        <Text style={styles.tagline}>Connect. Share. Stay.</Text>
      </Animated.View>
      <Text style={styles.from}>from Videh Technologies</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#0B141A",
    alignItems: "center",
    justifyContent: "center",
  },
  logo: {
    width: 120,
    height: 120,
    marginBottom: 24,
  },
  name: {
    color: "#FFFFFF",
    fontSize: 36,
    fontFamily: "Inter_700Bold",
    textAlign: "center",
    letterSpacing: 2,
  },
  tagline: {
    color: "#8696A0",
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    textAlign: "center",
    marginTop: 6,
    letterSpacing: 1,
  },
  from: {
    position: "absolute",
    bottom: 50,
    color: "#667781",
    fontSize: 12,
    fontFamily: "Inter_400Regular",
  },
});
