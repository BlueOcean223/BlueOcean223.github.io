---
title: Docker 构建缓存优化经验：从"每次冷构建"到"只重跑尾部几层"
pubDate: 2026-06-26T12:06:00.000Z
tags:
  - Docker
  - BuildKit
  - 构建优化
  - 离线部署
---

最近在折腾一个离线镜像，里面塞了一个 Python（uv 管依赖）+ Node（pnpm 管依赖）的混合项目，外加一个有点重的浏览器二进制安装步骤。

一开始打镜像非常慢。改一个测试文件、调一行注释、改一段文档，Python 依赖重装一遍，Node 依赖重装一遍，浏览器二进制也重装一遍。每次都在冷构建，完全没办法做小步迭代。

后来把 `Dockerfile` 和构建脚本翻修了一轮，大部分昂贵层开始稳定命中 cache。现在真正每次重跑的只剩尾部这几层：

```text
COPY . /app
uv sync
pnpm --dir extension build
buildx --output type=docker,dest=...
```

结论就一句话：**Dockerfile 的分层顺序和 BuildKit cache 怎么用，直接决定了你每天的迭代成本。**

下面记一下这套调整里真正管用的东西。

# 1. 别一上来就 COPY 全仓库

旧写法大概是这个路子：

```dockerfile
COPY . /app
RUN uv sync
RUN pnpm install
RUN pnpm build
```

任何一个文件变动都会打穿 `COPY .` 这一层，后面全跟着重跑。哪怕你只改了一个测试文件，依赖安装也从头来一遍。

Docker 官方文档说得够直白：把指令按"不常变 → 经常变"排序，昂贵且稳定的放前面，经常改动的源码放最后。

# 2. 先把 lockfile 单独 COPY 进去

调整之后，依赖文件的 `COPY` 独立出来，装完依赖再 COPY 源码：

```dockerfile
COPY pyproject.toml uv.lock ${APP_HOME}/
RUN --mount=type=cache,target=/home/runner/.cache/uv,uid=1001,gid=1001 \
    uv sync --no-install-project; \
    UV_NO_SYNC=1 uv run python -m <browser_install_step>

COPY extension/package.json \
     extension/pnpm-lock.yaml \
     extension/pnpm-workspace.yaml \
     ${APP_HOME}/extension/
RUN --mount=type=cache,target=/home/runner/.local/share/pnpm/store,uid=1001,gid=1001 \
    pnpm --dir extension install --frozen-lockfile

COPY . ${APP_HOME}
RUN --mount=type=cache,target=/home/runner/.cache/uv,uid=1001,gid=1001 \
    uv sync; \
    pnpm --dir extension build
```

效果很直接。改 `src/` 或 `extension/` 下的 TS、测试文件，不会触发 Python / Node 依赖安装。只有改 `pyproject.toml` / `uv.lock` 时才会重跑 Python 依赖和浏览器安装；只有改 `package.json` / `pnpm-lock.yaml` 时才会重跑 `pnpm install`。

这个"按变化频率分层"的思路不复杂，但收益很大。

# 3. 层失效了，也别重新下载

普通 layer cache 是精确匹配：指令变了，这层就废，下次从头跑。

BuildKit 的 `--mount=type=cache` 是另一种思路——它给某个 `RUN` 步骤挂一个持久化的缓存目录。即使这层因为其他原因重跑了，包管理器自己的下载缓存还在，不用重新从网络拉包。

实际用的几个：

```dockerfile
RUN --mount=type=cache,target=/var/cache/apt,sharing=locked \
    --mount=type=cache,target=/var/lib/apt/lists,sharing=locked \
    apt-get update && apt-get install ...

RUN --mount=type=cache,target=/home/runner/.cache/uv,uid=1001,gid=1001 \
    uv sync --no-install-project

RUN --mount=type=cache,target=/home/runner/.local/share/pnpm/store,uid=1001,gid=1001 \
    pnpm --dir extension install --frozen-lockfile
```

几点注意：

- `apt` 的 cache 建议 `sharing=locked`，避免并发构建写冲突。
- 非 root 用户构建时 cache mount 要带 `uid` / `gid`，不然权限不对。
- cache mount 不进入最终镜像，只在 builder 侧存在。
- 换 builder、清 build cache、CI 临时 runner 都可能让它丢失，别当永久存储用。

# 4. `.dockerignore` 不只是"排除文件"

`.dockerignore` 看着不起眼，但 build context 大小直接由它决定：

```text
.git
.agent
.venv
node_modules
extension/node_modules
dist
build
*.tar
*.env.local
**/*.env
```

几个层面的收益：

- **更快**：传给 builder 的上下文小得多。
- **更安全**：`.env`、本地 secrets、旧 bundle 不会被意外烘进镜像。
- **cache 更稳**：无关文件的变动不会打穿 `COPY .` 层。

调完之后可以 exec 进去确认目录确实被排除了：

```bash
docker exec <container> bash -lc \
  'test -d /app/.agent && echo present || echo absent'
```

返回 `absent` 才算数。

还有一个取舍：要不要把 `tests/` 也放进 `.dockerignore`？放了，测试文件改动不影响 cache；不放，镜像里能跑 smoke 测试。看你的场景选。

# 5. 离线部署，直接出 tar

如果最终用途是"本地构建 → scp 到服务器 → `docker load`"，可以跳过中间的 load/save：

```bash
docker buildx build --output type=docker,dest=$tar_path ...
```

比传统写法少绕一步：

```bash
# 旧路径
docker buildx build --load ...
docker image save -o image.tar image:tag
```

直接拿到 deploy tar，适合离线分发。如果你还需要本地 `docker run` 做 smoke 测试，加个开关就行，比如 `LOAD_IMAGE=1 RUN_SMOKE=1`，让脚本先 load 再跑。

# 6. Cache 失效了怎么排查

构建速度掉回冷构建的时候，按这个顺序过一遍：

1. `Dockerfile` 里昂贵层前面的指令是不是动过。
2. `pyproject.toml` / `uv.lock` 改了没。
3. `package.json` / `pnpm-lock.yaml` 改了没。
4. 是不是不小心带了 `--no-cache` 或 `NO_CACHE=1`。
5. Docker Desktop / buildx builder 的 cache 被清了没。
6. 是不是切了 buildx builder。
7. `.dockerignore` 漏了某个大目录或频繁变化的目录。
8. 是不是误把 `.git`、`dist`、旧 tar、runtime 状态放进了 context。

顺手记几个有用的命令：

```bash
docker buildx ls          # 看当前 builder
docker system df          # Docker 磁盘占用
docker buildx du          # build cache 占用
docker buildx prune       # 清 cache（会让下次变冷构建）
```

# 7. 几种机制怎么区分

刚接触的时候很容易把 layer cache、cache mount、`.dockerignore` 搞混，列个表：

| 概念 | 作用 | 典型场景 | 进最终镜像？ |
| --- | --- | --- | --- |
| Layer cache | 复用某条指令的结果 | `RUN pnpm install` 输入没变 | 是 |
| Cache mount | 给构建步骤挂持久缓存目录 | npm/pnpm/uv/pip/apt 下载缓存 | 否 |
| `.dockerignore` | 控制 build context | 排除 `.git`、`dist`、secrets | 不进入 context |
| External cache | 跨机器 / CI 共享 cache | GitHub Actions / 临时 runner | 在 registry 或 GHA cache |

把这几种分清楚，后面再碰到"为什么没命中"就不会一头雾水了。

# 几条原则

- Dockerfile **越靠前**，放稳定、昂贵、少变的东西。
- Dockerfile **越靠后**，放源码、测试、文档这些频繁改动的。
- 装依赖之前**只 COPY lockfile / manifest，不要 COPY 整个仓库**。
- 大下载和包管理器，能用 BuildKit cache mount 就用。
- `.dockerignore` 既是性能优化，也是安全边界。
- 离线 bundle 直接 `buildx --output type=docker,dest=...`，本地要跑再开 `LOAD_IMAGE`。
- 别随手 `--no-cache`，除非你真的要看一次冷构建。

# 参考

- Docker Docs — Optimize cache usage in builds: https://docs.docker.com/build/cache/optimize/
- Docker Docs — `.dockerignore` files: https://docs.docker.com/build/concepts/context/#dockerignore-files
- Docker Docs — Cache invalidation: https://docs.docker.com/build/cache/invalidation/
- Docker Docs — `RUN --mount=type=cache`: https://docs.docker.com/reference/dockerfile/#run---mounttypecache
- Docker Docs — Build cache backends: https://docs.docker.com/build/cache/backends/

# 小结

最大的变化是体感上的：之前每次构建都像冷启动，现在改源码只重跑尾部几层，迭代速度快了一大截。镜像大小也顺手降了一些（裁掉了无关层），但真正值钱的是每天省下来的那点等待时间。

下次开新项目，第一版 Dockerfile 应该会直接按这个套路写：先 lockfile，再依赖，再源码，依赖步骤一律挂 cache mount。
