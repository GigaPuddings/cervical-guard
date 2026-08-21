use super::*;

#[test]
fn preview_event_uses_an_embeddable_jpeg_data_url() {
    assert_eq!(
        preview_data_url(&[0xff, 0xd8, 0xff, 0xd9]),
        "data:image/jpeg;base64,/9j/2Q=="
    );
}

#[test]
fn camera_permission_error_is_not_reported_as_external_occupancy() {
    let error = nokhwa::NokhwaError::OpenDeviceError(
        "0".to_string(),
        "Access is denied. (0x80070005)".to_string(),
    );
    let message = camera_message(&error);
    assert!(message.contains("权限已关闭"), "{message}");
    assert!(!message.contains("其他应用"), "{message}");
}

#[test]
fn only_an_explicit_sharing_violation_is_reported_as_busy() {
    let error = nokhwa::NokhwaError::OpenStreamError(
            "The process cannot access the device because it is being used by another process. (0x80070020)"
                .to_string(),
        );
    let message = camera_message(&error);
    assert!(message.contains("其他应用独占"), "{message}");
}

#[test]
fn missing_camera_has_a_distinct_message() {
    let error = nokhwa::NokhwaError::OpenDeviceError("0".to_string(), "No device".to_string());
    let message = camera_message(&error);
    assert!(message.contains("未检测到可用摄像头"), "{message}");
}

#[test]
fn driver_resource_failure_is_not_reported_as_busy() {
    let error = nokhwa::NokhwaError::OpenStreamError(
        "Hardware MFT failed to start streaming due to lack of hardware resources. (0xC00D3704)"
            .to_string(),
    );
    let message = camera_message(&error);
    assert!(message.contains("驱动或硬件资源异常"), "{message}");
    assert!(message.contains("0xC00D3704"), "{message}");
    assert!(!message.contains("其他应用"), "{message}");
}

#[test]
fn unknown_open_failure_stays_neutral_and_keeps_hresult() {
    let error = nokhwa::NokhwaError::OpenDeviceError(
        "0".to_string(),
        "Unspecified failure. (0x80004005)".to_string(),
    );
    let message = camera_message(&error);
    assert!(message.contains("摄像头启动失败"), "{message}");
    assert!(message.contains("0x80004005"), "{message}");
    assert!(!message.contains("其他应用独占"), "{message}");
}

fn keypoint(x: f64, y: f64, score: f64) -> Keypoint {
    Keypoint { x, y, score }
}

fn seated(nose_y: f64) -> PoseResult {
    let mut points = vec![keypoint(0.5, 0.5, 0.0); KEYPOINT_COUNT];
    points[NOSE] = keypoint(0.5, nose_y, 0.95);
    points[LEFT_EYE] = keypoint(0.48, nose_y - 0.02, 0.9);
    points[RIGHT_EYE] = keypoint(0.52, nose_y - 0.02, 0.9);
    points[LEFT_EAR] = keypoint(0.44, nose_y + 0.02, 0.3);
    points[RIGHT_EAR] = keypoint(0.56, nose_y + 0.02, 0.3);
    let max_score = points.iter().map(|point| point.score).fold(0.0, f64::max);
    PoseResult {
        keypoints: points,
        max_score,
    }
}

fn head_down(nose_y: f64) -> PoseResult {
    let mut points = vec![keypoint(0.5, 0.5, 0.0); KEYPOINT_COUNT];
    points[NOSE] = keypoint(0.5, nose_y, 0.95);
    points[LEFT_EYE] = keypoint(0.47, nose_y - 0.04, 0.9);
    points[RIGHT_EYE] = keypoint(0.53, nose_y - 0.04, 0.9);
    points[LEFT_EAR] = keypoint(0.41, nose_y - 0.08, 0.8);
    points[RIGHT_EAR] = keypoint(0.59, nose_y - 0.08, 0.8);
    let max_score = points.iter().map(|point| point.score).fold(0.0, f64::max);
    PoseResult {
        keypoints: points,
        max_score,
    }
}

#[test]
fn uses_calibrated_head_position_and_face_geometry() {
    let normal = seated(0.4);
    let down = head_down(0.56);
    let baseline = head_ratio_of(&normal).expect("normal ratio");
    let observation = create_observation(&down, baseline, 120.0, 20.0);
    assert!(observation.head.down_score > 0.5);
}

#[test]
fn disabling_head_detection_skips_the_head_down_algorithm() {
    let normal = seated(0.4);
    let down = head_down(0.56);
    let baseline = head_ratio_of(&normal).expect("normal ratio");
    let observation = create_observation_with_head_detection(&down, baseline, 120.0, 20.0, false);
    assert_eq!(observation.head.down_score, 0.0);
}

#[test]
fn downward_translation_without_face_geometry_is_not_head_down() {
    let normal = seated(0.4);
    let shifted_normal = seated(0.52);
    let baseline = head_ratio_of(&normal).expect("normal ratio");

    let observation = create_observation(&shifted_normal, baseline, 120.0, 20.0);

    assert_eq!(observation.head.down_score, 0.0);
}

#[test]
fn gates_low_light_frames() {
    let observation = create_observation(&seated(0.4), -1.0, 10.0, 20.0);
    assert_eq!(observation.frame_quality, FrameQuality::Dark);
}

#[test]
fn recognizes_seated_person_from_head_only() {
    let pose = seated(0.45);
    let observation = create_observation(&pose, 0.45, 120.0, 20.0);
    assert_eq!(observation.frame_quality, FrameQuality::Good);
    assert!(observation.person.confidence > 0.85);
    assert_eq!(observation.posture.state, PostureState::Sitting);
    assert!(observation.posture.confidence > 0.8);
}

#[test]
fn body_keypoints_do_not_change_head_quality() {
    let pose = seated(0.45);
    let expected = visibility_of(&pose);
    let mut with_body = pose.clone();
    for index in HEAD_KEYPOINTS.len()..KEYPOINT_COUNT {
        with_body.keypoints[index] = keypoint(0.5, 0.7, 0.99);
    }

    assert_eq!(visibility_of(&with_body), expected);
    let observation = create_observation(&with_body, 0.45, 120.0, 20.0);
    assert_eq!(observation.posture.state, PostureState::Sitting);
}

#[test]
fn typical_movenet_scores_are_calibrated_to_product_quality() {
    let mut pose = seated(0.45);
    for &index in &HEAD_KEYPOINTS {
        pose.keypoints[index].score = 0.6;
    }
    let quality = visibility_of(&pose);
    assert!(quality > 0.65 && quality < 0.72, "quality = {quality}");
}

#[test]
fn visibility_stable_when_head_turned() {
    // 模拟转头:鼻尖+左眼+左耳 score 突降
    let mut turned = seated(0.4);
    turned.keypoints[NOSE].score = 0.3;
    turned.keypoints[LEFT_EYE].score = 0.3;
    turned.keypoints[LEFT_EAR].score = 0.1;
    let observation = create_observation(&turned, 0.4, 120.0, 20.0);
    assert!(observation.person.present);
    assert_eq!(observation.frame_quality, FrameQuality::Occluded);
    assert_eq!(observation.posture.state, PostureState::Unknown);
    assert_eq!(observation.head.down_score, 0.0);
}

#[test]
fn visibility_stable_when_hand_covers_face() {
    // 模拟手摸脸:双眼被遮挡
    let mut hand_on_face = seated(0.4);
    hand_on_face.keypoints[LEFT_EYE].score = 0.1;
    hand_on_face.keypoints[RIGHT_EYE].score = 0.1;
    let observation = create_observation(&hand_on_face, 0.4, 120.0, 20.0);
    assert!(observation.person.present);
    assert_eq!(observation.frame_quality, FrameQuality::Occluded);
    assert_eq!(observation.posture.state, PostureState::Unknown);
    assert_eq!(observation.head.down_score, 0.0);
}

#[test]
fn head_centroid_works_without_nose() {
    // 鼻尖被手遮挡,但双眼可见
    let mut pose = seated(0.4);
    pose.keypoints[NOSE].score = 0.1;
    let centroid = head_centroid(&pose);
    assert!(centroid.is_some(), "head_centroid should work without nose");
    let (_, _, conf) = centroid.unwrap();
    assert!(conf > 0.5, "head confidence = {conf}");
}

#[test]
fn head_centroid_fails_when_all_head_keypoints_low() {
    let mut pose = seated(0.4);
    for &i in &HEAD_KEYPOINTS {
        pose.keypoints[i].score = 0.1;
    }
    assert!(head_centroid(&pose).is_none());
}

#[test]
fn body_keypoints_cannot_assert_presence_without_a_head() {
    let mut pose = seated(0.4);
    for &index in &HEAD_KEYPOINTS {
        pose.keypoints[index].score = 0.1;
    }
    for index in HEAD_KEYPOINTS.len()..KEYPOINT_COUNT {
        pose.keypoints[index] = keypoint(0.5, 0.7, 0.99);
    }

    let observation = create_observation(&pose, 0.4, 120.0, 20.0);

    assert!(!observation.person.present);
    assert!(!observation.person.uncertain);
}

#[test]
fn a_single_trusted_head_point_is_uncertain_instead_of_away() {
    let mut pose = PoseResult {
        keypoints: vec![keypoint(0.5, 0.5, 0.01); KEYPOINT_COUNT],
        max_score: 0.95,
    };
    pose.keypoints[NOSE] = keypoint(0.5, 0.4, 0.95);

    let observation = create_observation(&pose, 0.4, 120.0, 20.0);

    assert!(!observation.person.present);
    assert!(observation.person.uncertain);
    assert!(observation.person.confidence > 0.0);
}

#[test]
fn scattered_head_points_are_rejected_as_occlusion() {
    let mut pose = seated(0.4);
    pose.keypoints[RIGHT_EAR].x = 0.95;

    let observation = create_observation(&pose, 0.4, 120.0, 20.0);

    assert!(observation.person.present);
    assert_eq!(observation.posture.state, PostureState::Unknown);
    assert_eq!(observation.frame_quality, FrameQuality::Occluded);
    assert_eq!(observation.head.down_score, 0.0);
}

#[test]
fn head_position_works_without_shoulders() {
    let pose = seated(0.4);
    let ratio = head_ratio_of(&pose);
    assert!(
        ratio.is_some(),
        "head position should not require shoulders"
    );
    assert!((ratio.unwrap() - 0.4).abs() < 0.03);
}

#[test]
fn head_down_geometry_works_with_one_reliably_visible_side() {
    let normal = seated(0.4);
    let baseline = head_ratio_of(&normal).expect("normal ratio");
    // 一侧耳朵被遮挡时，另一侧完整的耳-眼-鼻链仍可提供几何证据。
    let mut occluded = head_down(0.56);
    occluded.keypoints[LEFT_EAR].score = 0.1;
    let ratio = head_ratio_of(&occluded);
    assert!(
        ratio.is_some(),
        "head_ratio should work with one visible side"
    );
    let observation = create_observation(&occluded, baseline, 120.0, 20.0);
    assert!(
        observation.head.down_score > 0.5,
        "down_score = {}",
        observation.head.down_score
    );
}

#[test]
fn missing_nose_cannot_assert_head_down_geometry() {
    let normal = seated(0.4);
    let baseline = head_ratio_of(&normal).expect("normal ratio");
    let mut occluded = head_down(0.56);
    occluded.keypoints[NOSE].score = 0.1;

    let observation = create_observation(&occluded, baseline, 120.0, 20.0);

    assert_eq!(observation.head.down_score, 0.0);
}

#[test]
fn head_rise_is_not_interpreted_as_standing() {
    let normal = seated(0.43);
    let baseline = head_ratio_of(&normal).expect("normal position");
    let mut raised = seated(0.30);
    for index in HEAD_KEYPOINTS.len()..KEYPOINT_COUNT {
        raised.keypoints[index] = keypoint(0.5, 0.7, 0.99);
    }
    let observation = create_observation(&raised, baseline, 120.0, 20.0);
    assert_eq!(observation.posture.state, PostureState::Sitting);
    assert!(observation.posture.confidence > 0.8);
}

#[test]
fn smooth_pose_reduces_score_fluctuation() {
    // 模拟 MoveNet 逐帧 score 波动: 0.95 → 0.5
    let frame_a = seated(0.4);
    let frame_b = {
        let mut p = seated(0.4);
        // 模拟鼻尖 score 突降
        p.keypoints[NOSE].score = 0.5;
        p
    };
    // 无平滑: frame_b 鼻尖 score = 0.5
    assert_eq!(frame_b.keypoints[NOSE].score, 0.5);
    // 有 EMA 平滑: 0.5 * 0.5 + 0.95 * 0.5 = 0.725
    let smoothed = smooth_pose(&frame_b, &Some(frame_a), 0.5);
    assert!(smoothed.keypoints[NOSE].score > 0.6);
    assert!(smoothed.keypoints[NOSE].score < 0.8);
}

#[test]
fn smooth_pose_first_frame_returns_raw() {
    let raw = seated(0.4);
    let smoothed = smooth_pose(&raw, &None, 0.5);
    assert_eq!(smoothed.keypoints[NOSE].score, raw.keypoints[NOSE].score);
}

#[test]
fn no_person_when_all_scores_low() {
    let empty = PoseResult {
        keypoints: vec![keypoint(0.5, 0.5, 0.01); KEYPOINT_COUNT],
        max_score: 0.01,
    };
    let observation = create_observation(&empty, -0.9, 120.0, 20.0);
    assert!(!observation.person.present);
    assert!(!observation.person.uncertain);
    assert_eq!(observation.frame_quality, FrameQuality::Unstable);
}

#[test]
fn is_jpeg_detects_soi_marker() {
    assert!(is_jpeg(&[0xFF, 0xD8, 0x00]));
    assert!(!is_jpeg(&[0x00, 0x00]));
    assert!(!is_jpeg(&[]));
}

#[test]
fn letterbox_rgb_produces_correct_layout() {
    // 创建 2x2 红色图像
    let img = ImageBuffer::from_raw(2, 2, vec![200, 0, 0, 200, 0, 0, 200, 0, 0, 200, 0, 0])
        .expect("create image");
    let (pixels, lb) = letterbox_rgb(&img, 4);
    // 2x2 图像缩放到 4x4:scale = min(4/2, 4/2) = 2, resized = 4x4, offset = 0
    assert_eq!(lb.resized_w, 4);
    assert_eq!(lb.resized_h, 4);
    assert_eq!(lb.offset_x, 0.0);
    assert_eq!(lb.offset_y, 0.0);
    // NHWC 布局:4*4*3 = 48 个 int32
    assert_eq!(pixels.len(), 48);
    // NHWC:第一个像素的 R 通道在 pixels[0]
    assert_eq!(pixels[0], 200, "R channel = {}", pixels[0]);
    // G 通道在 pixels[1]
    assert_eq!(pixels[1], 0, "G channel = {}", pixels[1]);
    // B 通道在 pixels[2]
    assert_eq!(pixels[2], 0, "B channel = {}", pixels[2]);
}

#[test]
fn letterbox_rgb_preserves_aspect() {
    // 640x480 图像缩放到 192x192:scale = min(192/640, 192/480) = 0.3
    let img = ImageBuffer::from_raw(640, 480, vec![128; 640 * 480 * 3]).expect("create image");
    let (_, lb) = letterbox_rgb(&img, INPUT_SIZE);
    assert_eq!(lb.resized_w, 192); // 640 * 0.3 = 192
    assert_eq!(lb.resized_h, 144); // 480 * 0.3 = 144
                                   // offset_x = (192 - 192) / 2 = 0
    assert_eq!(lb.offset_x, 0.0);
    // offset_y = (192 - 144) / 2 = 24
    assert_eq!(lb.offset_y, 24.0);
}
