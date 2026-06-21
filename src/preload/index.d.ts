import type { InterviewLensApi } from './index'

declare global {
  interface Window {
    api: InterviewLensApi
  }
}

export {}
