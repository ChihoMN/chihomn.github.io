import { definePlugin, type PluginManifest } from "@hyacine/plugin-core";

/**
 * 显示访问量（本地插件，不属于主题作者发布的那批）。
 *
 * 背景：主题作者的 `@hyacine/plugin-vercount` 只注入统计脚本，**没有提供任何显示界面**
 * （全仓库历史上都没有 vercount_value_* 之类的占位元素），所以数字一直在记却看不见。
 * 这里用主题自己的插件插槽补上界面，不改动作者的任何源码：
 *   - `footer-status` 插槽 → 页脚的访客数 / 访问量
 *   - `post-header`  插槽 → 文章标题下方的阅读量
 * 占位元素的 id 遵循 vercount 脚本的约定（vercount_container_* / vercount_value_*）。
 */
export function visits(): PluginManifest {
  return definePlugin({
    name: "local:plugin-visits",
    version: "0.1.0",
    minRenderCapability: "ssr",
    supportedPlatforms: ["astro"],
    entry: [
      {
        name: "visits-site-ssr",
        type: "ssr",
        platform: "astro",
        injectPoint: "footer-status",
        path: new URL("./SiteVisits.astro", import.meta.url).href,
      },
      {
        name: "visits-post-ssr",
        type: "ssr",
        platform: "astro",
        injectPoint: "post-header",
        path: new URL("./PostVisits.astro", import.meta.url).href,
      },
    ],
  });
}

export default visits;
