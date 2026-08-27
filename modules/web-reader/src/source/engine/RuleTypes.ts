export type CompatibilityMode = 'legado' | 'standard'

export type RuleMode = 'default' | 'css' | 'xpath' | 'json' | 'regex' | 'js' | 'webjs'

export type RuleCombineOperator = '&&' | '||' | '%%'

export interface IndexSpec {
  exclude: boolean
  tokens: string[]
}

export interface TextReplaceRule {
  pattern: string
  replacement: string
  replaceFirst?: boolean
}

export interface ChainedStep {
  raw: string
  mode: RuleMode
  expression: string
  spec?: IndexSpec
  bracketSyntax?: boolean
  directive?: string
  replaceRules?: TextReplaceRule[]
  putRules?: Record<string, string>
}

export interface RuleSegment {
  source: string
  mode: RuleMode
  expression: string
  preExpression?: string
  steps?: ChainedStep[]
  replaceRules?: TextReplaceRule[]
  replacePattern?: string
  replacement?: string
  replaceFirst?: boolean
  putRules?: Record<string, string>
}

export interface CompiledRuleNode {
  type: 'combination' | 'chain' | 'step'
  operator?: RuleCombineOperator
  children?: CompiledRuleNode[]
  segment?: RuleSegment
  step?: ChainedStep
}

export interface CompiledRule {
  source: string
  operator?: RuleCombineOperator
  alternatives: RuleSegment[]
  tree?: CompiledRuleNode
}

export interface RuleExecutionContext {
  compatibilityMode: CompatibilityMode
  stage?: 'search' | 'explore' | 'bookInfo' | 'toc' | 'content' | 'unknown'
  field?: string
  baseUrl?: string
  redirectUrl?: string
  source?: Record<string, unknown>
  book?: Record<string, unknown>
  chapter?: Record<string, unknown>
  key?: string
  page?: number
  result?: unknown
  variables?: Map<string, string>
}

export type RuleErrorCode =
  | 'INVALID_RULE'
  | 'INVALID_SELECTOR'
  | 'INVALID_XPATH'
  | 'INVALID_JSONPATH'
  | 'INVALID_REGEX'
  | 'UNSUPPORTED_JAVASCRIPT'
  | 'UNSUPPORTED_WEBJS'
  | 'UNSUPPORTED_ANDROID_API'
  | 'JS_TIMEOUT'
  | 'JS_MEMORY_LIMIT'
  | 'JS_EXECUTION_FAILED'
  | 'WEBJS_TIMEOUT'
  | 'WEBJS_EXECUTION_FAILED'
  | 'RULE_EXECUTION_FAILED'

export interface RuleErrorDetails {
  code: RuleErrorCode
  stage?: RuleExecutionContext['stage']
  field?: string
  rule: string
  mode: CompatibilityMode
  cause?: unknown
}

export class RuleExecutionError extends Error {
  readonly code: RuleErrorCode
  readonly stage?: RuleExecutionContext['stage']
  readonly field?: string
  readonly rule: string
  readonly compatibilityMode: CompatibilityMode
  readonly cause?: unknown

  constructor(message: string, details: RuleErrorDetails) {
    super(message)
    this.name = 'RuleExecutionError'
    this.code = details.code
    this.stage = details.stage
    this.field = details.field
    this.rule = details.rule
    this.compatibilityMode = details.mode
    this.cause = details.cause
  }
}

export const DEFAULT_RULE_CONTEXT: RuleExecutionContext = {
  compatibilityMode: 'legado',
  stage: 'unknown',
}
