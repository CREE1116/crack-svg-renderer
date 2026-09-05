const DEFAULT_IMAGE_BASE = "https://YOUR-IMAGE-CDN.example/";

const FONT_FAMILY = '-apple-system, BlinkMacSystemFont, "Apple SD Gothic Neo", "Pretendard", "Malgun Gothic", "Noto Sans KR", sans-serif';

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
      const path = url.pathname.replace(/\/+$/, "") || "/";
      const imageBase = env.IMAGE_BASE || DEFAULT_IMAGE_BASE;

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

    const mime = res.headers.get("content-type") || "image/webp";
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

  // 1) 이미 http:// 또는 https:// 가 붙어있는 경우 그대로 사용
  if (/^https?:\/\//i.test(id)) {
    return id;
  }

  // 2) https:// 떼고 도메인부터 들어온 경우 (예: "i.imgur.com/abc.webp", "cdn.discordapp.com/...")
  //    첫 번째 슬래시 앞부분에 점(.)이 포함되어 있으면 도메인으로 인식하여 https:// 자동 부착
  const clean = id.replace(/^\/+/, "");
  const firstSlash = clean.indexOf("/");
  const hostPart = firstSlash !== -1 ? clean.slice(0, firstSlash) : clean;

  if (hostPart.includes(".") && !hostPart.startsWith(".") && !hostPart.endsWith(".")) {
    return "https://" + clean;
  }

  // 3) 순수 상대 경로/식별자인 경우 (예: "char/lime.webp") -> IMAGE_BASE 와 결합
  if (clean.includes("..") || clean.includes("\\")) {
    throw new Error("Invalid image path");
  }

  return base.replace(/\/+$/, "") + "/" + clean;
}

function q(url, name, fallback = "") {
  return url.searchParams.get(name) ?? fallback;
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

  const name = esc(clampText(q(url, "n", "UNKNOWN"), 18));
  const position = esc(clampText(q(url, "p"), 30));
  const relation = esc(clampText(q(url, "r"), 34));

  return `
<svg
  xmlns="http://www.w3.org/2000/svg"
  xmlns:xlink="http://www.w3.org/1999/xlink"
  viewBox="0 0 1200 540"
  width="1200"
  height="540"
>
  <defs>
    <clipPath id="card-photo">
      <rect x="0" y="0" width="940" height="540" />
    </clipPath>

    <linearGradient id="card-fade" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0%" stop-color="${COLORS.dark}" stop-opacity="0" />
      <stop offset="55%" stop-color="${COLORS.dark}" stop-opacity="0.24" />
      <stop offset="100%" stop-color="${COLORS.dark}" stop-opacity="1" />
    </linearGradient>

    <linearGradient id="card-bottom" x1="0" y1="0" x2="0" y2="1">
      <stop offset="55%" stop-color="#000" stop-opacity="0" />
      <stop offset="100%" stop-color="#000" stop-opacity=".20" />
    </linearGradient>
  </defs>

  <!-- BASE -->
  <rect width="1200" height="540" fill="${COLORS.dark}" />

  <!-- IMAGE -->
  ${imgData ? `
  <image
    href="${imgData}"
    xlink:href="${imgData}"
    x="0"
    y="0"
    width="940"
    height="540"
    preserveAspectRatio="xMidYMid slice"
    clip-path="url(#card-photo)"
  />
  ` : ''}

  <rect x="0" y="0" width="940" height="540" fill="url(#card-bottom)" />

  <!-- FADE TO TEXT -->
  <rect x="590" y="0" width="400" height="540" fill="url(#card-fade)" />

  <!-- SUBTLE VERTICAL DETAIL -->
  <rect x="824" y="116" width="2" height="310" fill="#FFFFFF" opacity=".12" />

  <!-- NAME -->
  <text
    x="865"
    y="190"
    fill="${COLORS.white}"
    font-family="${FONT_FAMILY}"
    font-size="61"
    font-weight="700"
    letter-spacing="-1"
  >${name}</text>

  <!-- POSITION -->
  <text
    x="870"
    y="236"
    fill="${COLORS.muted}"
    font-family="${FONT_FAMILY}"
    font-size="21"
    font-weight="400"
  >${position}</text>

  <!-- RELATION LABEL -->
  <text
    x="870"
    y="332"
    fill="${COLORS.muted2}"
    font-family="${FONT_FAMILY}"
    font-size="12"
    font-weight="700"
    letter-spacing="4"
  >RELATION</text>

  <!-- RELATION -->
  <text
    x="870"
    y="378"
    fill="${COLORS.white}"
    font-family="${FONT_FAMILY}"
    font-size="27"
    font-weight="500"
  >${relation}</text>

  <!-- BOTTOM ACCENT -->
  <rect x="870" y="422" width="42" height="3" fill="${COLORS.white}" opacity=".88" />
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

  return `
<svg
  xmlns="http://www.w3.org/2000/svg"
  xmlns:xlink="http://www.w3.org/1999/xlink"
  viewBox="0 0 1280 720"
  width="1280"
  height="720"
>
  <defs>
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
    filter="url(#news-gray)"
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
  ` : ''}

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
  const focusId = q(url, "f");
  const people = parsePeople(q(url, "p"), imageBase);

  if (!people.length) {
    throw new Error("No people supplied");
  }

  // 병렬로 인물들의 이미지를 Base64 Data URL로 로드
  await Promise.all(
    people.map(async (person) => {
      if (person.img) {
        person.imgData = await fetchImageAsDataUrl(person.img, ctx);
      }
    })
  );

  const focus = people.find(p => p.id === focusId) || people[0];
  const others = people.filter(p => p.id !== focus.id).slice(0, 8);
  const relations = parseRelations(q(url, "r"));
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
>
  <defs>
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

function parsePeople(raw, imageBase) {
  if (!raw) return [];
  return raw
    .split(";")
    .map(row => row.trim())
    .filter(Boolean)
    .slice(0, 9)
    .map(row => {
      const parts = row.split("~");
      const id = clampText(parts[0] || "", 24);
      const name = clampText(parts[1] || id, 16);
      const img = imageUrl(imageBase, parts[2] || "");
      return { id, name, img, imgData: "" };
    })
    .filter(x => x.id);
}

function parseRelations(raw) {
  if (!raw) return [];
  return raw
    .split(";")
    .map(row => row.trim())
    .filter(Boolean)
    .slice(0, 20)
    .map(row => {
      const [from, to, label] = row.split("~");
      return {
        from: from || "",
        to: to || "",
        label: clampText(label || "", 12)
      };
    })
    .filter(x => x.from && x.to);
}

function buildRelationPositions(focus, others) {
  const map = new Map();
  map.set(focus.id, { x: 500, y: 500, size: 154 });

  const slots = [
    [500, 205],
    [735, 280],
    [795, 500],
    [735, 720],
    [500, 790],
    [265, 720],
    [205, 500],
    [265, 280]
  ];

  others.forEach((person, index) => {
    const slot = slots[index];
    map.set(person.id, { x: slot[0], y: slot[1], size: 112 });
  });

  return map;
}

function renderRelationNode(person, pos, focus) {
  if (!pos) return "";

  const size = pos.size;
  const half = size / 2;
  const x = pos.x - half;
  const y = pos.y - half;
  const radius = focus ? 28 : 22;
  const border = focus ? "#17181B" : "#FFFFFF";
  const borderWidth = focus ? 4 : 3;
  const nameSize = focus ? 25 : 19;
  const safeId = safeSvgId(person.id);

  return `
<g>
  <defs>
    <clipPath id="clip-${safeId}">
      <rect x="${x}" y="${y}" width="${size}" height="${size}" rx="${radius}" />
    </clipPath>
  </defs>

  <!-- WHITE CARD -->
  <rect
    x="${x - 6}"
    y="${y - 6}"
    width="${size + 12}"
    height="${size + 12}"
    rx="${radius + 5}"
    fill="#FFFFFF"
    filter="url(#node-shadow)"
  />

  <!-- IMAGE (BASE64) -->
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
  />
  ` : ''}

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
    x="${pos.x - 62}"
    y="${y + size + 18}"
    width="124"
    height="${focus ? 40 : 34}"
    rx="${focus ? 20 : 17}"
    fill="#FFFFFF"
  />

  <text
    x="${pos.x}"
    y="${y + size + (focus ? 46 : 42)}"
    text-anchor="middle"
    fill="#17181B"
    font-family="${FONT_FAMILY}"
    font-size="${nameSize}"
    font-weight="${focus ? 700 : 600}"
  >${esc(person.name)}</text>
</g>
`.trim();
}

function renderRelationEdges(relations, positions) {
  return relations.map((rel) => {
    const a = positions.get(rel.from);
    const b = positions.get(rel.to);
    if (!a || !b) return "";

    const points = shortenLine(a.x, a.y, b.x, b.y, a.size / 2 + 15, b.size / 2 + 15);
    const mx = (points.x1 + points.x2) / 2;
    const my = (points.y1 + points.y2) / 2;
    const visual = relationVisual(rel.label);
    const width = Math.max(60, Math.min(122, rel.label.length * 18 + 30));

    return `
<g>
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

  <rect
    x="${mx - width / 2}"
    y="${my - 17}"
    width="${width}"
    height="34"
    rx="17"
    fill="#F1F0EC"
    stroke="#17181B"
    stroke-width="1"
    stroke-opacity=".10"
  />

  <text
    x="${mx}"
    y="${my + 6}"
    text-anchor="middle"
    fill="#34363B"
    font-family="${FONT_FAMILY}"
    font-size="15"
    font-weight="600"
  >${esc(rel.label)}</text>
</g>
`.trim();
  }).join("\n");
}

function relationVisual(label) {
  label = String(label || "");
  if (label.includes("연인") || label.includes("사랑")) {
    return { stroke: "#B55368", width: 5, opacity: 0.82, dash: "" };
  }
  if (label.includes("적대") || label.includes("원수")) {
    return { stroke: "#3C3D41", width: 5, opacity: 0.88, dash: "10 7" };
  }
  if (label.includes("경계") || label.includes("의심")) {
    return { stroke: "#777A80", width: 3, opacity: 0.72, dash: "5 7" };
  }
  if (label.includes("가족")) {
    return { stroke: "#5A6C65", width: 5, opacity: 0.76, dash: "" };
  }
  return { stroke: "#8E9197", width: 3, opacity: 0.62, dash: "" };
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
