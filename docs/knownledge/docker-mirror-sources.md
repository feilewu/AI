# Docker 构建加速：镜像源替换

## 问题

Docker build 时 `apt-get update` / `pip install` 连接国外源极慢甚至超时。

## 解决方案

### apt (Debian/Ubuntu)

```dockerfile
RUN sed -i 's|deb.debian.org|mirrors.tuna.tsinghua.edu.cn|g' /etc/apt/sources.list.d/debian.sources \
    && sed -i 's|deb.debian.org/debian-security|mirrors.tuna.tsinghua.edu.cn/debian-security|g' /etc/apt/sources.list.d/debian.sources \
    && apt-get update -qq \
    && apt-get install -y -qq --no-install-recommends <pkg> \
    && rm -rf /var/lib/apt/lists/*
```

其他可用镜像源（按速度排序）：
- `mirrors.tuna.tsinghua.edu.cn` — 清华（最快）
- `mirrors.ustc.edu.cn` — 中科大
- `mirrors.aliyun.com` — 阿里云

### pip

```dockerfile
RUN pip install --no-cache-dir -i https://pypi.tuna.tsinghua.edu.cn/simple -r requirements.txt
```

其他可用镜像源：
- `https://pypi.tuna.tsinghua.edu.cn/simple` — 清华
- `https://mirrors.aliyun.com/pypi/simple/` — 阿里云
- `https://pypi.mirrors.ustc.edu.cn/simple/` — 中科大

## 注意事项

- `--no-install-recommends` 减少 apt 安装的冗余包
- `--no-cache-dir` 减少 pip 缓存层大小
- apt 换源后必须 `rm -rf /var/lib/apt/lists/*` 缩小镜像体积
