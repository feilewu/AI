# 工作约定

## Spec 存放规则

`/home/ubuntu/ai` 下所有子工程的 spec 都统一放入 `docs/` 目录下，按子工程名组织。

## 端口使用

开发需要占用端口时，先用 `lsof -i:<port>` 或 `ss -tlnp` 检查端口是否被占用。如被占用，换用其他可用端口。

## Docker 构建加速

编写 Dockerfile 时直接内置国内镜像源，避免构建时因网络问题失败：

- **apt**: 替换 Debian 源为 `mirrors.tuna.tsinghua.edu.cn`
- **pip**: 加 `-i https://pypi.tuna.tsinghua.edu.cn/simple`

详见 `docs/knownledge/docker-mirror-sources.md`。
