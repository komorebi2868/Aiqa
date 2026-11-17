# 单阶段镜像：项目零运行时依赖、无构建步骤，直接用官方 Node 镜像运行
FROM node:24-alpine

# 统一工作目录，后续的相对路径都以此为准
WORKDIR /app

# 运行时标识，让 Node/第三方库走生产分支，并关闭 npm 更新提示
ENV NODE_ENV=production \
    PORT=3000 \
    NPM_CONFIG_UPDATE_NOTIFIER=false \
    NPM_CONFIG_FUND=false

# 只复制运行必需的文件；--chown 让非 root 的 node 用户可直接读取，
# 并为 data 目录提供写入权限（应用会把问答记录写回 data/qa-records.json）
COPY --chown=node:node package.json ./
COPY --chown=node:node src ./src
COPY --chown=node:node public ./public
COPY --chown=node:node data ./data

# node:24-alpine 内置 uid/gid 1000 的 node 用户，切到非 root 运行
USER node

# 仅声明应用监听的 3000 端口（EXPOSE 只是元数据，不实际发布端口）
EXPOSE 3000

# 启动命令：npm start -> node src/server.js
CMD ["npm", "start"]
