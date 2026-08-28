use super::*;

#[test]
fn language_falls_back_to_chinese_for_unknown_values() {
    assert_eq!(Language::from_setting("zh-CN"), Language::ZhCn);
    assert_eq!(Language::from_setting("en-US"), Language::EnUs);
    assert_eq!(Language::from_setting("fr-FR"), Language::ZhCn);
    assert_eq!(Language::from_setting(""), Language::ZhCn);
}

#[test]
fn every_message_has_both_language_variants() {
    // 消息表的完整性由声明保证；这里抽查若干关键文案不会回落。
    let samples = [
        (
            &msg::REMINDER_COMBINED_TITLE,
            "该舒展一下了",
            "Time to stretch",
        ),
        (
            &msg::CAMERA_PERMISSION_DENIED_BY_USER,
            "摄像头权限已关闭。",
            "Camera access is turned off.",
        ),
        (&msg::TRAY_QUIT, "退出健康提醒", "Quit Health Reminder"),
        (
            &msg::ERR_REMINDER_THRESHOLDS,
            "提醒阈值超出允许范围",
            "Reminder thresholds are outside the allowed range",
        ),
    ];
    for (message, zh, en) in samples {
        assert!(
            message.get(Language::ZhCn).contains(zh),
            "{}",
            message.get(Language::ZhCn)
        );
        assert!(
            message.get(Language::EnUs).contains(en),
            "{}",
            message.get(Language::EnUs)
        );
    }
}

#[test]
fn format_replaces_named_placeholders() {
    let rendered = msg::TRAY_UPDATE_DOWNLOADING
        .format(Language::EnUs, &[("version", "0.2.0"), ("progress", "37")]);
    assert_eq!(rendered, "↓ Downloading v0.2.0 · 37%");
    let localized = msg::TRAY_UPDATE_DOWNLOADING
        .format(Language::ZhCn, &[("version", "0.2.0"), ("progress", "37")]);
    assert_eq!(localized, "↓ 正在下载 v0.2.0 · 37%");
}
