export type Topic = { title: string; prompt: string }

export type ForkState = 'working' | 'waiting' | 'gone'

export type Fork = {
  // The short id `claude attach` takes
  id: string
  sessionId?: string
  name: string
  title: string
  prompt: string
  startedAt: number
  state: ForkState
  // When the fork last went from working to waiting
  waitingSince?: number
  // The last transcript message /harvest already brought back
  harvestedUuid?: string
}

declare module 'claude-code' {
  interface PluginState {
    sidequest: {
      topics: Shaped<Topic[]>
      // Where the band's page of 9 starts in topics
      offset: Shaped<number>
      forks: Shaped<Fork[]>
    }
  }
}
