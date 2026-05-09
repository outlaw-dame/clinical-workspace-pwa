import { For, Show, createMemo, createSignal, onMount } from "solid-js";
import { AppSymbol } from "../design/icons";
import {
  createSecureNote,
  listSecureNotes,
  softDeleteSecureNote,
  type SecureNote
} from "../local/notes/secureNotes";
import { searchSecureNotes } from "../local/search/localSearchIndex";
import type { LocalSearchMode, LocalSearchResult } from "../local/search/searchTypes";

const noteDateFormatter = new Intl.DateTimeFormat(undefined, {
  dateStyle: "medium",
  timeStyle: "short"
});

export function NotesWorkspace() {
  const [notes, setNotes] = createSignal<SecureNote[]>([]);
  const [title, setTitle] = createSignal("");
  const [body, setBody] = createSignal("");
  const [searchQuery, setSearchQuery] = createSignal("");
  const [searchMode, setSearchMode] = createSignal<LocalSearchMode>("hybrid");
  const [searchResults, setSearchResults] = createSignal<LocalSearchResult[]>([]);
  const [searchActive, setSearchActive] = createSignal(false);
  const [loading, setLoading] = createSignal(true);
  const [saving, setSaving] = createSignal(false);
  const [searching, setSearching] = createSignal(false);
  const [errorMessage, setErrorMessage] = createSignal<string | undefined>();

  const canSave = createMemo(() => !saving() && (title().trim().length > 0 || body().trim().length > 0));
  const canSearch = createMemo(() => !searching() && searchQuery().trim().length >= 2);
  const notesById = createMemo(() => new Map(notes().map((note) => [note.id, note])));
  const renderedSearchResults = createMemo(() =>
    searchResults()
      .map((result) => ({ result, note: notesById().get(result.recordId) }))
      .filter((item): item is { result: LocalSearchResult; note: SecureNote } => item.note !== undefined)
  );

  onMount(() => {
    void refreshNotes();
  });

  const refreshNotes = async (): Promise<void> => {
    setLoading(true);
    setErrorMessage(undefined);

    try {
      const nextNotes = await listSecureNotes();
      setNotes(nextNotes);
      if (searchActive()) await runSearchForNotes(nextNotes);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Unable to load secure notes");
    } finally {
      setLoading(false);
    }
  };

  const saveNote = async (): Promise<void> => {
    if (!canSave()) return;

    setSaving(true);
    setErrorMessage(undefined);

    try {
      const note = await createSecureNote({ title: title(), body: body() });
      const nextNotes = [note, ...notes()];
      setNotes(nextNotes);
      setTitle("");
      setBody("");
      if (searchActive()) await runSearchForNotes(nextNotes);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Unable to save secure note");
    } finally {
      setSaving(false);
    }
  };

  const deleteNote = async (noteId: string): Promise<void> => {
    setErrorMessage(undefined);

    try {
      await softDeleteSecureNote(noteId);
      const nextNotes = notes().filter((note) => note.id !== noteId);
      setNotes(nextNotes);
      if (searchActive()) await runSearchForNotes(nextNotes);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Unable to delete secure note");
    }
  };

  const runSearch = async (): Promise<void> => {
    if (!canSearch()) return;
    await runSearchForNotes(notes());
  };

  const runSearchForNotes = async (noteSource: SecureNote[]): Promise<void> => {
    setSearching(true);
    setErrorMessage(undefined);

    try {
      const results = await searchSecureNotes(noteSource, searchQuery(), {
        mode: searchMode(),
        limit: 20
      });
      setSearchResults(results);
      setSearchActive(true);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Unable to search secure notes");
    } finally {
      setSearching(false);
    }
  };

  const clearSearch = (): void => {
    setSearchActive(false);
    setSearchResults([]);
    setSearchQuery("");
  };

  return (
    <div class="notes-grid">
      <section class="note-composer grouped-card" aria-labelledby="new-note-title">
        <header class="card-header">
          <p class="eyebrow">Encrypted notebook</p>
          <h2 id="new-note-title">Create a secure note</h2>
          <p>Titles and bodies are encrypted together before they are written to the local database.</p>
        </header>

        <label class="field-label" for="note-title">Title</label>
        <input
          id="note-title"
          class="text-field"
          value={title()}
          maxLength={160}
          placeholder="Session summary, treatment plan, follow-up..."
          onInput={(event) => setTitle(event.currentTarget.value)}
        />

        <label class="field-label" for="note-body">Body</label>
        <textarea
          id="note-body"
          class="text-area"
          value={body()}
          maxLength={20_000}
          placeholder="Write the note locally. Rich note bodies and collaboration can come after the encrypted foundation is stable."
          onInput={(event) => setBody(event.currentTarget.value)}
        />

        <button class="primary-button compact" type="button" disabled={!canSave()} onClick={() => void saveNote()}>
          <AppSymbol name="plus" />
          {saving() ? "Saving..." : "Save encrypted note"}
        </button>
      </section>

      <section class="grouped-card" aria-labelledby="notes-list-title">
        <header class="card-header split-header">
          <div>
            <p class="eyebrow">Local records</p>
            <h2 id="notes-list-title">Secure notes</h2>
            <p>
              {loading()
                ? "Decrypting local notes..."
                : `${notes().length} encrypted note${notes().length === 1 ? "" : "s"}`}
            </p>
          </div>
          <button class="secondary-icon-button" type="button" onClick={() => void refreshNotes()} aria-label="Refresh notes">
            <AppSymbol name="database" />
          </button>
        </header>

        <form
          class="notes-search"
          onSubmit={(event) => {
            event.preventDefault();
            void runSearch();
          }}
        >
          <label class="field-label compact" for="notes-search-query">Search encrypted notes</label>
          <div class="search-row">
            <input
              id="notes-search-query"
              class="text-field"
              value={searchQuery()}
              maxLength={240}
              placeholder="Search terms or natural language..."
              onInput={(event) => setSearchQuery(event.currentTarget.value)}
            />
            <select
              class="select-field"
              value={searchMode()}
              aria-label="Search mode"
              onChange={(event) => setSearchMode(event.currentTarget.value as LocalSearchMode)}
            >
              <option value="hybrid">Hybrid</option>
              <option value="lexical">Text</option>
              <option value="semantic">Semantic</option>
            </select>
          </div>
          <div class="search-actions">
            <button class="primary-button compact" type="submit" disabled={!canSearch()}>
              <AppSymbol name="search" />
              {searching() ? "Searching..." : "Search locally"}
            </button>
            <Show when={searchActive()}>
              <button class="secondary-button compact" type="button" onClick={clearSearch}>
                Clear search
              </button>
            </Show>
          </div>
          <p class="privacy-note">Search runs inside the unlocked local workspace. Query text is never written to audit logs.</p>
        </form>

        <Show when={errorMessage()}>
          {(message) => <p class="error-message" role="alert">{message()}</p>}
        </Show>

        <Show when={searchActive()}>
          <p class="search-summary">
            {searching()
              ? "Searching local notes..."
              : `${renderedSearchResults().length} local result${renderedSearchResults().length === 1 ? "" : "s"}`}
          </p>
        </Show>

        <Show
          when={searchActive() ? renderedSearchResults().length > 0 : notes().length > 0}
          fallback={
            <p class="empty-state">
              {searchActive()
                ? "No local notes matched that search."
                : "No secure notes yet. Create one to verify the encrypted local notes flow."}
            </p>
          }
        >
          <div class="note-list">
            <Show
              when={searchActive()}
              fallback={
                <For each={notes()}>
                  {(note) => <NoteCard note={note} onDelete={deleteNote} />}
                </For>
              }
            >
              <For each={renderedSearchResults()}>
                {(item) => (
                  <NoteCard
                    note={item.note}
                    matchKind={item.result.matchKind}
                    preview={item.result.preview}
                    onDelete={deleteNote}
                  />
                )}
              </For>
            </Show>
          </div>
        </Show>
      </section>
    </div>
  );
}

function NoteCard(props: {
  note: SecureNote;
  preview?: string;
  matchKind?: string;
  onDelete: (noteId: string) => Promise<void>;
}) {
  const bodyPreview = createMemo(() => props.preview ?? (props.note.body || "No body text."));

  return (
    <article class="note-card">
      <div class="note-card-header">
        <div>
          <h3>{props.note.title}</h3>
          <time dateTime={props.note.updatedAt}>{formatNoteDate(props.note.updatedAt)}</time>
        </div>
        <button
          class="secondary-icon-button danger"
          type="button"
          onClick={() => void props.onDelete(props.note.id)}
          aria-label={`Delete ${props.note.title}`}
        >
          <AppSymbol name="trash" />
        </button>
      </div>
      <Show when={props.matchKind}>
        {(kind) => <span class="match-pill">{kind()}</span>}
      </Show>
      <p>{bodyPreview()}</p>
    </article>
  );
}

function formatNoteDate(value: string): string {
  return noteDateFormatter.format(new Date(value));
}
