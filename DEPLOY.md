# วิธี Deploy PokePP ขึ้น GitHub Pages (ฟรี)

Repo ถูก init + commit ไว้ให้แล้ว เหลือแค่ push ขึ้น GitHub แล้วเปิด Pages

## ขั้นตอน (ทำครั้งเดียว ~5 นาที)

### 1) สร้าง repo บน GitHub
- เข้า https://github.com/new
- **Repository name**: `pokepp` (หรือชื่ออื่น)
- เลือก **Public** (จำเป็นสำหรับ GitHub Pages ฟรี)
- **อย่า** ติ๊ก "Add README" (เพราะเรามีไฟล์อยู่แล้ว)
- กด **Create repository**

### 2) Push โค้ดขึ้นไป
เปิด **Git Bash** หรือ **PowerShell** ในโฟลเดอร์นี้ แล้วรัน (แทน `YOUR-USERNAME` ด้วยชื่อผู้ใช้ GitHub):
```bash
git remote add origin https://github.com/YOUR-USERNAME/pokepp.git
git branch -M main
git push -u origin main
```
> ถ้าถามรหัสผ่าน ให้ใช้ **Personal Access Token** (GitHub → Settings → Developer settings → Tokens) แทนรหัสผ่าน

### 3) เปิด GitHub Pages
- ไปที่ repo → **Settings** → **Pages**
- **Source**: เลือก `Deploy from a branch`
- **Branch**: เลือก `main` / โฟลเดอร์ `/ (root)` → **Save**
- รอ 1–2 นาที จะได้ลิงก์: **`https://YOUR-USERNAME.github.io/pokepp/`**

## ฝังใน MakeWebEasy
เอาลิงก์ข้างบนไปใส่ใน iframe:
```html
<iframe src="https://YOUR-USERNAME.github.io/pokepp/"
        style="width:100%;max-width:560px;height:820px;border:0;border-radius:16px"
        allow="autoplay"></iframe>
```

## อัปเดตเกมภายหลัง
แก้ไฟล์แล้วรัน:
```bash
git add -A
git commit -m "update"
git push
```
GitHub Pages จะอัปเดตอัตโนมัติใน 1–2 นาที
> ผู้เล่นที่ติดตั้ง PWA อาจต้องรีเฟรชเพื่อโหลดเวอร์ชันใหม่ — แต่ `sw.js` ตั้งเป็น network-first สำหรับไฟล์โค้ด (.html/.js/.css) อยู่แล้ว จึงได้เวอร์ชันล่าสุดเสมอเมื่อออนไลน์โดยไม่ต้องบัมพ์เลข `CACHE` ทุกครั้ง (บัมพ์เฉพาะตอนอยากเคลียร์แคชไฟล์ข้อมูล/ไอคอนเก่าทิ้ง)

## หมายเหตุ
- เซฟผูกกับโดเมน — ผู้เล่นควรใช้ปุ่ม **Export เซฟ** ในเมนู ⚙️ เก็บโค้ดไว้
- ⚠️ ชื่อ/รูป Pokémon เป็นลิขสิทธิ์ Nintendo — เหมาะกับใช้ส่วนตัว/ทดลอง ไม่ใช่เชิงพาณิชย์
