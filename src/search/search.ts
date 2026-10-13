import { compareContracts } from '../engine'
import { calendarDaysBetween } from '../engine/dates'
import { validateContract, validateScenario } from '../models'
import type { Scenario, ValidationIssue } from '../models'
import { boundaryParameters } from './boundaries'
import { createSeededPrng, generateCandidateScenario, seededParameters } from './generator'
import { validateSearchOptions } from './options'
import type {
  CandidateParameters,
  CandidateRecord,
  SearchIssue,
  SearchOptions,
  SearchResult,
  Witness,
} from './types'

function inputIssues(issues: ValidationIssue[], source: string): SearchIssue[] {
  return issues.map((issue) => ({
    code: 'validation_error',
    path: [source, ...issue.path],
    message: issue.message,
    validationCode: issue.code,
  }))
}

function capacityIssues(input: unknown): SearchIssue[] {
  if (input === null || typeof input !== 'object' || Array.isArray(input)) return []
  const fields = input as Record<string, unknown>
  const issues: SearchIssue[] = []
  for (const [field, limit] of [['transactions', 30], ['paymentEvents', 5]] as const) {
    const value = fields[field]
    if (Array.isArray(value) && value.length > limit) {
      issues.push({
        code: 'capacity_exceeded',
        path: ['baseScenario', field],
        message: `Search accepts at most ${limit} ${field}; received ${value.length}.`,
      })
    }
  }
  return issues
}

function inRange(value: number, min: number, max: number): boolean {
  return value >= min && value <= max
}

function scenarioInRange(scenario: Scenario, options: SearchOptions): boolean {
  return inRange(scenario.transactions.length, options.purchaseCountMin, options.purchaseCountMax)
    && scenario.transactions.every((transaction) => inRange(
      transaction.amountCents, options.purchaseAmountCentsMin, options.purchaseAmountCentsMax,
    ))
    && scenario.paymentEvents.every((event) => inRange(
      Math.max(0, calendarDaysBetween(event.dueOn, event.paidOn)), options.lateDaysMin, options.lateDaysMax,
    ))
}

function parametersInRange(parameters: CandidateParameters, options: SearchOptions): boolean {
  return inRange(parameters.purchaseCount, options.purchaseCountMin, options.purchaseCountMax)
    && inRange(parameters.purchaseAmountCents, options.purchaseAmountCentsMin, options.purchaseAmountCentsMax)
    && inRange(parameters.lateDays, options.lateDaysMin, options.lateDaysMax)
}

function uniformBaseParameters(scenario: Scenario, options: SearchOptions): CandidateParameters | undefined {
  const purchaseAmountCents = scenario.transactions[0]?.amountCents ?? options.purchaseAmountCentsMin
  if (!scenario.transactions.every((transaction) => transaction.amountCents === purchaseAmountCents)) return undefined
  const delays = scenario.paymentEvents.map((event) => calendarDaysBetween(event.dueOn, event.paidOn))
  const lateDays = delays[0] ?? options.lateDaysMin
  // Early payment is legal base data, but is outside the generated nonnegative-delay family.
  if (lateDays < 0 || !delays.every((delay) => delay === lateDays)) return undefined
  return { purchaseCount: scenario.transactions.length, purchaseAmountCents, lateDays }
}

function parameterKey(parameters: CandidateParameters, hasPayments: boolean): string {
  return JSON.stringify([
    parameters.purchaseCount,
    parameters.purchaseCount === 0 ? null : parameters.purchaseAmountCents,
    hasPayments ? parameters.lateDays : null,
  ])
}

function generatedSpaceSize(options: SearchOptions, hasPayments: boolean): number {
  const positiveCounts = Math.max(0, options.purchaseCountMax - Math.max(1, options.purchaseCountMin) + 1)
  const purchaseVariants = positiveCounts * (options.purchaseAmountCentsMax - options.purchaseAmountCentsMin + 1)
    + (options.purchaseCountMin === 0 ? 1 : 0)
  return purchaseVariants * (hasPayments ? options.lateDaysMax - options.lateDaysMin + 1 : 1)
}

function scenarioKey(scenario: Scenario): string {
  // IDs and in-month purchase dates do not affect the unchanged v1 fee formulas.
  // Preserve purchase/payment order, amounts, and exact payment dates.
  return JSON.stringify({
    billingMonth: scenario.billingMonth,
    purchaseAmounts: scenario.transactions.map((transaction) => transaction.amountCents),
    payments: scenario.paymentEvents.map((event) => [event.dueOn, event.paidOn, event.amountCents]),
  })
}

function witnessOrder(a: Witness, b: Witness): number {
  const aMagnitude = Math.abs(a.deltaCents)
  const bMagnitude = Math.abs(b.deltaCents)
  return aMagnitude === bMagnitude ? a.sequence - b.sequence : (aMagnitude > bMagnitude ? -1 : 1)
}

function retainWitnesses(current: Witness[], next: Witness, limit: number): Witness[] {
  const ranked = [...current, next].sort(witnessOrder)
  if (limit === 1) return ranked.slice(0, 1)
  const positive = ranked.find((witness) => witness.deltaCents > 0)
  const negative = ranked.find((witness) => witness.deltaCents < 0)
  const selected = new Set<Witness>()
  if (positive && negative) {
    selected.add(positive)
    selected.add(negative)
  }
  for (const witness of ranked) {
    if (selected.size >= limit) break
    selected.add(witness)
  }
  return [...selected].sort(witnessOrder)
}

export function searchCounterexamples(
  oldContractInput: unknown,
  newContractInput: unknown,
  baseScenarioInput: unknown,
  optionsInput: unknown,
): SearchResult {
  const oldContract = validateContract(oldContractInput)
  const newContract = validateContract(newContractInput)
  const capacity = capacityIssues(baseScenarioInput)
  // Enforce the tighter search capacity before the broader model traverses arrays.
  const base = capacity.length > 0 ? null : validateScenario(baseScenarioInput)
  const optionsResult = validateSearchOptions(optionsInput)
  if (!oldContract.success || !newContract.success || !base?.success || !optionsResult.success) {
    return {
      success: false,
      issues: [
        ...(oldContract.success ? [] : inputIssues(oldContract.issues, 'oldContract')),
        ...(newContract.success ? [] : inputIssues(newContract.issues, 'newContract')),
        ...capacity,
        ...(base !== null && !base.success ? inputIssues(base.issues, 'baseScenario') : []),
        ...(optionsResult.success ? [] : optionsResult.issues.map((issue) => ({
          ...issue, path: ['options', ...issue.path],
        }))),
      ],
    }
  }

  const options = optionsResult.data
  const old = oldContract.data
  const next = newContract.data
  const baseScenario = base.data
  const hasPayments = baseScenario.paymentEvents.length > 0
  const spaceSize = generatedSpaceSize(options, hasPayments)
  const visitedParameters = new Set<string>()
  const seenScenarios = new Map<string, string>()
  const candidates: CandidateRecord[] = []
  const sourceEvaluations = { base: 0, boundary: 0, seeded: 0 }
  let evaluatedCount = 0
  let skippedCount = 0
  let failedCount = 0
  let witnesses: Witness[] = []

  function assess(scenario: Scenario, identity: Omit<CandidateRecord, 'status'>) {
    if (!scenarioInRange(scenario, options)) {
      candidates.push({ ...identity, status: 'out_of_range' })
      skippedCount++
      return
    }
    const validation = validateScenario(scenario)
    if (!validation.success) {
      candidates.push({ ...identity, status: 'invalid_scenario', issues: inputIssues(validation.issues, 'scenario') })
      skippedCount++
      return
    }
    const key = scenarioKey(validation.data)
    const duplicateOf = seenScenarios.get(key)
    if (duplicateOf !== undefined) {
      candidates.push({ ...identity, status: 'duplicate', duplicateOf })
      skippedCount++
      return
    }
    seenScenarios.set(key, identity.candidateId)
    evaluatedCount++
    sourceEvaluations[identity.source]++
    const result = compareContracts(old, next, validation.data)
    if (!result.success) {
      candidates.push({ ...identity, status: 'comparison_failed', issues: result.issues })
      failedCount++
      return
    }
    candidates.push({ ...identity, status: 'evaluated', deltaCents: result.data.deltaCents })
    if (result.data.deltaCents !== 0) {
      witnesses = retainWitnesses(witnesses, {
        candidateId: identity.candidateId,
        sequence: identity.sequence,
        source: identity.source,
        ...(identity.parameters ? { parameters: identity.parameters } : {}),
        scenario: validation.data,
        comparison: result.data,
        deltaCents: result.data.deltaCents,
      }, options.maxResults)
    }
  }

  const baseParameters = uniformBaseParameters(baseScenario, options)
  if (scenarioInRange(baseScenario, options) && baseParameters && parametersInRange(baseParameters, options)) {
    visitedParameters.add(parameterKey(baseParameters, hasPayments))
  }
  assess(baseScenario, {
    candidateId: 'base', sequence: 0, source: 'base',
    ...(baseParameters ? { parameters: baseParameters } : {}),
  })

  function assessParameters(parameters: CandidateParameters, source: 'boundary' | 'seeded') {
    const sequence = candidates.length
    const candidateId = `${source}-${sequence}`
    const identity = { candidateId, sequence, source, parameters }
    if (!parametersInRange(parameters, options)) {
      candidates.push({ ...identity, status: 'out_of_range' })
      skippedCount++
      return
    }
    visitedParameters.add(parameterKey(parameters, hasPayments))
    const generated = generateCandidateScenario(baseScenario, parameters, candidateId)
    if (!generated.success) {
      candidates.push({ ...identity, status: 'invalid_scenario', issues: generated.issues })
      skippedCount++
      return
    }
    assess(generated.scenario, identity)
  }

  const boundaryBudget = Math.floor((options.maxEvaluations - evaluatedCount) / 2)
  for (const parameters of boundaryParameters(old, next, baseScenario, options)) {
    if (sourceEvaluations.boundary >= boundaryBudget || visitedParameters.size === spaceSize) break
    assessParameters(parameters, 'boundary')
  }

  const prng = createSeededPrng(options.seed)
  for (let attempt = 0; attempt < options.maxEvaluations * 4; attempt++) {
    if (evaluatedCount >= options.maxEvaluations) break
    // Run the seeded explorer at least once when budget remains, even in a tiny covered space.
    if (attempt > 0 && visitedParameters.size === spaceSize) break
    assessParameters(seededParameters(prng, options), 'seeded')
  }

  const complete = visitedParameters.size === spaceSize
  const budgetExhausted = evaluatedCount >= options.maxEvaluations
  return {
    success: true,
    data: {
      seed: options.seed,
      searchOptions: options,
      evaluatedCount,
      maxEvaluations: options.maxEvaluations,
      skippedCount,
      failedCount,
      budgetExhausted,
      stopReason: complete ? 'space-covered' : (budgetExhausted ? 'budget' : 'attempt-limit'),
      status: witnesses.length > 0 ? 'witnesses-found' : 'no-witness-found',
      message: witnesses.length > 0
        ? 'Counterexamples found within the specified search range and budget; retained witnesses are not a global optimum.'
        : 'No counterexample found within the specified search range and evaluation budget. This does not establish contract equivalence.',
      witnesses,
      coverage: {
        method: 'boundary-and-seeded',
        scenarioFamily: 'uniform-purchases-shared-delay',
        generatedSpaceSize: spaceSize,
        visitedParameterCount: visitedParameters.size,
        complete,
      },
      sourceEvaluations,
      candidates,
    },
  }
}
