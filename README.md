<p align="center">
  <img src="public/openblive.svg" width="128" height="128" alt="OpenBLive Studio Logo" />
</p>

<h1 align="center">OpenBLive Studio</h1>

<p align="center">
  <strong>一个基于 Tauri v2 + React 19 构建的轻量、美观的第三方哔哩哔哩（Bilibili）桌面开播助手</strong>
</p>

<p align="center">
  <a href="https://github.com/mozi1924/openblive/stargazers">
    <img src="https://img.shields.io/github/stars/mozi1924/openblive?style=flat-square&logo=github&color=FADFA1" alt="GitHub stars" />
  </a>
  <a href="https://github.com/mozi1924/openblive/network/members">
    <img src="https://img.shields.io/github/forks/mozi1924/openblive?style=flat-square&logo=github&color=C2D9FF" alt="GitHub forks" />
  </a>
  <a href="https://github.com/mozi1924/openblive/issues">
    <img src="https://img.shields.io/github/issues/mozi1924/openblive?style=flat-square&logo=github&color=F87171" alt="GitHub issues" />
  </a>
  <a href="https://github.com/mozi1924/openblive/blob/master/LICENSE">
    <img src="https://img.shields.io/github/license/mozi1924/openblive?style=flat-square&logo=github&color=34D399" alt="GitHub license" />
  </a>
  <a href="https://tauri.app/">
    <img src="https://img.shields.io/badge/Tauri-v2-FFC67D?style=flat-square&logo=tauri" alt="Tauri v2" />
  </a>
</p>

---

## 📖 项目介绍

**OpenBLive Studio** 是一款专为哔哩哔哩（Bilibili）主播打造的第三方桌面端辅助开播工具。项目采用 **Tauri v2** 作为桌面容器，前端基于 **React 19**、**Vite**、**TypeScript** 以及 **Tailwind CSS** 进行开发。

相比于官方繁重的直播姬，OpenBLive Studio 更加专注于**轻量化**、**低资源占用**与**极致的响应速度**。无论您是单屏幕游戏主播需要精简的弹幕助手，还是想要一个干净清爽的开播推流控制器，OpenBLive Studio 都能满足您的需求。

### ✨ 核心特性

- 🔑 **多账号管理**：支持 Bilibili 扫码快速登录，支持多账号保存与一键无缝切换。
- 📡 **开播推流控制**：一键获取推流地址（RTMP Link）与推流码（Stream Key），支持在线开播、关播，以及实时修改直播间标题、修改分区和封面。
- 💬 **轻量级弹幕机**：实时连接 Bilibili 直播间 WebSockets，低延迟接收并清晰呈现弹幕、礼物、大航海、点赞及系统提示。
- ⚙️ **极佳性能与体验**：得益于 Rust 驱动的 Tauri 架构，软件安装包极小，内存占用低，完美融入系统原生体验。
- 🎨 **现代 UI 设计**：经过精心设计的现代化深色模式界面，排版精细，交互顺滑。

---

## 🛠️ 技术栈

本项目基于以下优秀的开源技术栈构建：

- **桌面容器**：[Tauri v2](https://tauri.app/) (Rust) - 提供轻量级的系统原生窗口与安全的后端能力
- **前端框架**：[React 19](https://react.dev/) - 现代化响应式 UI 开发
- **构建工具**：[Vite 7](https://vite.dev/) - 极速的前端热更新与打包体验
- **样式方案**：[Tailwind CSS v4](https://tailwindcss.com/) - 现代化的原子类 CSS 框架
- **开发语言**：[TypeScript](https://www.typescriptlang.org/) & [Rust](https://www.rust-lang.org/)

---

## 🧩 高级调试配置（Endpoint / 签名参数覆盖）

在 `设置` 页新增了「高级调试配置」折叠面板。默认留空即可，程序会使用内置默认值。  
仅在以下场景建议填写：

- 需要通过代理、网关或镜像域名转发 Bilibili API
- 需要临时切换 App 签名参数、弹幕网关、LiveHime 版本参数进行排障

可覆盖项包括：

- `host_www`
- `host_api`
- `host_live_api`
- `host_passport`
- `host_live_web`
- `cookie_domain`
- `danmu_host`
- `app_key`
- `app_sec`
- `http_user_agent`
- `livehime_version_override`
- `livehime_build_override`
- `live_platform`

同时支持通过环境变量注入（优先级低于设置页保存值）：

- `OPENBLIVE_HOST_WWW`
- `OPENBLIVE_HOST_API`
- `OPENBLIVE_HOST_LIVE_API`
- `OPENBLIVE_HOST_PASSPORT`
- `OPENBLIVE_HOST_LIVE_WEB`
- `OPENBLIVE_COOKIE_DOMAIN`
- `OPENBLIVE_DANMU_HOST`
- `OPENBLIVE_DANMU_WSS_PORT`
- `OPENBLIVE_APP_KEY`
- `OPENBLIVE_APP_SEC`
- `OPENBLIVE_HTTP_USER_AGENT`
- `OPENBLIVE_LIVEHIME_VERSION`
- `OPENBLIVE_LIVEHIME_BUILD`
- `OPENBLIVE_LIVE_PLATFORM`

说明：

- Host 支持填写 `host` 或完整 URL（程序会自动归一化为 origin）。
- `cookie_domain` 支持填写 host 或 URL，程序会自动提取域名并规范化。
- `host_live_web` 会同时影响侧边栏“打开直播间”外链。
- `http_user_agent` 提供“生成系统 UA”按钮，会按当前操作系统自动生成 UA 前缀（也可手动修改）。

---

## 🚀 贡献与开发指南

如果您希望在本地运行、修改或打包本项目，请参考以下指南。

### 前提条件

在开始之前，请确保您的开发环境中已安装以下工具：

1. **Node.js** (建议 v18+)
2. **pnpm** (建议 v8+)
3. **Rust 开发环境** (需安装 `rustup`、`cargo` 以及对应操作系统的构建工具，详见 [Tauri 官方安装指南](https://v2.tauri.app/start/prerequisites/))

### 本地开发步骤

1. **克隆仓库**
   ```bash
   git clone https://github.com/mozi1924/openblive.git
   cd openblive
   ```

2. **安装依赖**
   ```bash
   pnpm install
   ```

3. **启动开发环境**
   运行以下命令，Tauri 将自动启动前端 Vite 开发服务器，并在 Rust 后端编译完成后拉起桌面应用窗口：
   ```bash
   pnpm tauri dev
   ```

### 项目构建与打包

本项目包含两套前端与一套 Rust 后端：

- 主前端：根目录 `React + Vite`
- Overlay 前端：`overlay-compat`（Vue2）
- 桌面后端：`src-tauri`（Rust + Tauri）

可按以下顺序进行本地验证：

```bash
pnpm build:desktop      # 构建两套前端产物到 dist/
pnpm build:backend      # 编译 Rust 后端（release）
pnpm package:desktop    # Tauri 打包（会生成平台安装包）
```

打包生成的文件将存放在 `src-tauri/target/release/bundle/` 目录下。

也可以直接使用一键命令：

```bash
pnpm verify:release
```

### GitHub Release 自动构建

仓库内已提供 GitHub Actions 工作流：`.github/workflows/release.yml`，用于在发布时自动构建并上传安装包到 GitHub Release。

- 触发方式 1：推送版本标签（如 `v0.1.1`）
- 触发方式 2：手动触发 `workflow_dispatch`
- 构建平台：`macOS` / `Windows` / `Linux`

---

## 📈 Star History

[![Star History Chart](https://api.star-history.com/svg?repos=mozi1924/openblive&type=Date)](https://star-history.com/#mozi1924/openblive&Date)

---

## 🤝 特别鸣谢

- 感谢 [bilibili-api-collect](https://github.com/socialsisteryi/bilibili-api-collect) 项目，其整理归纳的哔哩哔哩 API 接口文档为本项目的账号登录、开播控制等核心功能的实现提供了不可或缺的帮助与参考。
- 感谢 [ChaceQC/bilibili_live_stream_code](https://github.com/ChaceQC/bilibili_live_stream_code) 项目，为本项目提供了重要的实现思路启发，并在 API 链路对齐方面提供了参考。
- 感谢 [TNXG/bilibili_live_stream](https://github.com/TNXG/bilibili_live_stream) 项目，为本项目提供了关键的功能设计启发，并在 API 链路对齐方面提供了参考。
- 感谢 [Radekyspec/StartLive](https://github.com/Radekyspec/StartLive) 项目，为本项目提供了工程实践启发，并在 API 链路对齐方面提供了参考。
- 感谢 [xfgryujk/blivechat](https://github.com/xfgryujk/blivechat) 项目为本项目的外部弹幕ws服务器和外部overlay前端提供相关api参考和前端代码。

---

## 📄 开源协议

本项目采用 [MIT License](LICENSE) 开源协议。
