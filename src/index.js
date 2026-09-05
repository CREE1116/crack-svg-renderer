const DEFAULT_IMAGE_BASE = "https://baal-corp.pages.dev/";

const FONT_FAMILY = "'Pretendard', -apple-system, BlinkMacSystemFont, 'Apple SD Gothic Neo', 'Noto Sans KR', 'Malgun Gothic', sans-serif";
const FONT_SERIF = "'Noto Serif KR', 'Nanum Myeongjo', 'AppleMyungjo', 'KoPubWorldBatang', 'BatangChe', serif";
const FONT_CINZEL = "'Cinzel', 'Playfair Display', 'Didot', 'Georgia', 'Times New Roman', serif";

const COLORS = {
  dark: "#111216",
  dark2: "#17191E",
  white: "#F5F5F2",
  muted: "#92959D",
  muted2: "#686B73",

  blue: "#123C73",
  blue2: "#0D2D57",
  red: "#C92332",

  paper: "#F1EFEA",
  ink: "#171717",
  paperMuted: "#73706A"
};

// ============================================================
// Entry
// ============================================================

export default {
  async fetch(request, env, ctx) {
    try {
      const url = new URL(request.url);
      const path = url.pathname.replace(/\/+$/, "").replace(/\.(svg|webp|png|jpe?g)$/i, "") || "/";
      const rawBase = url.searchParams.get("b") || url.searchParams.get("base") || env.IMAGE_BASE || DEFAULT_IMAGE_BASE;
      const imageBase = resolveBase(rawBase);

      let svg;

      switch (path) {
        case "/c":
        case "/card":
          svg = await renderCard(url, imageBase, ctx);
          break;

        case "/n":
        case "/news":
          svg = await renderNews(url, imageBase, ctx);
          break;

        case "/w":
        case "/wanted":
          svg = await renderWanted(url, imageBase, ctx);
          break;

        case "/g":
        case "/relation":
          svg = await renderRelation(url, imageBase, ctx);
          break;

        case "/":
          return textResponse(
            [
              "Crack AI SVG Renderer Worker",
              "",
              "Endpoints:",
              "  /c  - Character Card (20:9)",
              "  /n  - Breaking News (16:9)",
              "  /w  - Wanted Poster (4:5)",
              "  /g  - Relation Graph (1:1)",
              "",
              "Configured IMAGE_BASE: " + imageBase
            ].join("\n")
          );

        default:
          return textResponse("Not found", 404);
      }

      return new Response(svg, {
        headers: {
          "Content-Type": "image/svg+xml; charset=utf-8",
          "Cache-Control": "public, max-age=86400, s-maxage=604800",
          "Access-Control-Allow-Origin": "*",
          "X-Content-Type-Options": "nosniff"
        }
      });

    } catch (err) {
      return textResponse(
        `Render error: ${err?.message || String(err)}`,
        400
      );
    }
  }
};

// ============================================================
// Image Fetch & Base64 Data-URL Converter (with Edge Caching)
// ============================================================

async function fetchImageAsDataUrl(imgUrl, ctx) {
  if (!imgUrl) return "";

  // 한글 경로 등 인코딩 안전화
  try {
    imgUrl = encodeURI(decodeURI(imgUrl));
  } catch {
    imgUrl = encodeURI(imgUrl);
  }

  // Cloudflare Workers 에지 캐시 확인
  let cache;
  try {
    cache = caches.default;
  } catch {
    cache = null;
  }

  const cacheKey = new Request(imgUrl, { method: "GET" });

  try {
    let res = null;
    if (cache) {
      res = await cache.match(cacheKey);
    }

    if (!res || !res.ok) {
      res = await fetch(imgUrl, {
        headers: { "Accept": "image/webp,image/png,image/jpeg,image/*" }
      });

      if (!res.ok) return "";

      if (cache && ctx && ctx.waitUntil) {
        // 백그라운드 캐시 저장 (1주일 유지)
        const responseToCache = new Response(res.clone().body, res);
        responseToCache.headers.set("Cache-Control", "public, max-age=604800");
        ctx.waitUntil(cache.put(cacheKey, responseToCache));
      }
    }

    const mime = (res.headers.get("content-type") || "").toLowerCase();
    // HTML 페이지(SPA 404 폴백) 등 이미지가 아닌 응답 필터링
    if (!mime.startsWith("image/")) {
      return "";
    }

    const arrayBuffer = await res.arrayBuffer();

    let binary = "";
    const bytes = new Uint8Array(arrayBuffer);
    const len = bytes.byteLength;
    for (let i = 0; i < len; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    const b64 = btoa(binary);

    return `data:${mime};base64,${b64}`;
  } catch {
    return "";
  }
}

// ============================================================
// Helpers
// ============================================================

function textResponse(text, status = 200) {
  return new Response(text, {
    status,
    headers: { "Content-Type": "text/plain; charset=utf-8" }
  });
}

function resolveBase(base = "") {
  base = String(base || "").trim();
  if (!base) return DEFAULT_IMAGE_BASE;
  if (!/^https?:\/\//i.test(base)) {
    base = "https://" + base;
  }
  return base.replace(/\/+$/, "") + "/";
}

function esc(value = "") {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function imageUrl(base, id) {
  id = String(id || "").trim();
  if (!id) return "";

  // XSS 및 태그 주입 방지
  if (id.includes("<") || id.includes(">") || id.includes('"') || id.includes("'")) {
    throw new Error("Invalid characters in image identifier");
  }

  // 확장자가 생략된 경우 자동으로 .webp 부착 (예: "06/s01" -> "06/s01.webp")
  if (!/\.(webp|png|jpe?g|svg|gif)$/i.test(id)) {
    id = id + ".webp";
  }

  // 1) 이미 http:// 또는 https:// 가 붙어있는 경우 그대로 사용
  if (/^https?:\/\//i.test(id)) {
    return id;
  }

  // 2) https:// 떼고 도메인부터 들어온 경우 (예: "baal-corp.pages.dev/06/s01.webp")
  const clean = id.replace(/^\/+/, "");
  const firstSlash = clean.indexOf("/");
  const hostPart = firstSlash !== -1 ? clean.slice(0, firstSlash) : clean;

  if (hostPart.includes(".") && !hostPart.startsWith(".") && !hostPart.endsWith(".")) {
    return "https://" + clean;
  }

  // 3) 순수 상대 경로/식별자인 경우 (예: "06/s01.webp") -> IMAGE_BASE 와 결합
  if (clean.includes("..") || clean.includes("\\")) {
    throw new Error("Invalid image path");
  }

  return base.replace(/\/+$/, "") + "/" + clean;
}

function q(url, name, fallback = "") {
  let val = url.searchParams.get(name) ?? fallback;
  if (name !== "i" && name !== "p") {
    val = String(val).replace(/\.(webp|png|jpe?g|svg)$/i, "").trim();
  }
  return val;
}

function clampText(text, max) {
  text = String(text || "").trim();
  if (text.length <= max) return text;
  return text.slice(0, max - 1) + "…";
}

function splitHeadline(text, maxPerLine = 25) {
  text = String(text || "").trim();
  if (!text) return ["", ""];
  if (text.length <= maxPerLine) return [text, ""];

  let cut = maxPerLine;
  for (let i = maxPerLine; i >= Math.max(8, maxPerLine - 8); i--) {
    if (text[i] === " ") {
      cut = i;
      break;
    }
  }

  return [
    text.slice(0, cut).trim(),
    clampText(text.slice(cut).trim(), maxPerLine + 4)
  ];
}

// ============================================================
// CARD (1200 × 540 = 20:9)
// ============================================================

async function renderCard(url, imageBase, ctx) {
  const rawImg = imageUrl(imageBase, q(url, "i"));
  const imgData = await fetchImageAsDataUrl(rawImg, ctx);

  const name = esc(clampText(q(url, "n", "UNKNOWN"), 16));
  const position = esc(clampText(q(url, "p"), 28));

  // 사용자가 l 또는 label 로 헤더 제목(예: 종족, 이능, SPECIES, ABILITY)을 지정할 수 있음
  const rawLabel = q(url, "l") || q(url, "label") || q(url, "k") || q(url, "title") ||
    (q(url, "a") ? "ABILITY" : (q(url, "s") ? "SPECIES" : "SPECIES / ABILITY"));
  const labelHeader = esc(clampText(rawLabel, 20));

  // 라벨 내용 값 (r, a, s, t 파라미터 모두 호환)
  const labelValue = esc(clampText(q(url, "r") || q(url, "a") || q(url, "s") || q(url, "t") || q(url, "v"), 32));

  // 라벨 헤더 한글 여부에 따른 폰트 분기
  const isKoreanLabel = /[ㄱ-ㅎ|ㅏ-ㅣ|가-힣]/.test(labelHeader);
  const labelFont = isKoreanLabel ? FONT_FAMILY : FONT_CINZEL;

  // 폰트 스타일: 기본적으로 감성적인 명조/세리프와 고딕의 황금 밸런스 적용
  const fontMode = q(url, "font", q(url, "ft", "serif")).toLowerCase();
  const isSans = fontMode === "sans" || fontMode === "gothic";
  const titleFont = isSans ? FONT_FAMILY : FONT_SERIF;

  return `
<svg
  xmlns="http://www.w3.org/2000/svg"
  xmlns:xlink="http://www.w3.org/1999/xlink"
  viewBox="0 0 960 540"
  width="960"
  height="540"
  shape-rendering="geometricPrecision"
  text-rendering="geometricPrecision"
>
  <defs>
    <style>
      @import url('https://fonts.googleapis.com/css2?family=Cinzel:wght@700;900&amp;family=Noto+Serif+KR:wght@600;800;900&amp;family=Playfair+Display:wght@700;900&amp;display=swap');
      text {
        text-rendering: optimizeLegibility;
        -webkit-font-smoothing: antialiased;
      }
      image {
        image-rendering: high-quality;
        image-rendering: smooth;
        image-rendering: optimizeQuality;
      }
    </style>

    <!-- 1:1 SQUARE PHOTO CLIP (540 x 540) -->
    <clipPath id="card-photo">
      <rect x="0" y="0" width="540" height="540" />
    </clipPath>

    <!-- SMOOTH COMPACT BLACK FADE -->
    <linearGradient id="card-fade" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0%" stop-color="${COLORS.dark}" stop-opacity="0" />
      <stop offset="50%" stop-color="${COLORS.dark}" stop-opacity="0.5" />
      <stop offset="100%" stop-color="${COLORS.dark}" stop-opacity="1" />
    </linearGradient>

    <linearGradient id="card-bottom" x1="0" y1="0" x2="0" y2="1">
      <stop offset="70%" stop-color="#000" stop-opacity="0" />
      <stop offset="100%" stop-color="#000" stop-opacity=".4" />
    </linearGradient>
  </defs>

  <!-- BASE DARK BACKGROUND -->
  <rect width="960" height="540" fill="${COLORS.dark}" />

  <!-- 1:1 PHOTO (LEFT) -->
  ${imgData ? `
  <image
    href="${imgData}"
    xlink:href="${imgData}"
    x="0"
    y="0"
    width="540"
    height="540"
    preserveAspectRatio="xMidYMid slice"
    clip-path="url(#card-photo)"
    image-rendering="optimizeQuality"
    style="image-rendering: high-quality; image-rendering: smooth;"
  />
  ` : `
  <!-- DEFAULT SILHOUETTE FOR 1:1 SQUARE -->
  <rect x="0" y="0" width="540" height="540" fill="#181A20" clip-path="url(#card-photo)" />
  <circle cx="270" cy="210" r="95" fill="#282C37" />
  <path d="M 120 540 C 140 370, 400 370, 420 540 Z" fill="#282C37" clip-path="url(#card-photo)" />
  `}

  <!-- BOTTOM SHADOW ON PHOTO -->
  <rect x="0" y="0" width="540" height="540" fill="url(#card-bottom)" clip-path="url(#card-photo)" />

  <!-- RIGHT EDGE FADE OVERLAY -->
  <rect x="360" y="0" width="185" height="540" fill="url(#card-fade)" />

  <!-- VERTICAL ACCENT LINE -->
  <rect x="536" y="95" width="2" height="350" fill="#FFFFFF" opacity=".14" />

  <!-- NAME (ELEGANT TITLE) -->
  <text
    x="570"
    y="182"
    fill="${COLORS.white}"
    font-family="${titleFont}"
    font-size="56"
    font-weight="800"
    letter-spacing="${isSans ? '-1' : '1'}"
  >${name}</text>

  <!-- POSITION -->
  <text
    x="572"
    y="236"
    fill="${COLORS.muted}"
    font-family="${FONT_FAMILY}"
    font-size="20"
    font-weight="400"
    letter-spacing="1"
  >${position}</text>

  <!-- SUBTLE ACCENT LINE -->
  <rect x="572" y="274" width="45" height="2" fill="${COLORS.red}" opacity=".85" />

  <!-- TRAIT / ABILITY / SPECIES LABEL -->
  <text
    x="572"
    y="342"
    fill="${COLORS.muted2}"
    font-family="${labelFont}"
    font-size="${isKoreanLabel ? 14 : 12}"
    font-weight="900"
    letter-spacing="${isKoreanLabel ? 2 : 4}"
  >${labelHeader}</text>

  <!-- TRAIT / ABILITY / SPECIES VALUE -->
  <text
    x="572"
    y="388"
    fill="${COLORS.white}"
    font-family="${titleFont}"
    font-size="25"
    font-weight="600"
    letter-spacing="${isSans ? '0' : '1'}"
  >${labelValue}</text>

  <!-- BOTTOM SUBTLE ACCENT -->
  <rect x="572" y="428" width="32" height="2" fill="#FFFFFF" opacity=".3" />
</svg>
`.trim();
}

// ============================================================
// NEWS (1280 × 720 = 16:9)
// ============================================================

async function renderNews(url, imageBase, ctx) {
  const rawImg = imageUrl(imageBase, q(url, "i"));
  const imgData = await fetchImageAsDataUrl(rawImg, ctx);

  const headline = clampText(q(url, "h"), 60);
  const [head1Raw, head2Raw] = splitHeadline(headline, 27);

  const head1 = esc(head1Raw);
  const head2 = esc(head2Raw);
  const sub = esc(clampText(q(url, "s"), 45));

  const isGray = q(url, "gray") === "1" || q(url, "mono") === "1";

  return `
<svg
  xmlns="http://www.w3.org/2000/svg"
  xmlns:xlink="http://www.w3.org/1999/xlink"
  viewBox="0 0 1280 720"
  width="1280"
  height="720"
>
  <defs>
    ${isGray ? `
    <filter id="news-gray">
      <feColorMatrix
        type="matrix"
        values="
          0.32 0.32 0.32 0 0
          0.32 0.32 0.32 0 0
          0.32 0.32 0.32 0 0
          0    0    0    1 0
        "
      />
    </filter>
    ` : ""}

    <linearGradient id="news-shadow" x1="0" y1="0" x2="0" y2="1">
      <stop offset="45%" stop-color="#000000" stop-opacity="0" />
      <stop offset="100%" stop-color="#000000" stop-opacity=".46" />
    </linearGradient>
  </defs>

  <rect width="1280" height="720" fill="#111" />

  <!-- BACKGROUND IMAGE -->
  ${imgData ? `
  <image
    href="${imgData}"
    xlink:href="${imgData}"
    x="-18"
    y="-10"
    width="1316"
    height="740"
    preserveAspectRatio="xMidYMid slice"
    ${isGray ? 'filter="url(#news-gray)"' : ""}
  />
  ` : ''}

  <!-- FILMIC DARKENING -->
  <rect x="0" y="0" width="1280" height="720" fill="url(#news-shadow)" />

  <!-- LIVE -->
  <rect x="1162" y="28" width="88" height="39" rx="2" fill="${COLORS.red}" />
  <text
    x="1206"
    y="55"
    text-anchor="middle"
    fill="#FFFFFF"
    font-family="${FONT_FAMILY}"
    font-size="17"
    font-weight="700"
    letter-spacing="1.4"
  >LIVE</text>

  <!-- SMALL BREAKING MARK -->
  <text
    x="32"
    y="53"
    fill="#FFFFFF"
    opacity=".88"
    font-family="${FONT_FAMILY}"
    font-size="16"
    font-weight="700"
    letter-spacing="3"
  >BREAKING NEWS</text>

  <!-- LOWER THIRD SHADOW -->
  <rect x="0" y="558" width="1280" height="162" fill="#07101C" opacity=".42" />

  <!-- BLUE LOWER THIRD -->
  <rect x="0" y="572" width="1280" height="148" fill="${COLORS.blue}" />
  <rect x="0" y="572" width="1280" height="5" fill="#FFFFFF" opacity=".10" />

  <!-- BREAKING TAB -->
  <rect x="0" y="572" width="182" height="148" fill="${COLORS.red}" />
  <text
    x="91"
    y="656"
    text-anchor="middle"
    fill="#FFFFFF"
    font-family="${FONT_FAMILY}"
    font-size="39"
    font-weight="800"
  >속보</text>

  <!-- HEADLINE -->
  <text
    x="220"
    y="625"
    fill="#FFFFFF"
    font-family="${FONT_FAMILY}"
    font-size="37"
    font-weight="700"
    letter-spacing="-0.8"
  >
    <tspan x="220" dy="0">${head1}</tspan>
    ${head2 ? `<tspan x="220" dy="46">${head2}</tspan>` : ""}
  </text>

  <!-- SUBLINE -->
  ${sub ? `
  <text
    x="1238"
    y="700"
    text-anchor="end"
    fill="#C9D4E6"
    font-family="${FONT_FAMILY}"
    font-size="14"
  >${sub}</text>
  ` : ""}
</svg>
`.trim();
}

// ============================================================
// WANTED (960 × 1200 = 4:5)
// ============================================================

async function renderWanted(url, imageBase, ctx) {
  const rawImg = imageUrl(imageBase, q(url, "i"));
  const imgData = await fetchImageAsDataUrl(rawImg, ctx);

  const name = esc(clampText(q(url, "n", "UNKNOWN"), 20));
  const offense = esc(clampText(q(url, "o"), 34));
  const threat = esc(clampText(q(url, "d"), 10));
  const reward = esc(clampText(q(url, "w"), 24));

  return `
<svg
  xmlns="http://www.w3.org/2000/svg"
  xmlns:xlink="http://www.w3.org/1999/xlink"
  viewBox="0 0 960 1200"
  width="960"
  height="1200"
>
  <defs>
    <clipPath id="wanted-photo">
      <rect x="64" y="250" width="832" height="468" />
    </clipPath>

    <filter id="wanted-desat">
      <feColorMatrix type="saturate" values=".18" />
    </filter>
  </defs>

  <!-- PAPER -->
  <rect width="960" height="1200" fill="${COLORS.paper}" />

  <!-- TOP META -->
  <text
    x="66"
    y="64"
    fill="${COLORS.paperMuted}"
    font-family="${FONT_FAMILY}"
    font-size="14"
    font-weight="700"
    letter-spacing="4"
  >SPECIAL NOTICE</text>

  <text
    x="894"
    y="64"
    text-anchor="end"
    fill="${COLORS.paperMuted}"
    font-family="${FONT_FAMILY}"
    font-size="13"
    letter-spacing="2"
  >ACTIVE FILE</text>

  <line x1="64" y1="91" x2="896" y2="91" stroke="${COLORS.ink}" stroke-width="2" />

  <!-- WANTED -->
  <text
    x="480"
    y="190"
    text-anchor="middle"
    fill="${COLORS.ink}"
    font-family="${FONT_FAMILY}"
    font-size="86"
    font-weight="900"
    letter-spacing="11"
  >WANTED</text>

  <!-- PHOTO -->
  <rect x="58" y="244" width="844" height="480" fill="#D8D6D0" />

  ${imgData ? `
  <image
    href="${imgData}"
    xlink:href="${imgData}"
    x="64"
    y="250"
    width="832"
    height="468"
    preserveAspectRatio="xMidYMid slice"
    filter="url(#wanted-desat)"
    clip-path="url(#wanted-photo)"
  />
  ` : `
  <circle cx="480" cy="440" r="85" fill="#B0ADA5" clip-path="url(#wanted-photo)" />
  <path d="M 280 720 C 310 560, 650 560, 680 720 Z" fill="#B0ADA5" clip-path="url(#wanted-photo)" />
  <text x="480" y="475" text-anchor="middle" fill="${COLORS.ink}" font-family="${FONT_FAMILY}" font-size="20" font-weight="700" letter-spacing="3" opacity=".5">NO PHOTOGRAPH</text>
  `}

  <!-- NAME -->
  <text
    x="480"
    y="814"
    text-anchor="middle"
    fill="${COLORS.ink}"
    font-family="${FONT_FAMILY}"
    font-size="55"
    font-weight="800"
    letter-spacing="-1"
  >${name}</text>

  <line x1="64" y1="858" x2="896" y2="858" stroke="${COLORS.ink}" stroke-width="1" opacity=".20" />

  <!-- OFFENSE -->
  <text
    x="72"
    y="932"
    fill="${COLORS.paperMuted}"
    font-family="${FONT_FAMILY}"
    font-size="13"
    font-weight="700"
    letter-spacing="3"
  >OFFENSE</text>

  <text
    x="290"
    y="932"
    fill="${COLORS.ink}"
    font-family="${FONT_FAMILY}"
    font-size="23"
    font-weight="500"
  >${offense}</text>

  <!-- THREAT -->
  <text
    x="72"
    y="998"
    fill="${COLORS.paperMuted}"
    font-family="${FONT_FAMILY}"
    font-size="13"
    font-weight="700"
    letter-spacing="3"
  >THREAT</text>

  <text
    x="290"
    y="998"
    fill="${COLORS.ink}"
    font-family="${FONT_FAMILY}"
    font-size="27"
    font-weight="800"
  >${threat}</text>

  <!-- REWARD -->
  <text
    x="72"
    y="1070"
    fill="${COLORS.paperMuted}"
    font-family="${FONT_FAMILY}"
    font-size="13"
    font-weight="700"
    letter-spacing="3"
  >REWARD</text>

  <text
    x="290"
    y="1070"
    fill="${COLORS.red}"
    font-family="${FONT_FAMILY}"
    font-size="33"
    font-weight="900"
  >${reward}</text>

  <!-- BOTTOM -->
  <line x1="64" y1="1122" x2="896" y2="1122" stroke="${COLORS.ink}" stroke-width="2" />
  <text
    x="480"
    y="1160"
    text-anchor="middle"
    fill="${COLORS.paperMuted}"
    font-family="${FONT_FAMILY}"
    font-size="12"
    font-weight="600"
    letter-spacing="4"
  >DO NOT APPROACH WITHOUT AUTHORIZATION</text>
</svg>
`.trim();
}

// ============================================================
// RELATION (1000 × 1000)
// ============================================================

async function renderRelation(url, imageBase, ctx) {
  // 1) 중심 인물(Focus / User) 파싱: u=코드~이름~표정 지원
  const rawUser = url.searchParams.get("u") || url.searchParams.get("user") || url.searchParams.get("focus");
  let userPerson = null;
  if (rawUser) {
    const parts = rawUser.split("~").map(s => s.trim());
    let id = parts[0] || "user";
    if (id === "none") id = "user";
    const name = parts[1] || (id === "user" ? "YOU" : id);
    let rawImg = parts[2] || "";
    const isDefault = !rawImg || /^(none|default|user|null|no)$/i.test(rawImg);
    if (!isDefault && !rawImg.includes("/") && id !== "user" && id !== "none") {
      rawImg = `${id}/${rawImg}`;
    }
    const img = isDefault ? "" : imageUrl(imageBase, rawImg);
    userPerson = { id, name, img, imgData: "" };
  }

  const cleanLabel = (text) => clampText(String(text || "").split("#")[0].trim(), 12);

  // 2) 주변 인물들(People) 파싱: p 파라미터 다중(getAll) 및 세미콜론/쉼표 지원
  const rawPeoples = [
    ...url.searchParams.getAll("p"),
    ...url.searchParams.getAll("people")
  ].flatMap(p => p.split(/[;,]/)).map(s => s.trim()).filter(Boolean);

  const autoRelations = [];
  const people = [];

  for (const row of rawPeoples.slice(0, 9)) {
    const parts = row.split("~").map(s => s.trim());
    const id = clampText(parts[0] || "", 24);
    if (!id) continue;
    const name = clampText(parts[1] || id, 16);
    let rawImg = (parts[2] || "").trim();
    const isDefault = !rawImg || /^(none|default|user|null|no)$/i.test(rawImg);

    // 캐릭터 코드(id)와 표정 코드(rawImg) 자동 조합 (예: 06 + s02 -> 06/s02)
    if (!isDefault && !rawImg.includes("/") && id !== "user" && id !== "none") {
      rawImg = `${id}/${rawImg}`;
    }

    const img = isDefault ? "" : imageUrl(imageBase, rawImg);
    people.push({ id, name, img, imgData: "" });

    // p 파라미터 내의 4번째 필드로 중심과의 관계선 등록 (선당 관계 1개)
    // p=코드~이름~이미지~관계
    const relToCenter = cleanLabel(parts[3]);
    const centerTarget = userPerson ? userPerson.id : "user";

    if (relToCenter) {
      autoRelations.push({ from: id, to: centerTarget, label: relToCenter });
    }
  }

  // 중심 인물 결정: userPerson이 있으면 맨 앞에 두고 focus로 삼음
  let allPeople = [];
  let focus = null;

  if (userPerson) {
    focus = userPerson;
    allPeople = [userPerson, ...people.filter(p => p.id !== userPerson.id)];
  } else {
    const focusId = q(url, "f");
    focus = people.find(p => p.id === focusId) || people[0];
    allPeople = people;
  }

  if (!allPeople.length) {
    throw new Error("No people supplied");
  }

  // 3) 관계선(Relations / Links) 파싱: l=A~B~관계 (선당 관계 1개)
  const rawLinks = [
    ...url.searchParams.getAll("l"),
    ...url.searchParams.getAll("link"),
    ...url.searchParams.getAll("r"),
    ...url.searchParams.getAll("relation")
  ].flatMap(r => r.split(/[;,]/)).map(s => s.trim()).filter(Boolean);

  const manualRelations = [];
  for (const row of rawLinks.slice(0, 25)) {
    const parts = row.split("~").map(s => s.trim());
    let from = parts[0] || "";
    let to = parts[1] || "";
    if ((from === "u" || from === "user") && focus) from = focus.id;
    if ((to === "u" || to === "user") && focus) to = focus.id;

    if (!from || !to) continue;

    // 선당 관계 이름 1개: parts[2]
    const relLabel = cleanLabel(parts[2]);
    if (relLabel) {
      manualRelations.push({ from, to, label: relLabel });
    }
  }

  const relations = [...autoRelations, ...manualRelations];

  // 병렬로 인물들의 이미지를 Base64 Data URL로 로드
  await Promise.all(
    allPeople.map(async (person) => {
      if (person.img) {
        person.imgData = await fetchImageAsDataUrl(person.img, ctx);
      }
    })
  );

  const others = allPeople.filter(p => p.id !== focus.id).slice(0, 8);
  const positions = buildRelationPositions(focus, others);

  const edgesSvg = renderRelationEdges(relations, positions);

  const nodesSvg = [
    renderRelationNode(focus, positions.get(focus.id), true),
    ...others.map(person => renderRelationNode(person, positions.get(person.id), false))
  ].join("\n");

  return `
<svg
  xmlns="http://www.w3.org/2000/svg"
  xmlns:xlink="http://www.w3.org/1999/xlink"
  viewBox="0 0 1000 1000"
  width="1000"
  height="1000"
  shape-rendering="geometricPrecision"
  text-rendering="geometricPrecision"
>
  <defs>
    <style>
      image {
        image-rendering: high-quality;
        image-rendering: smooth;
        image-rendering: optimizeQuality;
      }
    </style>
    <filter id="node-shadow" x="-30%" y="-30%" width="160%" height="160%">
      <feDropShadow dx="0" dy="7" stdDeviation="9" flood-color="#000000" flood-opacity=".24" />
    </filter>
  </defs>

  <!-- BACKGROUND -->
  <rect width="1000" height="1000" fill="#F1F0EC" />

  <!-- TITLE -->
  <text
    x="54"
    y="66"
    fill="#17181B"
    font-family="${FONT_FAMILY}"
    font-size="23"
    font-weight="700"
    letter-spacing="4"
  >RELATION</text>

  <line x1="54" y1="91" x2="946" y2="91" stroke="#17181B" stroke-width="1" opacity=".10" />

  <!-- EDGES FIRST -->
  ${edgesSvg}

  <!-- NODES -->
  ${nodesSvg}
</svg>
`.trim();
}


function buildRelationPositions(focus, others) {
  const map = new Map();
  map.set(focus.id, { x: 500, y: 500, size: 164, isFocus: true });

  const count = others.length;
  const radius = 330;

  others.forEach((person, index) => {
    // 12시 방향부터 시계방향으로 균등 원형 배치
    const angle = -Math.PI / 2 + (index * 2 * Math.PI / count);
    const x = Math.round(500 + radius * Math.cos(angle));
    const y = Math.round(500 + radius * Math.sin(angle));
    map.set(person.id, {
      x,
      y,
      size: 122,
      isFocus: false,
      angle
    });
  });

  return map;
}

function renderRelationNode(person, pos, focus) {
  if (!pos) return "";

  const size = pos.size;
  const half = size / 2;
  const x = pos.x - half;
  const y = pos.y - half;
  const radius = focus ? 32 : 24;
  const border = focus ? "#17181B" : "#FFFFFF";
  const borderWidth = focus ? 4 : 3;
  const nameSize = focus ? 22 : 17;
  const safeId = safeSvgId(person.id);

  // 이름표 너비: 글자 길이에 맞춰 동적 조절
  const nameWidth = Math.max(94, Math.min(136, person.name.length * 16 + 28));

  return `
<g>
  <defs>
    <clipPath id="clip-${safeId}">
      <rect x="${x}" y="${y}" width="${size}" height="${size}" rx="${radius}" />
    </clipPath>
  </defs>

  <!-- WHITE CARD SHADOW -->
  <rect
    x="${x - 4}"
    y="${y - 4}"
    width="${size + 8}"
    height="${size + 8}"
    rx="${radius + 3}"
    fill="#FFFFFF"
    filter="url(#node-shadow)"
  />

  <!-- IMAGE OR DEFAULT USER AVATAR -->
  ${person.imgData ? `
  <image
    href="${person.imgData}"
    xlink:href="${person.imgData}"
    x="${x}"
    y="${y}"
    width="${size}"
    height="${size}"
    preserveAspectRatio="xMidYMid slice"
    clip-path="url(#clip-${safeId})"
    image-rendering="optimizeQuality"
    style="image-rendering: high-quality; image-rendering: smooth;"
  />
  ` : `
  <rect
    x="${x}"
    y="${y}"
    width="${size}"
    height="${size}"
    rx="${radius}"
    fill="${focus ? '#21242C' : '#353842'}"
  />
  <circle
    cx="${pos.x}"
    cy="${pos.y - size * 0.12}"
    r="${size * 0.22}"
    fill="${focus ? '#4F5568' : '#5E6476'}"
  />
  <path
    d="M ${pos.x - size * 0.38} ${pos.y + size * 0.44} C ${pos.x - size * 0.32} ${pos.y + size * 0.08}, ${pos.x + size * 0.32} ${pos.y + size * 0.08}, ${pos.x + size * 0.38} ${pos.y + size * 0.44} Z"
    fill="${focus ? '#4F5568' : '#5E6476'}"
    clip-path="url(#clip-${safeId})"
  />
  `}

  <!-- BORDER -->
  <rect
    x="${x}"
    y="${y}"
    width="${size}"
    height="${size}"
    rx="${radius}"
    fill="none"
    stroke="${border}"
    stroke-width="${borderWidth}"
  />

  <!-- NAME PLATE -->
  <rect
    x="${pos.x - nameWidth / 2}"
    y="${y + size + 10}"
    width="${nameWidth}"
    height="${focus ? 36 : 30}"
    rx="${focus ? 18 : 15}"
    fill="#FFFFFF"
    stroke="#17181B"
    stroke-width="1"
    stroke-opacity=".12"
  />

  <text
    x="${pos.x}"
    y="${y + size + (focus ? 34 : 30)}"
    text-anchor="middle"
    fill="#17181B"
    font-family="${FONT_FAMILY}"
    font-size="${nameSize}"
    font-weight="${focus ? 800 : 700}"
  >${esc(person.name)}</text>
</g>
`.trim();
}

function renderLabelBadge(lx, ly, label, visual) {
  const text = esc(label);
  const width = Math.max(54, Math.min(120, text.length * 15 + 24));
  return `
<g>
  <rect
    x="${lx - width / 2}"
    y="${ly - 14}"
    width="${width}"
    height="28"
    rx="14"
    fill="#FFFFFF"
    stroke="${visual.stroke}"
    stroke-width="1.8"
    stroke-opacity=".6"
  />
  <text
    x="${lx}"
    y="${ly + 5}"
    text-anchor="middle"
    fill="#1A1C23"
    font-family="${FONT_FAMILY}"
    font-size="12.5"
    font-weight="700"
  >${text}</text>
</g>
`.trim();
}

function renderRelationEdges(rawRelations, positions) {
  // 1) 노드 쌍(Pair) 단위로 그룹화 및 중복 정리
  const pairMap = new Map();

  for (const rel of rawRelations) {
    if (!rel.label || !rel.from || !rel.to || rel.from === rel.to) continue;
    const a = positions.get(rel.from);
    const b = positions.get(rel.to);
    if (!a || !b) continue;

    const pairKey = [rel.from, rel.to].sort().join("<->");
    if (!pairMap.has(pairKey)) {
      pairMap.set(pairKey, []);
    }
    const group = pairMap.get(pairKey);
    const existingIdx = group.findIndex(r => r.from === rel.from && r.to === rel.to);
    if (existingIdx !== -1) {
      group[existingIdx] = rel;
    } else {
      group.push(rel);
    }
  }

  const output = [];

  for (const group of pairMap.values()) {
    const rel1 = group[0];
    const rel2 = group[1]; // 양방향 존재 여부

    const a = positions.get(rel1.from);
    const b = positions.get(rel1.to);
    const isCenterInvolved = a.isFocus || b.isFocus;

    if (isCenterInvolved) {
      // [중심-외곽 관계선]: 선 1개, 중앙(54%)에 라벨 1개
      const center = a.isFocus ? a : b;
      const outer = a.isFocus ? b : a;

      const points = shortenLine(center.x, center.y, outer.x, outer.y, center.size / 2 + 8, outer.size / 2 + 10);
      const visual = relationVisual(rel1.label);

      output.push(`
<line
  x1="${points.x1}"
  y1="${points.y1}"
  x2="${points.x2}"
  y2="${points.y2}"
  stroke="${visual.stroke}"
  stroke-width="${visual.width}"
  stroke-linecap="round"
  ${visual.dash ? `stroke-dasharray="${visual.dash}"` : ""}
  opacity="${visual.opacity}"
/>
      `.trim());

      const lx = points.x1 + (points.x2 - points.x1) * 0.54;
      const ly = points.y1 + (points.y2 - points.y1) * 0.54;
      output.push(renderLabelBadge(lx, ly, rel1.label, visual));
    } else {
      // [외곽-외곽 관계선]: 인물 사이를 가로지르며 교차하는 선, 중앙(50%)에 라벨 1개
      const points = shortenLine(a.x, a.y, b.x, b.y, a.size / 2 + 8, b.size / 2 + 8);
      const visual = relationVisual(rel1.label);

      const mx = (points.x1 + points.x2) / 2;
      const my = (points.y1 + points.y2) / 2;
      const dxCenter = mx - 500;
      const dyCenter = my - 500;
      const distCenter = Math.sqrt(dxCenter * dxCenter + dyCenter * dyCenter) || 1;

      // 중심을 통과하는 선은 살짝(25px) 휘고, 인접 노드끼리는 바깥으로(45px) 휨
      const bend = Math.max(20, Math.min(50, 220 - distCenter * 0.45));
      const cx = mx + (dxCenter / distCenter) * bend;
      const cy = my + (dyCenter / distCenter) * bend;

      output.push(`
<path
  d="M ${points.x1} ${points.y1} Q ${cx} ${cy}, ${points.x2} ${points.y2}"
  fill="none"
  stroke="${visual.stroke}"
  stroke-width="${visual.width}"
  stroke-linecap="round"
  ${visual.dash ? `stroke-dasharray="${visual.dash}"` : ""}
  opacity="${visual.opacity}"
/>
      `.trim());

      // 곡선 중앙 50% 지점에 라벨 1개
      const lx = 0.25 * points.x1 + 0.5 * cx + 0.25 * points.x2;
      const ly = 0.25 * points.y1 + 0.5 * cy + 0.25 * points.y2;
      output.push(renderLabelBadge(lx, ly, rel1.label, visual));
    }
  }

  return output.join("\n");
}

function relationVisual(label) {
  label = String(label || "").toLowerCase();

  // 1) 핑크: 연인, 사랑, 호감, 애정
  if (label.includes("연인") || label.includes("사랑") || label.includes("호감") || label.includes("애정") || label.includes("pink")) {
    return { stroke: "#E05275", width: 4.5, opacity: 0.88, dash: "" };
  }

  // 2) 블루: 동료, 협력, 조력, 우정, 신뢰
  if (label.includes("동료") || label.includes("협력") || label.includes("조력") || label.includes("우정") || label.includes("신뢰") || label.includes("blue")) {
    return { stroke: "#2563EB", width: 3.5, opacity: 0.82, dash: "" };
  }

  // 3) 그린: 사수, 가족, 스승, 멘토
  if (label.includes("사수") || label.includes("가족") || label.includes("스승") || label.includes("멘토") || label.includes("green")) {
    return { stroke: "#059669", width: 3.5, opacity: 0.82, dash: "" };
  }

  // 4) 오렌지 점선: 경계, 의심, 경쟁, 갈등, 주의
  if (label.includes("경계") || label.includes("의심") || label.includes("경쟁") || label.includes("갈등") || label.includes("주의") || label.includes("orange")) {
    return { stroke: "#D97706", width: 3.5, opacity: 0.85, dash: "6 5" };
  }

  // 5) 블랙 굵은 점선: 적대, 원수, 배신, 증오, 라이벌
  if (label.includes("적대") || label.includes("원수") || label.includes("배신") || label.includes("증오") || label.includes("라이벌") || label.includes("black")) {
    return { stroke: "#1E1F24", width: 4.5, opacity: 0.95, dash: "9 6" };
  }

  // 6) 기본 그레이 실선: 중립, 계약, 비즈니스 등
  return { stroke: "#94A3B8", width: 2.5, opacity: 0.65, dash: "" };
}

function shortenLine(x1, y1, x2, y2, startGap, endGap) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len = Math.sqrt(dx * dx + dy * dy) || 1;
  const ux = dx / len;
  const uy = dy / len;

  return {
    x1: x1 + ux * startGap,
    y1: y1 + uy * startGap,
    x2: x2 - ux * endGap,
    y2: y2 - uy * endGap
  };
}

function safeSvgId(value) {
  return String(value || "x").replace(/[^a-zA-Z0-9_-]/g, "_");
}
