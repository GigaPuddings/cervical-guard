import { describe, expect, it } from 'vitest'
import { canConfigureReminderSound, parseSedentaryDurationInput, sedentaryDurationInputValue } from './SettingsPage'

describe('sedentary duration input', () => {
  it('keeps an empty editing state invalid instead of coercing it to 0.1 minutes', () => {
    expect(parseSedentaryDurationInput('', 'minutes')).toBeNull()
    expect(parseSedentaryDurationInput(' ', 'seconds')).toBeNull()
  })

  it('accepts a newly typed whole minute after the field has been cleared', () => {
    expect(parseSedentaryDurationInput('1', 'minutes')).toBe(60)
    expect(sedentaryDurationInputValue(60, 'minutes')).toBe('1')
  })

  it('supports decimal minutes and clamps values to the persisted range', () => {
    expect(parseSedentaryDurationInput('0.5', 'minutes')).toBe(30)
    expect(parseSedentaryDurationInput('999', 'minutes')).toBe(14_400)
    expect(parseSedentaryDurationInput('-1', 'minutes')).toBeNull()
  })
})

describe('reminder sound configuration', () => {
  it('can be configured while meeting mode is active', () => {
    expect(canConfigureReminderSound({ soundEnabled: true, meetingMode: true })).toBe(true)
    expect(canConfigureReminderSound({ soundEnabled: false, meetingMode: false })).toBe(false)
  })
})
