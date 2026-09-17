// 此文件由配置 GUI 生成（tools/config-gui）—— 请用 `pnpm config-gui` 修改，勿手工编辑
// cannot use path alias here because unocss can not resolve it
import { defineConfig } from "./toolkit/themeConfig";

export default defineConfig({
  "siteName": "云烟成雨",
  "brand": {
    "title": "云烟成雨",
    "subtitle": "年轻就像防御塔的镀层，而你的人生早晚都会来到14分钟的路口。你是要因为二级的那波失误而自责不已，惦记着B三狼徘徊不前；还是要放手一搏，掀开若子的大手，逃出德州的肖申克？"
  },
  "sidebar": {
    "author": "Edward Chen",
    "description": "技术博客/生活分享",
    "social": {
      "github": {
        "url": "https://github.com/ChihoMN",
        "icon": "i-ri-github-fill"
      }
    }
  },
  "footer": {
    "since": 2022,
    "icon": {
      "color": "#ffc0cb"
    },
    "icp": {
      "enable": false,
      "icpnumber": "暂时不需要",
      "icpurl": "暂时不需要"
    }
  },
  "tagCloud": {
    "startColor": "#72cecf",
    "endColor": "#ffbac3"
  },
  "home": {
    "pageSize": 10,
    "selectedCategories": [
      {
        "name": "Tutorial"
      },
      {
        "name": "Frontend"
      },
      {
        "name": "Agent"
      },
      {
        "name": "投资"
      }
    ]
  },
  "cover": {
    "fixedCover": {
      "enable": false
    },
    "coverUrls": [
      "/images/cover/你哲哥.jpg",
      "/images/cover/扫会长.jpg",
      "/images/cover/木头.jpg",
      "/images/cover/祥子联动.jpg",
      "/images/cover/秧秧玄翎-摄影.jpg",
      "/images/cover/秧秧玄翎-摄影2.jpg",
      "/images/cover/秧秧玄翎-摄影3.jpg",
      "/images/cover/穗穗-横.jpg"
    ],
    "advancedCarousel": true
  },
  "friends": {
    "description": "想交换友链的话，把站点信息发到我的邮箱即可。地址在「关于」页。",
    "links": [
      {
        "title": "云烟成雨",
        "url": "https://chihomn.github.io/",
        "author": "Edward Chen",
        "avatar": "/images/avatar.jpg",
        "desc": "生存太久，瘫痪的是时间。",
        "color": "#66CCFF"
      },
      {
        "title": "cout>>.<",
        "url": "https://xhsioi.github.io/",
        "author": "xhsioi",
        "avatar": "https://xhsioi.github.io/medias/logo.png",
        "desc": "大连理工大学、软件工程、创中",
        "color": "#131824"
      },
      {
        "title": "For1moc",
        "url": "https://for1moc.xlog.app/",
        "author": "For1moc",
        "avatar": "https://forimoc.github.io/forimoc.jpg",
        "desc": "签到型CTFer",
        "color": "#131824"
      }
    ]
  }
});
