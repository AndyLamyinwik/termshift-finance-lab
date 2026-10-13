import { CalendarDateSchema } from '../models/primitives'

// Days before each month in a common Gregorian year, indexed by month - 1.
const MONTH_OFFSETS = [0, 31, 59, 90, 120, 151, 181, 212, 243, 273, 304, 334]

/** Gregorian ordinal: 0001-01-01 is day 1, without timestamps or time zones. */
export function calendarDayNumber(date: string): number {
  if (!CalendarDateSchema.safeParse(date).success) {
    throw new RangeError('Date must be a valid Gregorian calendar day in YYYY-MM-DD format (years 0001–9999).')
  }

  const year = Number(date.slice(0, 4))
  const month = Number(date.slice(5, 7))
  const day = Number(date.slice(8, 10))
  const monthOffset = MONTH_OFFSETS[month - 1]
  if (monthOffset === undefined) {
    throw new RangeError('Month must be between 1 and 12.')
  }
  const previousYear = year - 1
  const daysBeforeYear = previousYear * 365
    + Math.floor(previousYear / 4)
    - Math.floor(previousYear / 100)
    + Math.floor(previousYear / 400)
  const isLeapYear = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0)
  const leapDay = month > 2 && isLeapYear ? 1 : 0

  return daysBeforeYear + monthOffset + leapDay + day
}

/** Signed calendar day difference: positive when end is later than start. */
export function calendarDaysBetween(start: string, end: string): number {
  return calendarDayNumber(end) - calendarDayNumber(start)
}
