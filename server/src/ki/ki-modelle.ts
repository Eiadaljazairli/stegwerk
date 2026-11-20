export type KiAnbieter = 'anthropic' | 'openai';

export const KI_ANBIETER: readonly KiAnbieter[] = ['anthropic', 'openai'];

export const KI_ANBIETER_NAME: Record<KiAnbieter, string> = {
  anthropic: 'Anthropic (Claude)',
  openai: 'OpenAI',
};

export type KiModell = { kennung: string; name: string; hinweis: string };

export const KI_MODELLE: Record<KiAnbieter, readonly KiModell[]> = {
  anthropic: [
    {
      kennung: 'claude-sonnet-5-5',
      name: 'Claude Sonnet 5.5',
      hinweis: 'Empfohlen: schnell und gründlich',
    },
    {
      kennung: 'claude-opus-5-5',
      name: 'Claude Opus 5.5',
      hinweis: 'Am gründlichsten, teurer',
    },
    {
      kennung: 'claude-haiku-5-5',
      name: 'Claude Haiku 5.5',
      hinweis: 'Am günstigsten, für einfache Fragen',
    },
  ],
  openai: [
    { kennung: 'gpt-5', name: 'GPT-5', hinweis: 'Gründlich' },
    { kennung: 'gpt-5-mini', name: 'GPT-5 mini', hinweis: 'Günstiger' },
  ],
};

export const STANDARD_MODELL: Record<KiAnbieter, string> = {
  anthropic: 'claude-sonnet-5-5',
  openai: 'gpt-5',
};

export const MODELL_FORM = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,79}$/u;
