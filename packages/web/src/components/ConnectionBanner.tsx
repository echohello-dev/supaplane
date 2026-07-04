interface Props {
  connected: boolean;
  serverId: string | null;
  error: string | null;
}

export function ConnectionBanner({ connected, serverId, error }: Props) {
  const label = error
    ? `Disconnected — ${error}`
    : connected
      ? `Connected to ${serverId ?? "unknown server"}`
      : "Connecting…";
  const tone = error
    ? "bg-red-950 text-red-200"
    : connected
      ? "bg-emerald-950 text-emerald-200"
      : "bg-neutral-900 text-neutral-300";

  return (
    <header
      className={`flex items-center justify-between border-b border-neutral-800 px-4 py-2 text-sm ${tone}`}
    >
      <span className="font-mono">{label}</span>
      <span className="text-xs opacity-60">Supaplane web</span>
    </header>
  );
}
