import { useEffect, useMemo, useRef, useState } from "react";
import type { Entry } from "./types";
import { uid } from "./lib/id";
import { loadEntries, saveEntries } from "./lib/storage";

function normalizeTags(input: string): string[] {
  return input
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean)
    .map((t) => t.toLowerCase())
    .filter((t, i, arr) => arr.indexOf(t) === i);
}

function downloadJson(filename: string, data: unknown) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function isEntry(x: any): x is Entry {
  return (
    x &&
    typeof x === "object" &&
    typeof x.id === "string" &&
    typeof x.title === "string" &&
    typeof x.oneLiner === "string" &&
    typeof x.example === "string" &&
    Array.isArray(x.tags) &&
    typeof x.createdAt === "number" &&
    typeof x.updatedAt === "number"
  );
}

export default function App() {
  const [entries, setEntries] = useState<Entry[]>(() => {
    const loaded = loadEntries();
    // if empty, seed a couple so it doesn't look blank
    if (loaded.length > 0) return loaded;

    const now = Date.now();
    return [
      {
        id: uid(),
        title: "two-way door decisions",
        oneLiner: "reversible decisions → move fast; irreversible → slow down.",
        example: "trying a new note app is reversible. signing a long contract isn’t.",
        tags: ["decision", "speed"],
        createdAt: now,
        updatedAt: now,
      },
      {
        id: uid(),
        title: "default alive",
        oneLiner: "if it keeps options open, bias toward it.",
        example: "choose the path that preserves flexibility when you’re uncertain.",
        tags: ["life", "optionalities"],
        createdAt: now + 1,
        updatedAt: now + 1,
      },
    ];
  });

  const [selectedId, setSelectedId] = useState<string>(() => {
    const loaded = loadEntries();
    return loaded[0]?.id ?? "";
  });

  const [query, setQuery] = useState("");
  const fileRef = useRef<HTMLInputElement | null>(null);

  // persist
  useEffect(() => {
    saveEntries(entries);
  }, [entries]);

  // if selectedId is empty but we have entries, select first
  useEffect(() => {
    if (!selectedId && entries.length > 0) setSelectedId(entries[0].id);
  }, [selectedId, entries]);

  const selected = useMemo(
    () => entries.find((e) => e.id === selectedId) ?? null,
    [entries, selectedId]
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [...entries].sort((a, b) => b.updatedAt - a.updatedAt);

    return [...entries]
      .filter((e) => {
        const hay = `${e.title}\n${e.oneLiner}\n${e.example}\n${e.tags.join(" ")}`.toLowerCase();
        return hay.includes(q);
      })
      .sort((a, b) => b.updatedAt - a.updatedAt);
  }, [entries, query]);

  function createNew() {
    const now = Date.now();
    const e: Entry = {
      id: uid(),
      title: "new rule",
      oneLiner: "",
      example: "",
      tags: [],
      createdAt: now,
      updatedAt: now,
    };
    setEntries((prev) => [e, ...prev]);
    setSelectedId(e.id);
  }

  function updateSelected(patch: Partial<Entry>) {
    if (!selected) return;
    setEntries((prev) =>
      prev.map((e) =>
        e.id === selected.id
          ? { ...e, ...patch, updatedAt: Date.now() }
          : e
      )
    );
  }

  function deleteSelected() {
    if (!selected) return;
    const id = selected.id;
    setEntries((prev) => prev.filter((e) => e.id !== id));
    // pick next selection
    const remaining = entries.filter((e) => e.id !== id).sort((a, b) => b.updatedAt - a.updatedAt);
    setSelectedId(remaining[0]?.id ?? "");
  }

  function exportJson() {
    downloadJson("micro-os.json", entries);
  }

  async function importJsonFile(file: File) {
    try {
      const text = await file.text();
      const parsed = JSON.parse(text) as unknown;
      if (!Array.isArray(parsed)) throw new Error("invalid json: expected an array");

      const incoming = parsed.filter(isEntry) as Entry[];
      if (incoming.length === 0) throw new Error("no valid entries found");

      // merge by id (incoming overwrites)
      setEntries((prev) => {
        const map = new Map(prev.map((e) => [e.id, e]));
        for (const e of incoming) map.set(e.id, e);
        return Array.from(map.values()).sort((a, b) => b.updatedAt - a.updatedAt);
      });

      // select newest imported
      const newest = incoming.sort((a, b) => b.updatedAt - a.updatedAt)[0];
      if (newest?.id) setSelectedId(newest.id);
    } catch (err: any) {
      alert(err?.message ?? "import failed");
    } finally {
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  // keyboard shortcuts: n = new, ctrl/cmd+s = save (no-op but feels pro), / = focus search
  const searchRef = useRef<HTMLInputElement | null>(null);
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      const isMac = navigator.platform.toLowerCase().includes("mac");
      const mod = isMac ? e.metaKey : e.ctrlKey;

      if (e.key === "n" && !mod && (e.target as HTMLElement)?.tagName !== "INPUT" && (e.target as HTMLElement)?.tagName !== "TEXTAREA") {
        e.preventDefault();
        createNew();
      }
      if (mod && e.key.toLowerCase() === "s") {
        e.preventDefault();
        // autosave already happens via state, but this prevents browser save dialog
      }
      if (e.key === "/") {
        const t = (e.target as HTMLElement)?.tagName;
        if (t !== "INPUT" && t !== "TEXTAREA") {
          e.preventDefault();
          searchRef.current?.focus();
        }
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected, entries]);

  return (
    <div className="container">
      <div className="header">
        <div className="brand">
          <h1>micro-os</h1>
          <p>rules • mental models • if x → then y</p>
        </div>

        <div className="topActions">
          <button className="btn btnPrimary" onClick={createNew} title="new (n)">
            new <span className="kbd">n</span>
          </button>

          <button className="btn" onClick={exportJson}>
            export
          </button>

          <button className="btn" onClick={() => fileRef.current?.click()}>
            import
          </button>

          <input
            ref={fileRef}
            type="file"
            accept="application/json"
            style={{ display: "none" }}
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) importJsonFile(f);
            }}
          />
        </div>
      </div>

      <div className="grid">
        {/* LEFT: list */}
        <div className="panel">
          <div className="listHeader">
            <input
              ref={searchRef}
              className="input"
              placeholder="search… (press /)"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            <div className="small">
              {filtered.length} shown • <span className="kbd">/</span> search • <span className="kbd">ctrl/⌘ s</span> save
            </div>
          </div>

          <div className="list">
            {filtered.map((e) => (
              <div
                key={e.id}
                className={`item ${e.id === selectedId ? "itemActive" : ""}`}
                onClick={() => setSelectedId(e.id)}
              >
                <p className="itemTitle">{e.title || "untitled"}</p>
                <p className="itemSub">
                  {e.oneLiner?.trim()
                    ? e.oneLiner.slice(0, 90)
                    : "no one-liner yet"}
                  {e.oneLiner.length > 90 ? "…" : ""}
                </p>

                {e.tags.length > 0 && (
                  <div className="pills">
                    {e.tags.slice(0, 6).map((t) => (
                      <span key={t} className="pill">
                        {t}
                      </span>
                    ))}
                    {e.tags.length > 6 && <span className="pill">+{e.tags.length - 6}</span>}
                  </div>
                )}
              </div>
            ))}

            {filtered.length === 0 && (
              <div className="panelInner">
                <p style={{ margin: 0, fontWeight: 650 }}>no matches</p>
                <p className="small" style={{ marginTop: 6 }}>
                  try a different keyword or clear search.
                </p>
              </div>
            )}
          </div>
        </div>

        {/* RIGHT: editor */}
        <div className="panel">
          <div className="panelInner">
            {!selected ? (
              <>
                <p style={{ margin: 0, fontWeight: 650 }}>nothing selected</p>
                <p className="small" style={{ marginTop: 6 }}>
                  create a new rule to start.
                </p>
              </>
            ) : (
              <>
                <div className="editorTitle">
                  <div style={{ flex: 1 }}>
                    <div className="small">title</div>
                    <input
                      className="input"
                      value={selected.title}
                      onChange={(e) => updateSelected({ title: e.target.value })}
                      placeholder="e.g. two-way door decisions"
                    />
                  </div>

                  <button className="btn btnDanger" onClick={deleteSelected}>
                    delete
                  </button>
                </div>

                <div style={{ marginTop: 10 }}>
                  <div className="small">one-liner</div>
                  <input
                    className="input"
                    value={selected.oneLiner}
                    onChange={(e) => updateSelected({ oneLiner: e.target.value })}
                    placeholder="the rule in one sentence."
                  />
                </div>

                <div style={{ marginTop: 10 }}>
                  <div className="small">example</div>
                  <textarea
                    className="textarea"
                    value={selected.example}
                    onChange={(e) => updateSelected({ example: e.target.value })}
                    placeholder="show how you'd use it in real life."
                  />
                </div>

                <div style={{ marginTop: 10 }}>
                  <div className="small">tags (comma separated)</div>
                  <input
                    className="input"
                    value={selected.tags.join(", ")}
                    onChange={(e) => updateSelected({ tags: normalizeTags(e.target.value) })}
                    placeholder="decision, health, relationships"
                  />
                </div>

                <div className="meta">
                  <div className="small">
                    created:{" "}
                    {new Date(selected.createdAt).toLocaleString()}
                  </div>
                  <div className="small">
                    updated:{" "}
                    {new Date(selected.updatedAt).toLocaleString()}
                  </div>
                </div>

                <div className="preview">
                  <h3>preview</h3>
                  <p className="rule">
                    {selected.title?.trim() ? selected.title : "untitled"}
                  </p>
                  <p className="small" style={{ marginTop: 0 }}>
                    {selected.oneLiner?.trim() ? selected.oneLiner : "add a one-liner to make it punchy."}
                  </p>
                  <p className="ex">
                    {selected.example?.trim() ? selected.example : "add an example so future-you trusts this rule."}
                  </p>

                  {selected.tags.length > 0 && (
                    <div className="pills">
                      {selected.tags.map((t) => (
                        <span key={t} className="pill">
                          {t}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      <div style={{ marginTop: 14 }} className="small">
        tip: your data is saved locally in this browser. use <b>export</b> to back it up or move devices.

        contact: aevtfo@gmail.com
      </div>
    </div>
  );
}