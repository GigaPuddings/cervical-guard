#!/usr/bin/env python3
"""下载 MoveNet SinglePose Lightning 模型并转换为 ONNX 格式。

MoveNet 是 Google 开发的超轻量级 2D 人体姿态估计模型，
在 CPU 上可达 ~50ms/帧，适合实时应用。

TF Hub 已停用，模型已迁移至 Kaggle Models。
本脚本使用 kagglehub 从 Kaggle 下载 SavedModel，
再用 tf2onnx 转换为 ONNX 格式（int32 NHWC 输入，float32 输出）。

输出：
  src-tauri/resources/models/movenet_singlepose_lightning.onnx

前置条件（推荐用 uv 一键运行，无需手动安装）：
  uv run --python 3.11 --with kagglehub --with tensorflow --with tf2onnx --with onnxruntime \
      python scripts/download_movenet_model.py

  如已有 Python 3.11 环境也可手动安装：
  pip install kagglehub tensorflow tf2onnx onnxruntime

用法：
  python scripts/download_movenet_model.py
"""

from __future__ import annotations

import sys
from pathlib import Path

# ── 模型配置 ──────────────────────────────────────────────────────────────

# Kaggle 模型标识（替代已停用的 TF Hub URL）
KAGGLE_MODEL_HANDLE = "google/movenet/tensorFlow2/singlepose-lightning"

INPUT_SIZE = 192
INPUT_NAME = "input"
OUTPUT_NAME = "output_0"
OPSET_VERSION = 13

# 模型输出路径
SCRIPT_DIR = Path(__file__).resolve().parent
PROJECT_ROOT = SCRIPT_DIR.parent
OUTPUT_PATH = PROJECT_ROOT / "src-tauri" / "resources" / "models" / "movenet_singlepose_lightning.onnx"


def check_dependencies() -> None:
    """检查必要的 Python 依赖是否已安装。"""
    missing: list[str] = []
    for module in ("tensorflow", "tf2onnx", "kagglehub"):
        try:
            __import__(module)
        except ImportError:
            missing.append(module)
    if missing:
        print("缺少以下依赖：", ", ".join(missing))
        print("\n推荐使用 uv 一键运行（自动下载 Python 3.11 + 安装依赖）：")
        print(
            "  uv run --python 3.11 --with kagglehub --with tensorflow --with tf2onnx --with onnxruntime \\\n"
            "      python scripts/download_movenet_model.py"
        )
        print("\n或手动安装（需 Python 3.9-3.12）：")
        print("  pip install kagglehub tensorflow tf2onnx onnxruntime")
        sys.exit(1)


def download_saved_model() -> str:
    """通过 kagglehub 下载 MoveNet SavedModel，返回本地路径。"""
    import kagglehub

    print(f"正在从 Kaggle 下载 MoveNet SinglePose Lightning ...")
    print(f"  模型标识: {KAGGLE_MODEL_HANDLE}")
    model_path = kagglehub.model_download(KAGGLE_MODEL_HANDLE)
    print(f"模型下载完成: {model_path}")
    return str(model_path)


def convert_to_onnx(saved_model_path: str) -> None:
    """将 SavedModel 转换为 ONNX 格式。

    使用 tf2onnx 命令行工具 (python -m tf2onnx.convert) 从 SavedModel 目录转换。
    原始模型的输入名 "input" 和输出名 "output_0"
    已经与 Rust 端 vision.rs 的预期完全匹配。
    """
    import subprocess

    # 加载 SavedModel 查看输入/输出信息（仅用于验证）
    print("正在加载 SavedModel 验证签名 ...")
    import tensorflow as tf
    model = tf.saved_model.load(saved_model_path)
    concrete_fn = model.signatures["serving_default"]

    print(f"  原始输入: {concrete_fn.structured_input_signature}")
    print(f"  原始输出: {concrete_fn.structured_outputs}")

    # 验证前向传播
    dummy = tf.zeros([1, INPUT_SIZE, INPUT_SIZE, 3], tf.int32)
    outputs = concrete_fn(dummy)
    print(f"  前向传播验证: output shape = {outputs['output_0'].shape}")

    # 使用 tf2onnx 命令行工具转换
    print(f"正在转换为 ONNX (opset {OPSET_VERSION}) ...")
    OUTPUT_PATH.parent.mkdir(parents=True, exist_ok=True)

    cmd = [
        sys.executable, "-m", "tf2onnx.convert",
        "--saved-model", saved_model_path,
        "--output", str(OUTPUT_PATH),
        "--opset", str(OPSET_VERSION),
    ]
    print(f"  命令: {' '.join(cmd)}")
    result = subprocess.run(cmd, capture_output=True, text=True)
    if result.returncode != 0:
        print(f"  stdout: {result.stdout}")
        print(f"  stderr: {result.stderr}")
        sys.exit(1)

    # tf2onnx 命令行工具输出到 stderr
    if result.stderr:
        for line in result.stderr.strip().split("\n")[-5:]:
            print(f"  {line}")

    print(f"\nONNX 导出完成: {OUTPUT_PATH}")
    print(f"文件大小: {OUTPUT_PATH.stat().st_size / 1024 / 1024:.1f} MB")


def verify_onnx() -> None:
    """验证导出的 ONNX 模型。"""
    try:
        import onnxruntime as ort

        session = ort.InferenceSession(str(OUTPUT_PATH), providers=["CPUExecutionProvider"])
        print("\n模型验证:")
        for inp in session.get_inputs():
            print(f"  输入: name={inp.name}, shape={inp.shape}, type={inp.type}")
        for out in session.get_outputs():
            print(f"  输出: name={out.name}, shape={out.shape}, type={out.type}")

        # 运行一次推理测试
        import numpy as np

        dummy = np.zeros((1, INPUT_SIZE, INPUT_SIZE, 3), dtype=np.int32)
        results = session.run(None, {INPUT_NAME: dummy})
        print(f"\n推理测试: output shape = {results[0].shape}, dtype = {results[0].dtype}")
        print("验证通过！")
    except ImportError:
        print("(未安装 onnxruntime，跳过验证)")


def main() -> None:
    print("=" * 60)
    print("MoveNet SinglePose Lightning ONNX 下载工具")
    print("=" * 60)

    check_dependencies()

    if OUTPUT_PATH.exists():
        print(f"\n注意: {OUTPUT_PATH} 已存在，将被覆盖")

    # 1. 从 Kaggle 下载 SavedModel
    saved_model_path = download_saved_model()

    # 2. 转换为 ONNX
    convert_to_onnx(saved_model_path)

    # 3. 验证
    verify_onnx()

    print("\n" + "=" * 60)
    print("完成！")
    print(f"ONNX 模型路径: {OUTPUT_PATH}")
    print("\n接下来请重新构建 Tauri 应用：")
    print("  pnpm tauri dev   # 开发模式")
    print("  pnpm tauri build # 生产构建")
    print("=" * 60)


if __name__ == "__main__":
    main()
