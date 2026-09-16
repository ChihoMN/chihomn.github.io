#!/usr/bin/env bash
#
# 把本仓库推送到 GitHub Pages 的站点仓库。
#
#   bash tools/push-to-github.sh                 # 默认推 ChihoMN/chihomn.github.io
#   bash tools/push-to-github.sh <仓库地址>       # 推别的仓库
#
# 为什么要 --force：本地这份历史与远端那份**没有共同祖先**（远端只有旧站的
# 4 个 "Site updated" 提交）。强推之后：
#   · 远端 main 变成这份项目的历史 → 触发 .github/workflows/deploy.yml 部署新站
#   · 旧的 4 个提交不可达 → 里面暴露的作者邮箱随之被 GitHub 回收
#     （按 SHA 直链可能还会残留几天；想彻底无痕就删库重建同名仓库）
#
# 首次推送会要求输入凭据（终端里输入，会存进 macOS 钥匙串）：
#   Username: 你的 GitHub 用户名
#   Password: Personal Access Token（不是账号密码！）
#     GitHub → Settings → Developer settings → Personal access tokens →
#     Fine-grained tokens → 只勾这个仓库、权限 Contents: Read and write
# 或者装 gh CLI（brew install gh && gh auth login），它会自动接管 git 凭据。

set -euo pipefail

REPO="${1:-https://github.com/ChihoMN/chihomn.github.io.git}"
BRANCH="${BRANCH:-main}"

cd "$(dirname "$0")/.."

if git remote get-url site >/dev/null 2>&1; then
  git remote set-url site "$REPO"
else
  git remote add site "$REPO"
fi

echo "仓库:   $(pwd)"
echo "远端:   site → $REPO"
echo "分支:   $BRANCH（当前 $(git rev-parse --short HEAD)）"
echo
echo "即将强推，远端现有历史会被这份历史取代。"
read -r -p "确认请输入 yes: " ok
[ "$ok" = "yes" ] || { echo "已取消，什么都没做。"; exit 1; }

git push --force site "$BRANCH"

echo
echo "✓ 推送完成。接下来："
echo "  1. 仓库 Settings → Pages → Source 选 GitHub Actions（只需一次）"
echo "  2. 打开仓库的 Actions 页面看 Deploy to GitHub Pages 这次运行"
echo "  3. 跑完后站点在 https://chihomn.github.io"
