use super::*;
use crate::model::ReminderLevel;

fn settings_with(sound: &str, sound_enabled: bool, meeting_mode: bool) -> AppSettings {
    AppSettings {
        reminder_sound: sound.to_string(),
        sound_enabled,
        meeting_mode,
        ..AppSettings::default()
    }
}

#[test]
fn auto_maps_each_level_to_a_distinct_sound() {
    let settings = settings_with("auto", true, false);
    assert_eq!(
        resolve_reminder_sound(&settings, ReminderLevel::Gentle),
        Some(ReminderSound::Soft)
    );
    assert_eq!(
        resolve_reminder_sound(&settings, ReminderLevel::Noticeable),
        Some(ReminderSound::Chime)
    );
    assert_eq!(
        resolve_reminder_sound(&settings, ReminderLevel::Strong),
        Some(ReminderSound::Alert)
    );
}

#[test]
fn explicit_choice_overrides_the_level_mapping() {
    let settings = settings_with("alert", true, false);
    assert_eq!(
        resolve_reminder_sound(&settings, ReminderLevel::Gentle),
        Some(ReminderSound::Alert)
    );
    assert_eq!(
        resolve_reminder_sound(&settings, ReminderLevel::Strong),
        Some(ReminderSound::Alert)
    );
}

#[test]
fn sound_gate_silences_meeting_mode_and_disabled_sound() {
    let meeting = settings_with("chime", true, true);
    assert_eq!(
        resolve_reminder_sound(&meeting, ReminderLevel::Strong),
        None
    );
    let muted = settings_with("chime", false, false);
    assert_eq!(
        resolve_reminder_sound(&muted, ReminderLevel::Noticeable),
        None
    );
    assert!(!reminder_sound_enabled(&meeting));
}

#[test]
fn off_and_unknown_settings_resolve_safely() {
    let off = settings_with("off", true, false);
    assert_eq!(
        resolve_reminder_sound(&off, ReminderLevel::Noticeable),
        None
    );
    let unknown = settings_with("bogus", true, false);
    // 未知选项回落到 Auto 映射，而不是静音或报错。
    assert_eq!(
        resolve_reminder_sound(&unknown, ReminderLevel::Noticeable),
        Some(ReminderSound::Chime)
    );
    assert_eq!(ReminderSound::from_setting("bogus"), ReminderSound::Auto);
}
