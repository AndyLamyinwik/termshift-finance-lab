import { z } from 'zod'

export const MAX_ID_LENGTH = 64
export const MAX_NAME_LENGTH = 120
export const MAX_VERSION_LENGTH = 128

// An absolute end assertion also rejects a trailing newline.
export const IdSchema = z.string().min(1).max(MAX_ID_LENGTH).regex(
  /^[A-Za-z0-9][A-Za-z0-9_-]{0,63}(?![\s\S])/,
  'ID must start with a letter or digit and contain only letters, digits, underscores, or hyphens.',
)

export const NameSchema = z.string().min(1).max(MAX_NAME_LENGTH).refine(
  (value) => value.trim().length > 0,
  'Name must not be blank.',
)

// SemVer 2.0.0: numeric core/prerelease identifiers cannot have leading zeros.
const SEMVER_PATTERN = /^(?:0|[1-9][0-9]*)\.(?:0|[1-9][0-9]*)\.(?:0|[1-9][0-9]*)(?:-(?:0|[1-9][0-9]*|[0-9]*[A-Za-z-][0-9A-Za-z-]*)(?:\.(?:0|[1-9][0-9]*|[0-9]*[A-Za-z-][0-9A-Za-z-]*))*)?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?(?![\s\S])/

export const SemverSchema = z.string().min(1).max(MAX_VERSION_LENGTH).pipe(
  z.string().regex(SEMVER_PATTERN, 'Version must be a valid SemVer 2.0.0 string.'),
)

function isGregorianLeapYear(year: number): boolean {
  return year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0)
}

function isBillingMonth(value: string): boolean {
  if (value.length !== 7 || !/^[0-9]{4}-(0[1-9]|1[0-2])$/.test(value)) return false
  return Number(value.slice(0, 4)) >= 1
}

function isCalendarDate(value: string): boolean {
  if (value.length !== 10 || !/^[0-9]{4}-(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])$/.test(value)) {
    return false
  }

  const year = Number(value.slice(0, 4))
  const month = Number(value.slice(5, 7))
  const day = Number(value.slice(8, 10))
  if (year < 1) return false

  const daysInMonth = month === 2
    ? (isGregorianLeapYear(year) ? 29 : 28)
    : ([4, 6, 9, 11].includes(month) ? 30 : 31)
  return day <= daysInMonth
}

export const CalendarDateSchema = z.string().refine(
  isCalendarDate,
  'Date must be a valid Gregorian calendar day in YYYY-MM-DD format (years 0001–9999).',
)

export const BillingMonthSchema = z.string().refine(
  isBillingMonth,
  'Billing month must use YYYY-MM format with a valid month and a year from 0001 to 9999.',
)

export const NonNegativeIntegerSchema = z.number().int().min(0).max(Number.MAX_SAFE_INTEGER)
export const PositiveIntegerSchema = z.number().int().min(1).max(Number.MAX_SAFE_INTEGER)
export const NonNegativeCentsSchema = NonNegativeIntegerSchema
export const PositiveCentsSchema = PositiveIntegerSchema
export const RateBpsSchema = z.number().int().min(0).max(10000)
