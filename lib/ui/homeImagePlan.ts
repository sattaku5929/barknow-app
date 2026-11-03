// Selected home assets and responsive placement settings from the 2026-11-03 image plan.
export const homeImagePlan = {
  "hero": {
    "src": "/images/wantone/home/wantone-home-hero.png",
    "width": 853,
    "height": 263,
    "alt": "散歩風景",
    "reference": true,
    "desktop": {
      "fit": "contain",
      "x": 50,
      "y": 46
    },
    "mobile": {
      "fit": "contain",
      "x": 50,
      "y": 50
    }
  },
  "care": {
    "src": "/images/wantone/home/wantone-home-care.png",
    "width": 291,
    "height": 264,
    "alt": "愛犬の様子を見る",
    "reference": true,
    "desktop": {
      "fit": "contain",
      "x": 50,
      "y": 50
    },
    "mobile": {
      "fit": "contain",
      "x": 50,
      "y": 50
    }
  },
  "paw": {
    "src": "/images/wantone/home/wantone-home-paw.png",
    "width": 1254,
    "height": 1254,
    "alt": "肉球チェック・ケア",
    "reference": false,
    "desktop": {
      "fit": "contain",
      "x": 50,
      "y": 50
    },
    "mobile": {
      "fit": "cover",
      "x": 50,
      "y": 50
    }
  },
  "brushing": {
    "src": "/images/wantone/home/wantone-home-brushing.png",
    "width": 1254,
    "height": 1254,
    "alt": "ブラッシング",
    "reference": false,
    "desktop": {
      "fit": "contain",
      "x": 50,
      "y": 50
    },
    "mobile": {
      "fit": "cover",
      "x": 50,
      "y": 50
    }
  },
  "teeth": {
    "src": "/images/wantone/home/wantone-home-teeth.png",
    "width": 1254,
    "height": 1254,
    "alt": "歯磨き",
    "reference": false,
    "desktop": {
      "fit": "contain",
      "x": 50,
      "y": 50
    },
    "mobile": {
      "fit": "cover",
      "x": 50,
      "y": 50
    }
  },
  "wipe": {
    "src": "/images/wantone/home/wantone-home-wipe.png",
    "width": 1254,
    "height": 1254,
    "alt": "散歩後に足を拭く",
    "reference": false,
    "desktop": {
      "fit": "contain",
      "x": 50,
      "y": 50
    },
    "mobile": {
      "fit": "cover",
      "x": 50,
      "y": 50
    }
  },
  "quick": {
    "src": "/images/wantone/home/wantone-home-quick.png",
    "width": 115,
    "height": 103,
    "alt": "元気に走る愛犬",
    "reference": true,
    "desktop": {
      "fit": "contain",
      "x": 50,
      "y": 50
    },
    "mobile": {
      "fit": "contain",
      "x": 50,
      "y": 50
    }
  },
  "insight": {
    "src": "/images/wantone/home/wantone-home-insight.png",
    "width": 144,
    "height": 115,
    "alt": "ケアのヒント",
    "reference": true,
    "desktop": {
      "fit": "cover",
      "x": 50,
      "y": 50
    },
    "mobile": {
      "fit": "contain",
      "x": 50,
      "y": 50
    }
  }
} as const;
export type HomeImageSlot = keyof typeof homeImagePlan;
