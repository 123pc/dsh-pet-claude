# 安装 Claude 大肥鱼

## Windows 解压即用

1. 在[发布页](https://github.com/123pc/dsh-pet-claude/releases/tag/claude-v0.7.3)下载 `claude-dafeiyu-windows-x64.zip`。
2. 解压到自己可写的文件夹，双击 `启动桌宠.cmd`。第一次启动会在该文件夹的 `data/` 安装角色与配置。
3. 右键桌宠 → 换装，选择站立或托腮；右键可点播动作，托盘菜单可以退出。

不需要安装 DSH、Node.js 或另行下载 Electron。不要只复制内部的 EXE；整个文件夹需要一起保留。升级前先退出，将新版本解压到另一个文件夹，把旧版 `data/` 复制过去再启动即可。删除整个文件夹就是卸载；保留 `data/` 即可保留设置。

解压版自带日常活动；跟随 DSH 任务的办公状态需要下面的插件模式。角色不需要联网生成动画。对话能力需另行配置模型，未配置不会自动调用模型服务。

## 安装到已有 DSH

本分支与原版使用相同插件 ID `dsh-pet`，作为原版替代安装，请勿同时安装两者。桌面模式使用 CLI 安装前先退出 DSH，并保存原有配置。

从同一发布页下载 `dsh-pet-claude.tgz`。这个插件包包含两种形态与 122 段动画，首次启动自动准备角色，不需要另行运行 PowerShell 安装器。单独安装角色包不能为原版引擎增加动作链与办公衔接。

0.7.3 新增抱文件认真敬礼、转身回眸·发梢随风和跳起后张臂。收到任务先敬礼并显示“收到任务，马上开始！”，再进入工作动作，任务步骤更新不会重复敬礼。市场展示名称为 **dsh-pet-claude**；内部包标识仍为 `dsh-pet`，便于已有安装继续升级。

Web 模式（Node.js 22.12+）：

```powershell
dsh plugin --profile web add file:D:/Downloads/dsh-pet-claude.tgz
```

桌面 DSH 使用应用内插件管理安装本地插件包，或使用桌面应用自带的 CLI 和对应 profile；不要误装到 `web` profile。

启动 DSH 后，新目录默认显示站立形态；右键 → 换装，可以选择「Claude-大肥鱼-站立」和「Claude-大肥鱼-托腮」。已有用户的偏好、自定义动作和视频会保留，新形态可从原桌宠的换装菜单选择。新角色默认关闭自动碎碎念和余额查询，可在设置中自行开启。

默认素材目录为 `%USERPROFILE%\.dsh\dsh-pet\pet`；设置了 `DSH_HOME` 时改用该目录下的 `dsh-pet/pet`。升级到 0.7.3 会补充缺失视频；若站立形态的动作定义仍与 0.7.2 官方模板一致，会先在同目录生成 `.before-bundled-<哈希>.bak` 原文件备份，再仅更新 `animations`。尺寸、位置、显示模式、开关和其它偏好均保留。自定义过动作定义的配置不自动修改，可将新动作名称手动加入自己的分类；用户修改过的视频也不替换。发布页仍保留角色 ZIP，供手动管理和卸载使用。

卸载两种 Claude 形态可运行角色包的 `uninstall.ps1`；它会保护用户修改与无关文件。恢复原版引擎请重新安装上游插件。

## 从源码构建

```powershell
git clone https://github.com/123pc/dsh-pet-claude.git
cd dsh-pet-claude/dsh-pet
npm install
npm run build
dsh plugin --profile web add file:D:/你的路径/dsh-pet-claude/dsh-pet
```

构建时会校验并整合仓库内的角色素材，启动后自动初始化。开发与接口资料见[上游文档](../UPSTREAM-README.md)、[换装](../dsh-pet/docs/outfits.md)、[动作扩展](../dsh-pet/docs/animation-extensions.md)。

Windows 发行包的重建方法：在插件目录完成 `npm run prepack` 和 `npm pack --ignore-scripts`，再从仓库根目录依次运行：

```powershell
python tools/release/collect_notices.py
python tools/release/build_release.py --electron '本机 Electron 解压目录' --plugin 'dsh-pet/dsh-pet-0.3.8-claude.3.tgz'
```

Python 依赖为 Pillow 与 imageio-ffmpeg；`collect_notices.py` 下载固定提交的第三方源码，打包脚本不会下载 Electron。主图与办公动图可用 `python tools/release/build_release.py --media-only` 重建；完整动作图鉴、首页动作预览与动作链使用 `python tools/release/build_gallery.py` 从已发布视频重新生成。
