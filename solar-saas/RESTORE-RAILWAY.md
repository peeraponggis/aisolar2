# กู้เว็บกลับมาออนไลน์

**สถานะจริง (25 ต.ค. 2569): Railway trial หมดอายุ → service ถูกพัก ของทุกอย่างยังอยู่ครบ**

project `proinventive-solar` (`517ec74f-c4a4-460d-b3b6-57285b6d7ae5` · workspace `aiSolar0945`)
ยังอยู่ · service `web` (`b542b2d1…`) และ `cron-reminders` ยังอยู่ ทั้งคู่ขึ้น "Service is offline" ·
env vars ยังอยู่บน Railway · **ไม่ต้องสร้าง project ใหม่**

> **ขั้นที่ต้องเป็นคุณทำเอง:** เลือกแผน/ชำระเงิน และวางค่าคีย์ถ้ามีตัวไหนต้องเปลี่ยน
> ขั้นที่เหลือบอกผมได้ ผมรันให้

---

## ทางหลัก — อัปเกรดแผนแล้ว redeploy (เร็วสุด)

### 1 · เลือกแผน

ที่ `railway.com` → แบนเนอร์ **"Trial Ended → Upgrade now"** (หรือ Account → Usage/Billing)
เลือกแผนที่เหมาะกับงานนี้ — บริการนี้ต้องรัน container ตลอดเวลา (สร้าง PDF ด้วย Chromium)
จึงอยู่บน Hobby ขึ้นไป

### 2 · ปลุก service ให้กลับมารัน

หลังแผนใช้งานได้แล้ว ที่ service `web` → **Deploy / Redeploy** (หรือสั่งจาก CLI ตามด้านล่าง)
`cron-reminders` ก็ต้องเปิดเช่นกัน — การ์ดของมันขึ้น "Next in 21 hours" แปลว่าตารางเวลายังอยู่

```bash
railway login --browserless     # เครื่องนี้ callback ที่ localhost มีปัญหา ใช้โหมดนี้
railway link                    # เลือก workspace aiSolar0945 → project proinventive-solar
railway status
railway redeploy --service web
railway logs --service web
```

### 3 · ตรวจว่าโดเมนยังผูกอยู่

Service `web` → Settings → Networking — ถ้า `web-production-359eb.up.railway.app` ยังอยู่
ไม่ต้องทำอะไรต่อ ถ้าหายให้ Generate Domain ใหม่ **แล้วต้องแก้ `NEXT_PUBLIC_SITE_URL` ให้ตรง
แล้ว redeploy อีกรอบ** (เป็นตัวแปร build-time ถูกอบเข้า bundle ตอน build ไม่ใช่อ่านตอนรัน)

### 4 · ตรวจว่าใช้งานได้จริง

```bash
curl https://<โดเมน>/api/health
# ต้องได้ {"ok":true}

curl "https://<โดเมน>/api/health?key=<CRON_SECRET>"
# รายงาน env รายตัว ต้องเป็น "set" ทุกตัว ไม่มี "MISSING"
```

แล้วเปิดเว็บจริง: กรอกฟอร์ม lead → ต้องบันทึกลง Supabase ได้ และได้ PDF ทางอีเมล
(PDF คือด่านที่พังบ่อยสุด เพราะต้องมี Chromium + ฟอนต์ไทยใน container — `Dockerfile` จัดให้แล้ว)

### 5 · ของที่ต้องแก้ค่า ไม่ใช่แค่เปิดกลับ

- **คีย์ Turnstile** — คีย์ที่ใช้อยู่ผูกกับ localhost ฟอร์มบนโดเมนจริงจะโดนปฏิเสธทุกใบ
  (เคยเจอมาแล้ว 30 ส.ค. จนต้องถอด captcha ออกชั่วคราว) ออกใหม่ที่
  `dash.cloudflare.com → Turnstile → Add site` ใส่โดเมนจริง แล้วตั้ง
  `NEXT_PUBLIC_TURNSTILE_SITE_KEY` + `TURNSTILE_SECRET_KEY`
- **Resend** — ยังส่งจาก `onboarding@resend.dev` ซึ่งส่งถึงได้เฉพาะอีเมลเจ้าของบัญชี
  ใช้กับลูกค้าจริงไม่ได้ ต้องยืนยันโดเมนแล้วตั้ง `EMAIL_FROM`
- **LINE webhook** — ถ้าโดเมนเปลี่ยน ต้องตั้งใหม่เป็น `https://<โดเมน>/api/line/webhook`

### 6 · ตั้ง Watch Paths ให้ deploy เฉพาะตอน `solar-saas/` เปลี่ยน

**ตอนนี้ service นี้ rebuild ทุกครั้งที่มีใคร push อะไรก็ตามขึ้น `proinventive/picode`**
ไม่ใช่เฉพาะตอนโฟลเดอร์ `solar-saas/` เปลี่ยน — ดูได้จากประวัติ deployment ของ service `web`
ที่เต็มไปด้วยคอมมิตของ `asc/` ("fix(asc/3d)…", "fix(asc/brief)…") deploy ผ่าน GitHub ทั้งหมด

repo นี้เป็น monorepo ของทั้งบริษัท (`solar-saas` · `asc` · `aiSolar` · `pi-boq-dev` · `webproinventive`)
ฝั่ง ASC push บ่อยกว่ามาก ถ้าไม่ตั้ง watch paths จะได้ผลเสียสามข้อ:

1. เปลืองโควตา build ของแผนที่เพิ่งจ่าย ทั้งที่โค้ดของเว็บไม่ได้เปลี่ยนสักบรรทัด
2. เว็บที่ใช้งานอยู่ถูก restart โดยไม่จำเป็น (deploy ใหม่ = replica ใหม่)
3. **เสี่ยงที่เว็บจะล่มจากคอมมิตที่ไม่เกี่ยวกับมันเลย** — build พังเพราะเรื่องของโฟลเดอร์อื่น
   แล้ว service ค้างอยู่ที่ deployment เก่า หรือแย่กว่านั้นคือ deploy ตัวที่พังทับของเดิม

ตั้งที่ Service `web` → Settings → Source → **Watch Paths**:

```
solar-saas/**
```

ตั้งแล้วทดสอบให้เห็นกับตา: push คอมมิตที่แตะเฉพาะ `asc/` → **ต้องไม่เกิด deployment** ·
push คอมมิตที่แตะ `solar-saas/` → ต้องเกิด deployment

### 7 · ปิดงาน

- ทดสอบว่า `git push` ที่แตะ `solar-saas/` ทำให้เกิด deployment จริง **อย่าเชื่อว่าผูกไว้แล้วต้องทำงาน** —
  รอบที่แล้วตั้ง auto-deploy ไว้ 16 ก.ย. แล้วไม่มีใครทดสอบซ้ำอีกเลย จึงไม่มีใครรู้ว่าเว็บตายไปทั้งเดือน
- แก้ `README.md` หัวข้อ "สถานะ deploy จริง" ให้เป็นออนไลน์ พร้อมโดเมนและวันที่
- ลบกล่องเตือนคร่อมหัวข้อ "ขั้นตอน deploy ประจำวัน"

---

## ทางสำรอง — ถ้าเลือกไม่อัปเกรด Railway

ของใน repo ไม่ได้ผูกกับ Railway มากนัก: `Dockerfile` มาตรฐาน + `railway.json` ที่กำหนด
startCommand กับ healthcheck เท่านั้น ย้ายไป host อื่นที่รัน container ได้ (Fly.io, Render, VPS)
ได้โดยไม่ต้องแก้โค้ด — **ห้ามใช้ serverless** เพราะการสร้าง PDF เปิด Chromium จริง
ใช้เวลาหลายวินาทีและกินแรมหลายร้อย MB ซึ่งชนเพดานของ serverless

ไม่ว่าจะย้ายไปที่ไหน ต้องตั้ง env 15 ตัวนี้ (ค่าอยู่ในไฟล์สำรอง
`C:\Users\Lenovo\Documents\secrets-backup\solar-saas\` — **ห้าม commit**):

| กลุ่ม | ตัวแปร |
|---|---|
| Supabase | `NEXT_PUBLIC_SUPABASE_URL` · `NEXT_PUBLIC_SUPABASE_ANON_KEY` · `SUPABASE_SERVICE_ROLE_KEY` |
| บัญชีรับเงิน | `NEXT_PUBLIC_PAYEE_BANK` · `NEXT_PUBLIC_PAYEE_ACCOUNT_NAME` · `NEXT_PUBLIC_PAYEE_ACCOUNT_NUMBER` · `NEXT_PUBLIC_PAYEE_PROMPTPAY` |
| Turnstile | `NEXT_PUBLIC_TURNSTILE_SITE_KEY` · `TURNSTILE_SECRET_KEY` |
| LINE | `LINE_CHANNEL_SECRET` · `LINE_CHANNEL_ACCESS_TOKEN` · `NEXT_PUBLIC_LINE_ADD_FRIEND_URL` |
| อื่น ๆ | `NEXT_PUBLIC_SITE_URL` · `CRON_SECRET` · `RESEND_API_KEY` |

กลุ่ม `NEXT_PUBLIC_*` เป็น **build-time** ตั้งทีหลังต้อง rebuild ถึงมีผล ·
ยังต้องมีตัวตั้งเวลาข้างนอกยิง `POST /api/cron/subscription-reminders`
พร้อม `Authorization: Bearer <CRON_SECRET>` วันละครั้ง (ตัวแอปไม่มีตัวจับเวลาในตัว)

---

## บทเรียนที่ต้องไม่ลืม

**404 จากหน้า project ของ Railway ไม่ได้แปลว่าถูกลบ** — Railway ตอบ 404 กับทุกคนที่ยังไม่ได้
ล็อกอิน วันที่ 24 ต.ค. เคยสรุปผิดด้วยหลักฐานชิ้นนี้ จนเกือบเขียนคู่มือให้สร้าง project ใหม่ทั้งชุด
ทั้งที่ของเดิมยังอยู่ครบ · จะฟันธงว่าอะไรหายต้องเห็น dashboard ตอนล็อกอินแล้วเท่านั้น
