import { Redirect } from "expo-router";
import { useConnectionStore } from "../src/state/connection-store.js";

export default function Index(): React.JSX.Element {
  const status = useConnectionStore((s) => s.status);
  if (status === "connected" || status === "connecting" || status === "reconnecting") {
    return <Redirect href="/sessions" />;
  }
  return <Redirect href="/connect" />;
}
