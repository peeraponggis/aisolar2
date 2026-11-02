# Changelog -- Project Plan SPA
# by Lungpee Peerapong - ProInventive

## [1.1.0] -- 2569-11-02
### ปรับปรุงระบบจัดการวันที่ + ลบ Login + URL สั้น + Auto-save
- แก้ข้อมูล Lead หายเมื่อนำเข้า JSON/CSV ที่เคยส่งออก (migrateLeadsToArray)
- วันเริ่มในรายการงานยึดตามวันเริ่มต้นโครงการเสมอ (shiftAllDatesToProjectStart)
- แก้ไขวันเริ่ม/สิ้นสุด/วันทำงาน แต่ละแถวได้ แล้ว cascade วันที่ต่อเนื่องอัตโนมัติ
- Gantt Chart และ S-Curve ปรับตามเมื่อแก้ไขรายการงาน
- Auto-save ลง localStorage ทุกครั้งที่แก้ไข (ไม่มี toast แจ้งเตือน)
- ถอดหน้า Login ออก เข้าใช้งานได้ทันที
- เพิ่ม /plan/ short URL ด้วย iframe

## [1.0.0] -- 2569-10-30
### IP Protection + Version Tracking
- Added copyright headers
- Added PDPA consent modal
- Started VERSION.json tracking
