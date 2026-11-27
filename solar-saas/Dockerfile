# ภาพสำหรับรันบน host ที่รัน container ได้ (Railway / Fly / VPS)
#
# ทำไมไม่ใช้ serverless: การสร้าง PDF เปิด Chromium จริงแล้วรอกราฟวาดเสร็จ
# ใช้เวลาหลายวินาทีและกินแรมหลายร้อย MB ซึ่งชนเพดานเวลาของ serverless พอดี
# และ PDF ไม่ใช่ของเสริม — การส่งรายงานทางอีเมลสร้างบนตัวนี้ทั้งหมด

# ---------- ติดตั้ง dependency ----------
FROM node:22-bookworm-slim AS deps
WORKDIR /app
# ก๊อปแค่ manifest ก่อน เพื่อให้ layer นี้ถูก cache ไว้ตราบใดที่ dependency ไม่เปลี่ยน
COPY package.json package-lock.json ./
COPY apps/web/package.json apps/web/
COPY packages/solar-engine/package.json packages/solar-engine/
# ข้ามการดาวน์โหลดเบราว์เซอร์ของ playwright (300MB) เพราะเราใช้ chromium ของระบบ
ENV PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1
RUN npm ci

# ---------- build ----------
FROM node:22-bookworm-slim AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# ⚠ ค่า NEXT_PUBLIC_* ถูกฝังลงในโค้ดตอน build ไม่ได้อ่านตอนรัน
# ถ้าไม่ส่งเข้ามาตรงนี้ ลิงก์ในอีเมลกับ LINE จะชี้ไป localhost และหน้าเว็บจะต่อ Supabase ไม่ได้
# เปลี่ยนค่าพวกนี้เมื่อไหร่ = ต้อง build ใหม่
ARG NEXT_PUBLIC_SITE_URL
ARG NEXT_PUBLIC_SUPABASE_URL
ARG NEXT_PUBLIC_SUPABASE_ANON_KEY
ARG NEXT_PUBLIC_TURNSTILE_SITE_KEY
ARG NEXT_PUBLIC_LINE_ADD_FRIEND_URL
ARG NEXT_PUBLIC_PAYEE_BANK
ARG NEXT_PUBLIC_PAYEE_ACCOUNT_NAME
ARG NEXT_PUBLIC_PAYEE_ACCOUNT_NUMBER
ARG NEXT_PUBLIC_PAYEE_PROMPTPAY
ENV NEXT_PUBLIC_SITE_URL=$NEXT_PUBLIC_SITE_URL \
    NEXT_PUBLIC_SUPABASE_URL=$NEXT_PUBLIC_SUPABASE_URL \
    NEXT_PUBLIC_SUPABASE_ANON_KEY=$NEXT_PUBLIC_SUPABASE_ANON_KEY \
    NEXT_PUBLIC_TURNSTILE_SITE_KEY=$NEXT_PUBLIC_TURNSTILE_SITE_KEY \
    NEXT_PUBLIC_LINE_ADD_FRIEND_URL=$NEXT_PUBLIC_LINE_ADD_FRIEND_URL \
    NEXT_PUBLIC_PAYEE_BANK=$NEXT_PUBLIC_PAYEE_BANK \
    NEXT_PUBLIC_PAYEE_ACCOUNT_NAME=$NEXT_PUBLIC_PAYEE_ACCOUNT_NAME \
    NEXT_PUBLIC_PAYEE_ACCOUNT_NUMBER=$NEXT_PUBLIC_PAYEE_ACCOUNT_NUMBER \
    NEXT_PUBLIC_PAYEE_PROMPTPAY=$NEXT_PUBLIC_PAYEE_PROMPTPAY \
    NEXT_TELEMETRY_DISABLED=1
RUN npm run build

# ---------- รันจริง ----------
FROM node:22-bookworm-slim AS runner
WORKDIR /app

# chromium สำหรับสร้าง PDF + ฟอนต์ไทย
# ฟอนต์สำคัญมาก: หน้าเว็บโหลด IBM Plex Sans Thai จาก Google Fonts ถ้าคอนเทนเนอร์
# ออกเน็ตไม่ได้หรือ Google ช้า ภาษาไทยใน PDF จะกลายเป็นกล่องสี่เหลี่ยมถ้าไม่มีฟอนต์สำรอง
RUN apt-get update \
 && apt-get install -y --no-install-recommends \
      chromium fonts-thai-tlwg fonts-liberation ca-certificates \
 && rm -rf /var/lib/apt/lists/*

ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    CHROME_EXECUTABLE_PATH=/usr/bin/chromium

# standalone มี node_modules เท่าที่ใช้จริงมาให้แล้ว ไม่ต้องก๊อปทั้งก้อน
COPY --from=builder --chown=node:node /app/apps/web/.next/standalone ./
COPY --from=builder --chown=node:node /app/apps/web/.next/static ./apps/web/.next/static
COPY --from=builder --chown=node:node /app/apps/web/public ./apps/web/public

# ไม่รันเป็น root — ถ้ามีช่องโหว่จะได้ไม่ได้สิทธิ์เต็มเครื่อง
USER node
EXPOSE 3000

# ⚠ ต้องตั้ง HOSTNAME ตรงนี้ ไม่ใช่ด้วย ENV ข้างบน
#
# Docker ตั้งตัวแปร HOSTNAME ให้เป็นรหัสคอนเทนเนอร์เองอัตโนมัติ (เช่น a1b2c3d4e5f6)
# และค่าที่ runtime ฉีดเข้ามาชนะ ENV ใน Dockerfile เสมอ
# แต่เซิร์ฟเวอร์ standalone ของ Next อ่าน process.env.HOSTNAME มาใช้เป็น "ที่อยู่ที่จะผูก"
# มันเลยพยายามผูกกับชื่อคอนเทนเนอร์แทนที่จะเป็นทุกอินเทอร์เฟซ ผลคือไม่มีใครต่อเข้ามาได้
# อาการ: build ผ่าน คอนเทนเนอร์ขึ้น แต่ healthcheck ได้ service unavailable ทุกครั้ง
#
# ตั้งในบรรทัดคำสั่งจะทับค่าที่ถูกฉีดมาได้
#
# ⚠ PORT ตรงกันข้าม — ต้องใช้ค่าที่แพลตฟอร์มฉีดมา ห้ามบังคับเป็นเลขตายตัว
# Railway ฉีด PORT เข้ามาเอง (เจอมาแล้วคือ 8080) และตัวส่งต่อของโดเมนก็ต่อเข้าที่พอร์ตนั้น
# ถ้าเราไปบังคับเลขอื่น แอปจะฟังคนละพอร์ตกับที่ edge เคาะ ได้ 502 x-railway-fallback
# ทั้งที่ healthcheck ผ่าน (เพราะ healthcheck ตรวจที่พอร์ตที่แพลตฟอร์มรู้ ไม่ใช่ที่โดเมนชี้)
# 3000 เป็นแค่ค่าสำรองตอนรันเองในเครื่องที่ไม่มีใครฉีด PORT มาให้
#
# exec เพื่อให้ node เป็น PID 1 จะได้รับสัญญาณปิดตอน redeploy อย่างถูกต้อง
CMD ["sh", "-c", "export HOSTNAME=:: PORT=${PORT:-3000}; exec node apps/web/server.js"]
