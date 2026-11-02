# 跳起后张臂

按用户补充要求，用内置 imagegen 绘制屈膝蓄力、蹬地起跳、空中张臂、下降和落地缓冲。双脚离地之后才展开双臂，落地后笑着站稳，停留片刻再收回。它不包含舞蹈舞步。

- `jump-takeoff.png`、`jump-landing.png`：新生成的起跳与落地完整人物关键帧，各 4×3 排列。
- `jump-takeoff.prompt.txt`、`jump-landing.prompt.txt`：本轮内置图像生成的完整提示词。
- `happy-open-arms.png`：保留前一版完整人物画面，用于落地停留之后收回双臂。
- `style-reference.png`：生成时使用的现有桌宠风格参考。
- `choreography.json`：实际选帧、停留时长与视频 SHA256。

输出约 3.21 秒，选用 32 张绘制画面，起跳与空中动作最高每秒 24 张，落地缓冲及收手每秒 12 张，编码为 24fps 透明 WebM。落地站稳后额外保持 1 秒。离地高度约 44 像素，明确写入时间线；只对完整人物做裁切、统一缩放和整体位移，没有拼贴或变形四肢，也没有把空中姿势重新对齐到地面。

从仓库根目录重建：

```powershell
python tools/animation/build_happy_open_arms.py
python tools/animation/register_reference_actions.py
python tools/animation/stage_reference_preview.py
python tools/release/build_gallery.py
```

同批新增的敬礼、回眸由 `../reference-actions/` 中的素材构建；本工具不修改这两个视频或原有 119 段素材。
