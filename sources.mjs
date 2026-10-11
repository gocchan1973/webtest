export const requiredSources = [
  {
    id: 'openai-chatgpt-codex-changelog',
    name: 'ChatGPT & Codex changelog',
    url: 'https://learn.chatgpt.com/docs/changelog',
    cadence: 'weekly',
    priority: 'official-primary',
    scopes: ['General', 'Desktop app', 'Remote', 'Codex CLI'],
    destination: 'ai-self-update-recheck',
  },
  {
    id: 'anthropic-claude-code-changelog',
    name: 'Claude Code changelog',
    url: 'https://github.com/anthropics/claude-code/blob/main/CHANGELOG.md',
    cadence: 'weekly',
    priority: 'official-primary',
    scopes: ['Claude Code CLI', 'Desktop', 'Remote Control', 'Skills/Plugins'],
    destination: 'ai-self-update-recheck',
  },
  {
    id: 'anthropic-newsroom',
    name: 'Anthropic Newsroom',
    url: 'https://www.anthropic.com/news',
    cadence: 'weekly',
    priority: 'official-secondary',
    scopes: ['Models', 'Claude app', 'Claude Code major updates'],
    destination: 'ai-self-update-recheck',
  },
  {
    // 差分ではなく設計原則の蓄積。週次で追うと空振りするため cadence を分ける。
    id: 'anthropic-engineering',
    name: 'Anthropic Engineering blog',
    url: 'https://www.anthropic.com/engineering',
    cadence: 'monthly',
    priority: 'official-primary',
    scopes: ['Agent design', 'Context engineering', 'Tool design', 'Harness patterns'],
    destination: 'agent-design-principles',
  },
];
