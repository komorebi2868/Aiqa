# 部署说明（AIQA 答疑助手）

本项目零运行时依赖、无构建步骤，使用 Node.js 原生 `http` 模块实现。

| 项目 | 说明 |
|---|---|
| 入口 | `src/server.js` |
| 静态资源 | `public/`（由服务端直接托管） |
| 数据存储 | `data/qa-records.json`（单文件 JSON，不存在时自动创建） |
| 监听端口 | 默认 `3000`，可用环境变量 `PORT` 覆盖 |
| Node 版本 | `package.json` 要求 `>=14`；CI 与镜像统一使用 Node 24 |
| 运行时依赖 | 无（`devDependencies` 仅用于测试，启动时不需要） |

目录结构：

```
aiqa/
├── src/
│   ├── server.js          # HTTP 服务与静态文件托管
│   ├── routes/ask.js      # /api/ask、/api/history 路由
│   └── record/qaRecord.js # JSON 文件读写
├── public/                # index.html、app.js
├── data/qa-records.json   # 问答记录（运行时可写）
├── Dockerfile
├── .dockerignore
└── package.json
```

---

## 1. 本地启动

无需 `npm install` 即可运行，因为没有任何运行时依赖。

```bash
cd aiqa
node -v            # 确认 >= 14，推荐 20 或 24
npm start          # 等价于 node src/server.js
```

启动成功输出：

```
AIQA 演示服务已启动：http://localhost:3000
```

浏览器打开 <http://localhost:3000>，或直接调用接口：

```bash
# 查询历史记录
curl http://localhost:3000/api/history

# 提交问题
curl -X POST http://localhost:3000/api/ask \
  -H "Content-Type: application/json" \
  -d '{"question":"如何减小镜像体积？"}'
```

指定端口：

```powershell
# PowerShell
$env:PORT=8080; npm start
```

```bash
# bash / WSL
PORT=8080 npm start
```

如需运行测试（会用到 vitest / playwright 等开发依赖）：

```bash
npm install
npm test            # 单元 + 接口测试（vitest）
npm run test:e2e    # 端到端测试（playwright，需先 npx playwright install chromium）
```

---

## 2. 容器构建与运行

前提：已安装并启动 Docker（Windows 上为 Docker Desktop + WSL2 后端）。

**构建上下文必须是 `aiqa` 目录**，否则 `Dockerfile` 与 `.dockerignore` 都不会被读取。

```bash
cd aiqa
docker build -t aiqa:latest .
```

构建完成后运行：

```bash
docker run -d --name aiqa -p 3000:3000 aiqa:latest
```

验证：

```bash
curl http://localhost:3000/api/history
docker logs -f aiqa          # 查看启动日志
```

### 数据持久化（必须）

镜像里的 `data/qa-records.json` 只是初始数据；不挂卷时新增记录只存在于容器可写层，容器删除即丢失。

```bash
docker volume create aiqa-data
docker run -d --name aiqa \
  -p 3000:3000 \
  -v aiqa-data:/app/data \
  aiqa:latest
```

命名卷首次挂载会继承镜像中 `/app/data` 的属主（uid 1000 的 `node`），非 root 进程可直接写入。若改为挂载宿主机目录，需确保该目录对 uid 1000 可写。

### 端口映射到其他宿主端口

```bash
docker run -d --name aiqa -p 8080:3000 -v aiqa-data:/app/data aiqa:latest
# 访问 http://localhost:8080
```

### 常用运维命令

```bash
docker stop aiqa && docker rm aiqa      # 停止并删除
docker logs --tail 100 aiqa             # 最近 100 行日志
docker inspect -f '{{.Config.User}}' aiqa   # 应为 node，确认非 root 运行
docker run --rm --entrypoint node aiqa -e 'console.log(process.version)'
```

### 镜像内容与安全设置

- 只复制 `package.json`、`src/`、`public/`、`data/` 四项；`node_modules`、`.git`、测试与报告文件由 `.dockerignore` 排除。
- 以镜像内置的非 root 用户 `node`（uid/gid 1000）运行。
- 仅声明 `EXPOSE 3000`，实际端口发布由运行时 `-p` 决定。
- 启动命令 `npm start`，即 `node src/server.js`。

> 当前开发机未安装 Docker，无法在本地执行 `docker build`。仓库内的 CI（`.github/workflows/ci.yml` 的 `docker` job）会在 GitHub Actions 的 Ubuntu runner 上完成构建，并在容器内做冒烟测试（含非 root 写 `data/` 的验证）。

---

## 3. 环境变量说明

| 变量 | 默认值 | 作用 | 是否需要手动设置 |
|---|---|---|---|
| `PORT` | `3000` | HTTP 服务监听端口，需与 `-p` 的容器端口一致 | 否，仅改端口时设置 |
| `NODE_ENV` | 镜像内为 `production` | 影响 Node/依赖库的生产分支行为 | 否 |
| `NPM_CONFIG_UPDATE_NOTIFIER` | 镜像内 `false` | 关闭 npm 更新提示，减少日志噪音 | 否 |
| `NPM_CONFIG_FUND` | 镜像内 `false` | 关闭 npm 赞助提示 | 否 |

说明：

- 应用为**离线演示模式**，回答由 `src/routes/ask.js` 中的模板生成，不调用任何外部大模型接口，因此**没有 API Key 一类的密钥需要配置**。
- 运行时注入变量示例：

```bash
docker run -d -p 8080:8080 -e PORT=8080 -v aiqa-data:/app/data aiqa:latest
```

- 如果把 `PORT` 改成非 3000 的值，`-p` 的主机/容器端口都要跟着改，例如 `-p 8080:8080`。

---

## 4. 常见故障排查

### 4.1 端口占用

现象：本地启动报 `EADDRINUSE`，或容器启动报 `port is already allocated` / `Bind for 0.0.0.0:3000 failed`。

```powershell
# Windows：找出占用 3000 的进程
netstat -ano | findstr :3000
# 末尾的数字是 PID，确认后结束
taskkill /PID <PID> /F
```

```bash
# Linux / WSL
lsof -i :3000
kill -9 <PID>
```

容器场景优先换端口，不必杀进程：

```bash
docker run -d --name aiqa -p 8081:3000 -v aiqa-data:/app/data aiqa:latest
```

### 4.2 依赖缺失

| 报错 | 原因 | 处理 |
|---|---|---|
| `Cannot find module './routes/ask'` | 启动目录不对，或文件未复制完整 | 在 `aiqa` 目录执行 `npm start`；确认 `src/` 结构完整 |
| 启动时提示 `Cannot find module 'vitest'` | 试图运行测试但未安装开发依赖 | 应用启动不需要依赖；跑测试先 `npm install` |
| 构建报 `failed to compute cache key: "...": not found` | `COPY` 的源被 `.dockerignore` 排除了 | 确认 `package.json`、`src`、`public`、`data` 不在忽略列表 |
| 构建报 `npm ERR!` | 本 Dockerfile 不执行 npm 安装，出现此错通常说明有人改动了 Dockerfile | 检查是否误加了 `RUN npm ci` / `RUN npm install` |
| `Error: EACCES: permission denied, open '/app/data/qa-records.json'` | 容器内 `node` 用户对 `data/` 无写权限 | 确认 `COPY --chown=node:node data ./data` 未被改动；挂载宿主目录时确保 uid 1000 可写 |

### 4.3 容器无法启动

| 现象 | 原因 | 处理 |
|---|---|---|
| `docker : 无法将"docker"项识别为 cmdlet...` | 未安装 Docker，或安装后未重开终端 | 安装 Docker Desktop 后新开终端；或改用 CI 构建 |
| `Cannot connect to the Docker daemon` | Docker 引擎未启动 | 启动 Docker Desktop，等托盘图标稳定后重试 |
| 容器启动后立即退出 | 启动命令失败 | `docker logs aiqa` 看具体报错；`docker inspect -f '{{.State.ExitCode}}' aiqa` |
| `image operating system "linux" cannot be used` | Docker Desktop 处于 Windows 容器模式 | 托盘菜单切回 Linux containers |
| `pull access denied` / 拉取 `node:24-alpine` 超时 | 网络或镜像源问题 | 配置镜像加速器，或先单独 `docker pull node:24-alpine` |
| 首页 404 但接口正常 | `public/` 未进入镜像 | 确认构建上下文是 `aiqa`，且 `public` 未被 `.dockerignore` 排除 |
| 容器内无法写入记录（接口返回 500） | `data/` 只读或属主错误 | 移除自定义挂载先验证；使用命名卷而非权限不明的宿主目录 |

排查三板斧：

```bash
docker ps -a                                  # 看容器状态与退出码
docker logs aiqa                              # 看应用日志
docker exec -it aiqa sh                       # 进容器确认文件与权限
# 容器内：ls -l /app /app/data
```

### 4.4 数据相关

- **重启容器后记录消失**：没有挂载卷。使用 `-v aiqa-data:/app/data`。
- **`qa-records.json` 内容损坏**：读取时解析失败会按空数组处理，下一次写入会覆盖。需要保留数据时先备份该文件。
- **清空历史记录**：删除 `data/qa-records.json`（应用会自动重建），或写入 `[]`。

---

## 5. 部署验收清单

- [ ] `npm start` 后 <http://localhost:3000> 返回 200
- [ ] `GET /api/history` 返回 `{"ok":true,...}`
- [ ] `POST /api/ask` 提交问题后，新记录出现在 `/api/history` 中
- [ ] `docker inspect -f '{{.Config.User}}' aiqa` 输出 `node`
- [ ] `docker inspect -f '{{json .Config.ExposedPorts}}' aiqa` 只包含 `3000/tcp`
- [ ] 挂载命名卷后 `docker restart aiqa`，历史记录仍在
