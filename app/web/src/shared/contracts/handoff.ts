export type StageName = 'collection' | 'production' | 'output'

export interface HandoffClip {
  name: string
  sizeBytes: number
}

export interface HandoffFolder {
  path: string
  clips: HandoffClip[]
}

export interface StageHandoff {
  runId: number
  stage: StageName
  folders: HandoffFolder[]
}
