import { useMemo } from "react";
import { createTwoFilesPatch } from "diff";
import { FileDiff, processFile, type FileDiffMetadata } from "@pierre/diffs";

interface Props {
  /** Name shown in the file header. Used for language inference. */
  name: string;
  /** Earlier version of the file. Empty string for an added file. */
  before: string;
  /** Newer version of the file. Empty string for a deleted file. */
  after: string;
  /** Optional prior path (when the file was renamed or moved). */
  prevName?: string;
  /** Override the diff layout. Defaults to split side-by-side. */
  layout?: "split" | "unified";
  className?: string;
}

const DARK_THEME = "pierre-dark";

/**
 * Render a two-version diff of a single file. The renderer is a Shadow DOM +
 * CSS grid component with shiki-powered syntax highlighting; hunks are
 * computed client-side from a unified-diff patch produced via `diff.createTwoFilesPatch`.
 *
 * Pairs naturally with the `diff.open` client command — the renderer asks
 * the daemon for a diff and the {name, before, after} triple drives this view.
 */
export function DiffView({ name, before, after, prevName, layout = "split", className }: Props) {
  const fileDiff = useMemo<FileDiffMetadata | null>(() => {
    if (before === after) return null;
    const patch = createTwoFilesPatch(prevName ?? name, name, before, after, undefined, undefined, {
      context: 3,
    });
    return (
      processFile(patch, {
        oldFile: { name: prevName ?? name, contents: before },
        newFile: { name, contents: after },
      }) ?? null
    );
  }, [name, prevName, before, after]);

  if (!fileDiff) {
    return (
      <div
        className={
          className ??
          "flex h-full w-full items-center justify-center bg-neutral-950 text-sm text-neutral-500"
        }
      >
        No changes — both sides are identical.
      </div>
    );
  }

  return (
    <div className={className ?? "h-full w-full overflow-auto bg-neutral-950"}>
      {/*
        The pierre renderer exposes a custom-element-backed React component.
        The TypeScript JSX checker in React 19 rejects its component type, so
        cast through `unknown` to render the underlying element. The runtime
        type matches React's element signature.
      */}
      <RenderFileDiff fileDiff={fileDiff} layout={layout} />
    </div>
  );
}

function RenderFileDiff({ fileDiff, layout }: { fileDiff: FileDiffMetadata; layout: "split" | "unified" }) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const Fd = FileDiff as unknown as React.ComponentType<{
    fileDiff: FileDiffMetadata;
    options: { theme: string; diffStyle: "split" | "unified"; expansionDirection: "expand-up" };
  }>;
  return (
    <Fd
      fileDiff={fileDiff}
      options={{
        theme: DARK_THEME,
        diffStyle: layout,
        expansionDirection: "expand-up",
      }}
    />
  );
}
