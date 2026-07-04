import { StyleSheet, Text, View } from "react-native";

export default function Home(): React.JSX.Element {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Supaplane</Text>
      <Text style={styles.subtitle}>
        Connect to a daemon via QR code or an access code to start a session.
      </Text>
      <Text style={styles.footnote}>
        Mobile app scaffold — wire to @echohello/client in a follow-up.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 24,
    backgroundColor: "#0a0a0f",
  },
  title: {
    fontSize: 36,
    fontWeight: "700",
    color: "#e5e5e5",
    marginBottom: 12,
  },
  subtitle: {
    fontSize: 16,
    color: "#a3a3a3",
    textAlign: "center",
    marginBottom: 24,
  },
  footnote: {
    fontSize: 12,
    color: "#525252",
    textAlign: "center",
  },
});
