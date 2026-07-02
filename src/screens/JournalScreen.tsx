import { useState } from 'react';
import { useStore, STAGES } from '../store/AppStore';
import { ScreenHeader } from '../components/ui';
import { STAGES_BY_ID } from '../data/stages';
import { HUTS_BY_ID } from '../data/huts';
import { formatDateLong, todayIso } from '../utils/format';
import type { JournalEntry } from '../types';

function newDraft(currentStageId: string | null): JournalEntry {
  return {
    id: `j_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`,
    date: todayIso(),
    stageId: currentStageId,
    mood: 3,
    energy: 3,
    weather: '',
    highlight: '',
    challenge: '',
    reflection: '',
    updatedAt: Date.now(),
  };
}

function ScoreSelect({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (n: number) => void;
}) {
  return (
    <label className="field">
      <span>
        {label}: {value}/5
      </span>
      <div className="score-row">
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            type="button"
            className="score-dot"
            aria-pressed={value === n}
            onClick={() => onChange(n)}
          >
            {n}
          </button>
        ))}
      </div>
    </label>
  );
}

function stageLabel(stageId: string | null): string {
  if (!stageId) return 'No stage';
  const s = STAGES_BY_ID[stageId];
  if (!s) return 'No stage';
  return `Day ${s.day}: ${HUTS_BY_ID[s.fromHutId]?.name} → ${HUTS_BY_ID[s.toHutId]?.name}`;
}

export function JournalScreen() {
  const { state, currentStage, upsertJournalEntry, deleteJournalEntry } = useStore();
  const [draft, setDraft] = useState<JournalEntry | null>(null);

  const entries = [...state.journal].sort((a, b) => b.updatedAt - a.updatedAt);

  const startNew = () => setDraft(newDraft(currentStage?.id ?? null));
  const startEdit = (e: JournalEntry) => setDraft({ ...e });

  const save = () => {
    if (!draft) return;
    upsertJournalEntry({ ...draft, updatedAt: Date.now() });
    setDraft(null);
  };

  const patch = (p: Partial<JournalEntry>) =>
    setDraft((d) => (d ? { ...d, ...p } : d));

  return (
    <div className="screen">
      <ScreenHeader eyebrow="One day at a time" title="Journal">
        A quiet record of the trail — mood, weather, and the moments worth
        keeping.
      </ScreenHeader>

      {draft ? (
        <div className="card">
          <div className="row-between">
            <span className="card-title">
              {state.journal.some((e) => e.id === draft.id) ? 'Edit entry' : 'New entry'}
            </span>
            <button className="link-btn" onClick={() => setDraft(null)}>
              Cancel
            </button>
          </div>

          <label className="field">
            <span>Date</span>
            <input
              className="input"
              type="date"
              value={draft.date}
              onChange={(e) => patch({ date: e.target.value })}
            />
          </label>

          <label className="field">
            <span>Stage</span>
            <select
              className="select"
              value={draft.stageId ?? ''}
              onChange={(e) => patch({ stageId: e.target.value || null })}
            >
              <option value="">No stage</option>
              {STAGES.map((s) => (
                <option key={s.id} value={s.id}>
                  {stageLabel(s.id)}
                </option>
              ))}
            </select>
          </label>

          <ScoreSelect label="Mood" value={draft.mood} onChange={(n) => patch({ mood: n })} />
          <ScoreSelect
            label="Energy"
            value={draft.energy}
            onChange={(n) => patch({ energy: n })}
          />

          <label className="field">
            <span>Weather</span>
            <input
              className="input"
              placeholder="Low cloud, light rain, 6°C…"
              value={draft.weather}
              onChange={(e) => patch({ weather: e.target.value })}
            />
          </label>

          <label className="field">
            <span>Highlight of the day</span>
            <textarea
              className="textarea"
              placeholder="The thing you’ll still remember next year."
              value={draft.highlight}
              onChange={(e) => patch({ highlight: e.target.value })}
            />
          </label>

          <label className="field">
            <span>Challenge of the day</span>
            <textarea
              className="textarea"
              placeholder="What was hard, and how you handled it."
              value={draft.challenge}
              onChange={(e) => patch({ challenge: e.target.value })}
            />
          </label>

          <label className="field">
            <span>Reflection</span>
            <textarea
              className="textarea"
              placeholder="Anything else on your mind tonight."
              value={draft.reflection}
              onChange={(e) => patch({ reflection: e.target.value })}
            />
          </label>

          <button className="btn btn-primary btn-block" style={{ marginTop: 16 }} onClick={save}>
            Save entry
          </button>
        </div>
      ) : (
        <button className="btn btn-accent btn-block" onClick={startNew}>
          + New journal entry
        </button>
      )}

      {!draft && entries.length === 0 ? (
        <div className="card empty">
          <div className="glyph">📓</div>
          <p>
            No entries yet. After today’s walk, write down one highlight and one
            challenge — future you will thank you.
          </p>
        </div>
      ) : null}

      {!draft && entries.length > 0 ? (
        <div className="stack" style={{ marginTop: 16 }}>
          {entries.map((e) => (
            <div className="card" key={e.id}>
              <div className="row-between">
                <span className="card-title">{formatDateLong(e.date)}</span>
                <span className="pill pill-glacier tnum">
                  ☺ {e.mood} · ⚡ {e.energy}
                </span>
              </div>
              <p className="card-sub" style={{ marginTop: 4 }}>
                {stageLabel(e.stageId)}
                {e.weather ? ` · ${e.weather}` : ''}
              </p>

              {e.highlight?.trim() ? (
                <p style={{ marginTop: 10, lineHeight: 1.5 }}>
                  <strong>Highlight.</strong> {e.highlight}
                </p>
              ) : null}
              {e.challenge?.trim() ? (
                <p style={{ marginTop: 6, lineHeight: 1.5 }}>
                  <strong>Challenge.</strong> {e.challenge}
                </p>
              ) : null}
              {e.reflection?.trim() ? (
                <p style={{ marginTop: 6, lineHeight: 1.5, color: 'var(--ink-soft)' }}>
                  {e.reflection}
                </p>
              ) : null}

              <div className="row" style={{ marginTop: 12, gap: 8 }}>
                <button className="btn btn-ghost" onClick={() => startEdit(e)}>
                  Edit
                </button>
                <button
                  className="btn btn-danger"
                  onClick={() => {
                    if (confirm('Delete this journal entry?')) deleteJournalEntry(e.id);
                  }}
                >
                  Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}
