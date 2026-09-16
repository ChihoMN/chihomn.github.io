// 此文件由配置 GUI 生成（tools/config-gui）—— 请用 `pnpm config-gui` 修改，勿手工编辑
import { defineConfig } from "@hyacine/plugin-core";
import visits from "./tools/hyacine-plugin-visits";
import siteUptime from "@hyacine/plugin-site-uptime";
import mouseFirework from "@hyacine/plugin-mouse-firework";
import articleAgeWarning from "@hyacine/plugin-article-age-warning";
import vercount from "@hyacine/plugin-vercount";
import analytics from "@hyacine/plugin-analytics";
import walineComments from "@hyacine/plugin-waline-comments";
import aiContent from "@hyacine/plugin-ai-content";
import visibilityTitle from "@hyacine/plugin-visibility-title";
import nyxPlayer from "@hyacine/plugin-nyx-player";
import articleStatistics from "@hyacine/plugin-article-statistics";

export default defineConfig({
  injectPoints: {
    "footer-status": {
      selector: "#footer .status",
      position: "append",
    },
    "post-header": {
      selector: "article.post header",
      position: "after",
    },
    "post-footer": {
      selector: "article.post .body",
      position: "after",
    },
  },
  plugins: [
    siteUptime({
      siteCreatedAt: "2022-03-11T12:00:00+08:00",
      prefixText: "本站已运行",
    }),
    mouseFirework({
      count: 16,
      radius: 80,
    }),
    articleAgeWarning({
      maxAgeDays: 180,
    }),
    vercount(),
    visits(),
    analytics({
      googleAnalytics: {
        measurementId: "",
      },
      umami: {
        websiteId: "0c6e42de-6c98-4259-b82d-99096d2c1772",
        scriptUrl: "",
        domains: "chihomn.github.io",
      },
    }),
    walineComments({
      serverURL: "https://waline-chihomn.vercel.app",
      lang: "zh-CN",
    }),
    aiContent({
      enable: false,
    }),
    visibilityTitle({
      enable: true,
      leaveTitle: "👀 你先忙，我等你回来~",
      returnTitle: "🎉 欢迎回来！",
      restoreDelay: 3000,
    }),
    nyxPlayer({
      enable: true,
      urls: [
        {
          "name": "网易云音乐",
          "url": "https://music.163.com/#/playlist?id=9419380942"
        }
      ],
      preset: "shokax",
      darkModeTarget: ":root[data-theme=dark]",
      metingBaseURL: "https://meting.api.zkz098.cn/",
      metingUrlSource: "outer",
    }),
    articleStatistics(),
  ],
});
