import { describe, expect, it } from 'vitest';
import { RUNTIMES } from '../src/connectors/maritime/runtimes.js';

// Model lists come from the harness (2026-11-01): each turn leaves the harness's own list on the VM, the runtime
// reads it into the composer's choices, and nothing is listed in Harbor itself.
const input = { orgUrl: 'http://localhost:1', agentKey: 'rbk_x', promptPath: '/p', outPath: '/o.jsonl', errPath: '/e.err', lastPath: '/l' };
const EFFORT = { type: 'select', key: 'effort', label: 'Effort', choices: [{ id: 'low', label: 'Low' }, { id: 'medium', label: 'Medium' }, { id: 'high', label: 'High' }] };

describe('model lists from the harness', () => {
  it('each turn script leaves the harness’s list where the connector reads it, after the turn, whether the turn passed or failed', () => {
    for (const runtime of Object.values(RUNTIMES)) {
      const script = runtime.command(input);
      // The CLI runs with -e off, its exit code kept, the list left, then the script exits with the CLI's code.
      expect(script.indexOf('set +e')).toBeGreaterThan(0);
      expect(script.indexOf('set +e')).toBeLessThan(script.indexOf('TURN_EXIT=$?'));
      expect(script.indexOf('TURN_EXIT=$?')).toBeLessThan(script.indexOf(runtime.modelsPath));
      expect(script.trimEnd().endsWith('exit $TURN_EXIT')).toBe(true);
    }
    const codex = RUNTIMES.codex!.command(input);
    expect(codex).toContain(`cp "$CODEX_HOME/models_cache.json" ${RUNTIMES.codex!.modelsPath}`);
    expect(codex).toContain('"$OPENAI_BASE_URL/models"');
    expect(codex.indexOf('codex exec')).toBeLessThan(codex.indexOf('models_cache.json'));
    const claude = RUNTIMES['claude-code']!.command(input);
    expect(claude).toContain('/v1/models?limit=100');
    expect(claude).toContain('${ANTHROPIC_BASE_URL:-https://api.anthropic.com}');
    expect(claude.indexOf('$CLI -p')).toBeLessThan(claude.indexOf('/v1/models'));
    const hermes = RUNTIMES.hermes!.command(input);
    expect(hermes).toContain('provider_model_ids');
    expect(hermes).toContain(`> ${RUNTIMES.hermes!.modelsPath}.tmp`);
    expect(hermes.indexOf('hermes chat')).toBeLessThan(hermes.indexOf('provider_model_ids'));
  });

  it('Codex’s catalog: listed models by priority, hidden ones left out; a plain models endpoint too', () => {
    const codex = RUNTIMES.codex!;
    expect(
      codex.models(
        JSON.stringify({
          fetched_at: 1,
          models: [
            { slug: 'gpt-6-sol', display_name: 'GPT-6-Sol', visibility: 'list', priority: 4 },
            { slug: 'gpt-6.1-sol', display_name: 'GPT-6.1-Sol', visibility: 'list', priority: 1 },
            { slug: 'gpt-reserve', display_name: 'GPT-Reserve', visibility: 'hide', priority: 2 },
            { slug: '', visibility: 'list' },
          ],
        }),
      ),
    ).toEqual([
      { id: 'gpt-6.1-sol', label: 'GPT-6.1-Sol' },
      { id: 'gpt-6-sol', label: 'GPT-6-Sol' },
    ]);
    expect(codex.models(JSON.stringify({ object: 'list', data: [{ id: 'b-model' }, { id: 'a-model' }] }))).toEqual([
      { id: 'a-model', label: 'a-model' },
      { id: 'b-model', label: 'b-model' },
    ]);
    expect(codex.models('not json')).toEqual([]);
    expect(codex.models('{"models": "nope"}')).toEqual([]);
  });

  it('Anthropic’s models endpoint for Claude Code, Hermes’s own catalog for Hermes', () => {
    expect(RUNTIMES['claude-code']!.models(JSON.stringify({ data: [{ id: 'claude-opus-5-5', display_name: 'Claude Opus 5.5' }, { id: 'claude-haiku-5-5' }, { type: 'model' }] }))).toEqual([
      { id: 'claude-opus-5-5', label: 'Claude Opus 5.5' },
      { id: 'claude-haiku-5-5', label: 'claude-haiku-5-5' },
    ]);
    expect(RUNTIMES.hermes!.models(JSON.stringify({ provider: 'openrouter', models: ['anthropic/claude-sonnet-5-5', 7, ''] }))).toEqual([{ id: 'anthropic/claude-sonnet-5-5', label: 'anthropic/claude-sonnet-5-5' }]);
  });

  it('the Model option exists only when there is a choice, ahead of the runtime’s own options', () => {
    expect(RUNTIMES.codex!.options([])).toEqual([EFFORT]);
    expect(RUNTIMES.codex!.options([{ id: 'only', label: 'Only' }]).map((o) => o.key)).toEqual(['effort']);
    expect(RUNTIMES['claude-code']!.options([])).toEqual([]);
    expect(RUNTIMES['claude-code']!.options([{ id: 'a', label: 'A' }, { id: 'b', label: '' }])).toEqual([
      { type: 'select', key: 'model', label: 'Model', choices: [{ id: 'a', label: 'A' }, { id: 'b', label: 'b' }] },
    ]);
    expect(RUNTIMES.hermes!.options([{ id: 'a', label: 'A' }, { id: 'b', label: 'B' }]).map((o) => o.key)).toEqual(['model', 'effort']);
    // More than the protocol takes is cut, not refused.
    const many = Array.from({ length: 120 }, (_, i) => ({ id: `m${i}`, label: `M${i}` }));
    const option = RUNTIMES.codex!.options(many)[0]!;
    expect(option.type === 'select' ? option.choices.length : 0).toBe(100);
  });
});
