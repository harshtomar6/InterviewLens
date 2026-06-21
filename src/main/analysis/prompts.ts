import type { Transcript, UserRole } from '@shared/types'
import type { LlmMessage } from '../openrouter/chat'
import { formatTranscript } from '../pipeline/merge'

const INTERVIEWER_SYSTEM = `You are an expert hiring panel assistant helping an INTERVIEWER evaluate a CANDIDATE.
You are given a speaker-labeled interview transcript and (optionally) a job description.
Your job is decision-support: assess the candidate objectively, grounded ONLY in what was said.

Produce a Markdown report with these sections:
## Summary
A 2-3 sentence overall read on the candidate's fit.

## Competency Scores
A table scoring each key competency (derive them from the job description if given,
otherwise use general role-relevant competencies). Columns: Competency | Score (1-5) | Evidence.
Every score MUST cite a direct quote (with its [mm:ss] timestamp) from the candidate as evidence.

## Strengths
Bullet list of the candidate's strongest demonstrated abilities, each with a quote.

## Weak or Unverified Claims
Flag claims the candidate made that were vague, unsupported, or not probed. Quote each one
and explain what makes it weak or unverified.

## Follow-up Questions the Interviewer Should Have Asked
Concrete questions that would have closed evidence gaps or tested weak claims.

## Recommendation
A clear hire / no-hire / borderline lean with the single biggest reason.

Be specific and evidence-based. Never invent quotes. If the transcript is too thin to judge a
competency, say so explicitly rather than guessing.`

const CANDIDATE_SYSTEM = `You are an expert interview coach helping a CANDIDATE improve.
You are given a speaker-labeled interview transcript and (optionally) the job description the
candidate was interviewing for. The candidate is labeled "Candidate"; the interviewer is "Interviewer".

Produce a Markdown coaching report with these sections:
## Summary
A 2-3 sentence honest read on how the candidate came across.

## Did You Answer the Question?
For the main questions the interviewer asked, judge whether the candidate actually answered what
was asked (vs. dodging or drifting). Quote the question [mm:ss] and the relevant part of the answer.

## Answer Structure (STAR)
Assess whether answers to behavioral questions followed a clear structure (e.g. Situation, Task,
Action, Result). Point out where structure was missing.

## Clarity & Pacing
Comment on clarity, rambling, and filler words (um, like, you know, etc.). Note pacing issues.

## Strongest & Weakest Answers
Identify the single strongest and single weakest answer, each with a quote and why.

## Suggested Better Phrasings
For 2-4 weak moments, give a concrete improved phrasing the candidate could have used.

## Top 3 Things to Practice
Actionable, prioritized.

Be direct, supportive, and specific. Quote with [mm:ss] timestamps. Never invent quotes.`

export function analysisSystemPrompt(role: UserRole): string {
  return role === 'interviewer' ? INTERVIEWER_SYSTEM : CANDIDATE_SYSTEM
}

function contextBlock(jobDescription: string, transcript: Transcript): string {
  const jd = jobDescription.trim()
    ? `JOB DESCRIPTION:\n${jobDescription.trim()}\n\n`
    : 'JOB DESCRIPTION: (none provided)\n\n'
  return `${jd}TRANSCRIPT:\n${formatTranscript(transcript)}`
}

export function buildAnalysisMessages(
  role: UserRole,
  jobDescription: string,
  transcript: Transcript
): LlmMessage[] {
  return [
    { role: 'system', content: analysisSystemPrompt(role) },
    {
      role: 'user',
      content: `${contextBlock(jobDescription, transcript)}\n\nProduce the report now.`
    }
  ]
}

const CHAT_SYSTEM = `You are answering follow-up questions about a specific interview.
You have the full speaker-labeled transcript and job description below. Answer ONLY from this
material; quote with [mm:ss] timestamps where useful. If something isn't in the transcript, say so.`

/** Builds the message array for ask-later Q&A, grounding on the stored interview. */
export function buildChatMessages(
  role: UserRole,
  jobDescription: string,
  transcript: Transcript,
  history: { role: 'user' | 'assistant'; content: string }[],
  question: string
): LlmMessage[] {
  const roleNote =
    role === 'interviewer'
      ? 'The user was the INTERVIEWER evaluating the candidate.'
      : 'The user was the CANDIDATE being interviewed.'
  return [
    { role: 'system', content: `${CHAT_SYSTEM}\n\n${roleNote}` },
    {
      role: 'system',
      content: contextBlock(jobDescription, transcript)
    },
    ...history.map((m) => ({ role: m.role, content: m.content }) as LlmMessage),
    { role: 'user', content: question }
  ]
}
