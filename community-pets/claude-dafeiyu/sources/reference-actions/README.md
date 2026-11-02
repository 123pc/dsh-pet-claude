# 敬礼、回眸与跳起张臂的关键帧

使用内置 imagegen 生成完整人物关键帧；提示词为同目录的 `*-prompt.txt`。角色比例与现有站立图保持一致。没有剪贴关节、变形网格或混合补帧。

- `salute.png`：抱文件敬礼。2.75 秒；左手持文件，右手完成抬手、敬礼、收手。
- 敬礼用于新工作接单并显示确认文案，回眸可从菜单或随机日常播放。
- 新增 [`跳起后张臂`](../happy-open-arms/README.md)：屈膝起跳、空中张臂、落地缓冲的约 3 秒短动作。
- `breeze-lookback.png`：回眸随风。4.5 秒；剔除朝向突然跳变的尾部姿势，选用 8 张完整画面完成转身和回正。

当前实际选帧、每帧停留和输出哈希见 `choreography.json`。

从仓库根目录重建：

```powershell
python tools/animation/build_reference_actions.py
python tools/animation/build_happy_open_arms.py
python tools/animation/register_reference_actions.py
python tools/release/build_gallery.py
```

注册脚本只添加新视频与配置引用，保留原 119 个视频文件；旧走路素材不参与重编码。
