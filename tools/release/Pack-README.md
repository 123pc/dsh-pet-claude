# Claude 大肥鱼角色包 0.7.3

包含站立、托腮两种形态，122 段透明动画，包括抱文件认真敬礼、转身回眸·发梢随风和跳起后张臂。

需要使用本分支的引擎，原版引擎不会执行换装、随机动作链或办公入场/收尾。

在 DSH 中首次启动本分支插件以创建素材目录，退出 DSH，进入此文件夹：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\install.ps1 -CheckOnly
powershell -NoProfile -ExecutionPolicy Bypass -File .\install.ps1
```

默认安装到 `%USERPROFILE%\.dsh\dsh-pet\pet`；自定义目录请添加 `-PetRoot '实际素材目录'`。安装器校验哈希、备份被覆盖文件，保留已有实例偏好。重启 DSH 后右键桌宠 → 换装。

卸载此角色包：`powershell -NoProfile -ExecutionPolicy Bypass -File .\uninstall.ps1`。

**Windows 解压即用版的用户不需要手动运行安装器**，直接使用上级文件夹的 `启动桌宠.cmd`。

完整说明和引擎下载：https://github.com/123pc/dsh-pet-claude
