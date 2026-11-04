import type { Fork, ForkState, Topic } from '../types'

export const MAX_TOPICS = 30
// One band page: the number keys 1-9.
export const PAGE_SIZE = 9
const ANSWER_HEAD_CHARS = 16_000
const ANSWER_TAIL_CHARS = 4_000
const MAX_EXCERPT_CHARS = 14_000

// A long answer keeps its start, where reports put the biggest findings, and its end, where the open questions go.
export function answerExcerpt(answer: string): string {
  if (answer.length <= ANSWER_HEAD_CHARS + ANSWER_TAIL_CHARS) return answer
  return `${answer.slice(0, ANSWER_HEAD_CHARS)}\n\n[… middle of the answer left out …]\n\n${answer.slice(-ANSWER_TAIL_CHARS)}`
}

// The topics a band page shows, and where that page starts, kept inside the list.
export function pageOf<T>(topics: T[], offset: number): { shown: T[]; start: number } {
  const start = offset < topics.length ? offset : 0
  return { shown: topics.slice(start, start + PAGE_SIZE), start }
}

// The offset of the page after the one at `offset`, back to the first after the last.
export const nextPage = (count: number, offset: number) => (offset + PAGE_SIZE < count ? offset + PAGE_SIZE : 0)

export function slug(title: string): string {
  return (
    title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 32)
      .replace(/-+$/, '') || 'topic'
  )
}

export const topicsRequest = (answer: string) =>
  [
    'Below is the last answer in a working session. List every distinct thread in it that deserves its own deep dive or discussion:',
    'findings, questions, options, risks, follow-ups or investigations. A finding that comes with a proposed fix still counts: validating or carrying out the fix is a deep dive.',
    'Merge items that share a root cause or the same action into one topic. Rank by impact, highest first: dollars for cost findings, otherwise risk or importance.',
    `Return only a JSON array of at most ${MAX_TOPICS} objects: {"title": "<3-6 words>", "prompt": "<one or two sentences telling a session what to dig into, self-contained, with any figure the answer gave>"}.`,
    'Return [] when there is one thread or none.',
    '',
    '<answer>',
    answerExcerpt(answer),
    '</answer>',
  ].join('\n')

export function parseTopics(reply: string): Topic[] {
  const match = reply.match(/\[[\s\S]*\]/)
  if (!match) return []
  let parsed: unknown
  try {
    parsed = JSON.parse(match[0])
  } catch {
    return []
  }
  if (!Array.isArray(parsed)) return []
  return parsed
    .filter(
      (item): item is Topic =>
        typeof item === 'object' && item !== null && typeof item.title === 'string' && typeof item.prompt === 'string',
    )
    .map(({ title, prompt }) => ({ title: title.trim(), prompt: prompt.trim() }))
    .filter(topic => topic.title && topic.prompt)
    .slice(0, MAX_TOPICS)
}

export const forkPrompt = (topic: Topic) =>
  `Fork from the parent session: deep dive on this one topic only, "${topic.title}". ${topic.prompt}\n\nThe parent session carries on with the other threads, so stay on this one.`

// The topic a typed `/dig <text>` names: the first words as the title.
export function topicFromText(text: string): Topic | undefined {
  const prompt = text.trim()
  if (!prompt) return undefined
  return { title: prompt.split(/\s+/).slice(0, 6).join(' '), prompt }
}

// `claude --bg` prints `backgrounded · <id> · <name>`.
export function parseBackgrounded(stdout: string): string | undefined {
  return stdout.match(/backgrounded\s+·\s+([0-9a-f]+)\s+·/)?.[1]
}

export type Agent = { id?: string; sessionId?: string; name?: string; status?: string; state?: string; cwd?: string }

export function stateOf(agent: Agent | undefined): ForkState {
  if (!agent) return 'gone'
  // Seen: busy/working while a turn runs, idle/done once it ends; anything else waits on the person.
  return agent.status === 'busy' || agent.state === 'working' ? 'working' : 'waiting'
}

// New fork states from `claude agents --json --all`, and the titles that just started waiting.
export function applyAgents(forks: Fork[], agents: Agent[], now: number): { forks: Fork[]; nowWaiting: string[] } {
  const nowWaiting: string[] = []
  const next = forks.map(fork => {
    const agent = agents.find(a => a.id === fork.id)
    const state = stateOf(agent)
    if (state === 'waiting' && fork.state !== 'waiting') nowWaiting.push(fork.title)
    return {
      ...fork,
      sessionId: fork.sessionId ?? agent?.sessionId,
      state,
      waitingSince: state === 'waiting' ? (fork.state === 'waiting' ? fork.waitingSince : now) : undefined,
    }
  })
  return { forks: next, nowWaiting }
}

// Where Claude Code keeps a session's transcript.
export const transcriptPath = (home: string, cwd: string, sessionId: string) =>
  `${home}/.claude/projects/${cwd.replace(/[^a-zA-Z0-9]/g, '-')}/${sessionId}.jsonl`

type Line = { uuid?: string; type?: string; isMeta?: boolean; message?: { role?: string; content?: unknown } }

const textOf = (content: unknown): string =>
  typeof content === 'string'
    ? content
    : Array.isArray(content)
      ? content
          .filter(block => typeof block === 'object' && block !== null && block.type === 'text' && typeof block.text === 'string')
          .map(block => block.text as string)
          .join('\n')
      : ''

// The conversation the fork had after its own prompt (and after `afterUuid`, what an earlier harvest took), as text.
export function forkExcerpt(jsonl: string, prompt: string, afterUuid?: string): { excerpt: string; lastUuid?: string } {
  const messages: { uuid?: string; role: string; text: string }[] = []
  for (const raw of jsonl.split('\n')) {
    if (!raw.trim()) continue
    let line: Line
    try {
      line = JSON.parse(raw) as Line
    } catch {
      continue
    }
    const role = line.message?.role
    if ((line.type !== 'user' && line.type !== 'assistant') || line.isMeta || (role !== 'user' && role !== 'assistant')) continue
    const text = textOf(line.message?.content).trim()
    if (text && !text.startsWith('<')) messages.push({ uuid: line.uuid, role, text })
  }

  const marker = prompt.slice(0, 80)
  const promptAt = messages.findLastIndex(m => m.role === 'user' && m.text.includes(marker))
  const harvestedAt = afterUuid ? messages.findIndex(m => m.uuid === afterUuid) : -1
  const fresh = messages.slice(Math.max(promptAt, harvestedAt) + 1)
  const excerpt = fresh.map(m => `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.text}`).join('\n\n')
  return { excerpt: excerpt.slice(-MAX_EXCERPT_CHARS), lastUuid: fresh.at(-1)?.uuid }
}

export const harvestRequest = (title: string, excerpt: string) =>
  [
    `A forked session dug into "${title}". Below is what it found and discussed.`,
    'Summarize for the parent session in at most 6 short bullets: conclusions, decisions taken, and open questions. Plain text, no preamble.',
    '',
    '<fork>',
    excerpt,
    '</fork>',
  ].join('\n')
