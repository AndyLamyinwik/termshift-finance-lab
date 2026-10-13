import { describe, expect, it } from 'vitest'
import { calendarDayNumber, calendarDaysBetween } from './dates'

describe('Gregorian calendar ordinals', () => {
  it('maps year 0001 to the first calendar day', () => {
    expect(calendarDayNumber('0001-01-01')).toBe(1)
    expect(calendarDayNumber('0001-12-31')).toBe(365)
    expect(calendarDayNumber('0002-01-01')).toBe(366)
  })

  it('maps the last supported day of year 9999 exactly', () => {
    expect(calendarDayNumber('9999-12-31')).toBe(3652059)
    expect(calendarDaysBetween('0001-01-01', '9999-12-31')).toBe(3652058)
  })

  it.each([
    '0000-01-01',
    '10000-01-01',
    '2026-02-30',
    '2026-02-29',
    '1900-02-29',
    '2100-02-29',
    '2026-04-31',
    '2026-13-01',
    '2026-00-01',
    '2026-01-00',
    '2026-1-01',
    '2026-01-1',
    '2026-01-01\n',
    '2026-01-01T00:00:00Z',
    '',
  ])('rejects invalid dates without repairing them: %j', (date) => {
    expect(() => calendarDayNumber(date)).toThrow(RangeError)
  })
})

describe('signed Gregorian calendar day differences', () => {
  it('has zero days for a same-day payment', () => {
    expect(calendarDaysBetween('2026-05-15', '2026-05-15')).toBe(0)
  })

  it('keeps early payment differences negative', () => {
    expect(calendarDaysBetween('2026-05-15', '2026-05-13')).toBe(-2)
  })

  it('counts a payment two days after its due date', () => {
    expect(calendarDaysBetween('2026-05-15', '2026-05-17')).toBe(2)
  })

  it.each([
    { start: '2026-01-31', end: '2026-02-01', expected: 1 },
    { start: '2026-04-30', end: '2026-05-02', expected: 2 },
    { start: '2026-12-31', end: '2027-01-01', expected: 1 },
    { start: '2024-02-28', end: '2024-03-01', expected: 2 },
    { start: '2024-02-29', end: '2024-03-01', expected: 1 },
    { start: '2026-02-28', end: '2026-03-01', expected: 1 },
    { start: '1900-02-28', end: '1900-03-01', expected: 1 },
    { start: '2000-02-28', end: '2000-03-01', expected: 2 },
    { start: '2100-02-28', end: '2100-03-01', expected: 1 },
    { start: '2400-02-28', end: '2400-03-01', expected: 2 },
    { start: '0001-12-31', end: '0002-01-01', expected: 1 },
    { start: '9999-12-30', end: '9999-12-31', expected: 1 },
  ])('counts $start through $end as $expected calendar days', ({ start, end, expected }) => {
    expect(calendarDaysBetween(start, end)).toBe(expected)
    expect(calendarDaysBetween(end, start)).toBe(-expected)
  })

  it('requires both endpoints to be valid dates', () => {
    expect(() => calendarDaysBetween('2026-02-30', '2026-03-01')).toThrow(RangeError)
    expect(() => calendarDaysBetween('2026-02-28', '2026-02-30')).toThrow(RangeError)
  })

  it('returns the same integer results for repeated calls', () => {
    const first = calendarDaysBetween('2000-02-29', '2026-03-01')
    expect(calendarDaysBetween('2000-02-29', '2026-03-01')).toBe(first)
    expect(Number.isSafeInteger(first)).toBe(true)
  })
})
