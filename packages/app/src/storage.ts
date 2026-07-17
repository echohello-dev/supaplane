import AsyncStorage from "@react-native-async-storage/async-storage";

const ENDPOINT_KEY = "@supaplane/saved-endpoint";
const LABEL_KEY = "@supaplane/saved-label";
const SERVER_ID_KEY = "@supaplane/trusted-server-id";
const FINGERPRINT_KEY = "@supaplane/trusted-fingerprint";

export interface SavedConnection {
  endpoint: string;
  label: string;
}

export interface TrustedServer {
  serverId: string;
  fingerprint: string;
}

export async function loadSavedConnection(): Promise<SavedConnection | null> {
  const [endpoint, label] = await Promise.all([
    AsyncStorage.getItem(ENDPOINT_KEY),
    AsyncStorage.getItem(LABEL_KEY),
  ]);
  if (!endpoint) return null;
  return { endpoint, label: label ?? "" };
}

export async function saveConnection(conn: SavedConnection): Promise<void> {
  await AsyncStorage.setMany({
    [ENDPOINT_KEY]: conn.endpoint,
    [LABEL_KEY]: conn.label,
  });
}

export async function clearConnection(): Promise<void> {
  await AsyncStorage.removeMany([ENDPOINT_KEY, LABEL_KEY]);
}

export async function loadTrustedServer(): Promise<TrustedServer | null> {
  const [serverId, fingerprint] = await Promise.all([
    AsyncStorage.getItem(SERVER_ID_KEY),
    AsyncStorage.getItem(FINGERPRINT_KEY),
  ]);
  if (!serverId || !fingerprint) return null;
  return { serverId, fingerprint };
}

export async function saveTrustedServer(server: TrustedServer): Promise<void> {
  await AsyncStorage.setMany({
    [SERVER_ID_KEY]: server.serverId,
    [FINGERPRINT_KEY]: server.fingerprint,
  });
}
