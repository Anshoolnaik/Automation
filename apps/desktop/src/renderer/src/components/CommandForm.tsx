import { useState, type FormEvent } from 'react';

import { MAX_COMMAND_LENGTH } from '../../../shared/ipc-limits';

interface CommandFormProps {
  enabled: boolean;
  running: boolean;
  onRun: (command: string) => Promise<void>;
}

export function CommandForm({ enabled, running, onRun }: CommandFormProps) {
  const [command, setCommand] = useState('');
  const trimmed = command.trim();

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!enabled || running || trimmed.length === 0) return;
    void onRun(trimmed);
  };

  return (
    <section className="panel" aria-label="Command">
      <form className="command-form" onSubmit={submit}>
        <label htmlFor="command-input" className="command-label">
          What should Atlas do?
        </label>
        <div className="command-row">
          <input
            id="command-input"
            className="command-input"
            type="text"
            value={command}
            maxLength={MAX_COMMAND_LENGTH}
            placeholder="Open wikipedia.org and search for Alan Turing"
            autoComplete="off"
            spellCheck={false}
            onChange={(event) => setCommand(event.target.value)}
          />
          <button
            type="submit"
            className="button primary"
            disabled={!enabled || running || trimmed.length === 0}
          >
            {running ? 'Running…' : 'Run Task'}
          </button>
        </div>
        {!enabled && !running ? (
          <p className="hint">Launch the Agent Browser to run tasks.</p>
        ) : null}
      </form>
    </section>
  );
}
