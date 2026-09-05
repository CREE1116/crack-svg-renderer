# Crack AI SVG Renderer (Cloudflare Worker)

크랙 AI가 생성한 단축 마크다운 URL을 받아 고화질 SVG 그래픽을 실시간 생성하는 Cloudflare Worker 프로젝트입니다.

---

## 🚀 빠른 시작

### 1. 설정 (`wrangler.jsonc`)
`wrangler.jsonc` 파일에서 실제 캐릭터 이미지가 호스팅되는 CDN 주소를 지정합니다:

```jsonc
{
  "name": "crack-svg-renderer",
  "main": "src/index.js",
  "compatibility_date": "2026-09-01",
  "compatibility_flags": ["nodejs_compat"],
  "vars": {
    "IMAGE_BASE": "https://YOUR-REAL-IMAGE-CDN.example/"
  }
}
```

### 2. 로컬 테스트 실행
```bash
cd C:\Users\Administrator\.gemini\antigravity\scratch\crack-svg-worker
npx wrangler dev
```
실행 후 브라우저에서 `http://localhost:8787` 접속

### 3. 클라우드플레어 배포
```bash
npx wrangler deploy
```
배포 완료 시 할당받은 주소(예: `https://crack-svg-renderer.<your-subdomain>.workers.dev`)를 사용하시면 됩니다.

---

## 📌 엔드포인트 규격

| 경로 | 명칭 | 해상도 (비율) | 주요 파라미터 |
|---|---|---|---|
| `/c` | 캐릭터 명함 | 1200×540 (20:9) | `i`(이미지), `n`(이름), `p`(직책), `r`(관계) |
| `/n` | 속보 뉴스 | 1280×720 (16:9) | `i`(이미지), `h`(헤드라인), `s`(부제목) |
| `/w` | 현상수배 | 960×1200 (4:5) | `i`(이미지), `n`(이름), `o`(혐의), `d`(위험도), `w`(현상금) |
| `/g` | 관계도 | 1000×1000 (1:1) | `f`(중심 인물 ID), `p`(인물 목록), `r`(관계선) |

---

## 💡 호출 예시 (마크다운)

### 1. 명함 (`/c`)
```markdown
![라임](https://crack-svg-renderer.leejongmin774.workers.dev/c?i=char/lime.webp&n=라임&p=상품기획팀+선임&r=이종민의+사수+·+연인)
```

### 2. 뉴스 (`/n`)
```markdown
![뉴스](https://crack-svg-renderer.leejongmin774.workers.dev/n?i=scene/limecry.webp&h=라임+선임,+회의+도중+결국+오열&s=사측+'업무와+무관')
```

### 3. 현상수배 (`/w`)
```markdown
![수배](https://crack-svg-renderer.leejongmin774.workers.dev/w?i=char/lilith.webp&n=릴리스&o=기밀문서+탈취&d=S&w=5,000만+G)
```

### 4. 관계도 (`/g`)
```markdown
![관계도](https://crack-svg-renderer.leejongmin774.workers.dev/g?f=jm&p=jm~이종민~char/jm.webp;lime~라임~char/lime.webp;mona~모나~char/mona.webp&r=jm~lime~연인;jm~mona~동료)
```

---

## 🛡️ 브라우저 보안 사양 대응 완료 (SVG-as-image)
- 마크다운 `![...](URL)`로 로드될 때 브라우저가 외부 이미지 네트워크 요청을 차단하는 표준 보안 제한을 해결하기 위해, Worker가 서버 사이드에서 원본 이미지를 fetch하여 **Base64 Data URL로 인라인 임베딩**합니다.
- `caches.default`를 통해 1주일간 에지 캐싱되므로 초고속으로 렌더링됩니다.
