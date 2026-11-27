import Image from 'next/image';
import Calculator from '@/components/Calculator';
import ThemePicker from '@/components/ThemePicker';
import { CALC_DEFAULTS } from '@/lib/calc-defaults';

export default function HomePage() {
  const cpw = Object.values(CALC_DEFAULTS.costPerWatt).reduce((a, b) => a + b, 0);

  return (
    <div className="wrap">
      <header>
        <div className="brand">
          <Image
            className="mark"
            src="/logo-header.png"
            alt="PROINVENTIVE"
            width={160}
            height={160}
            priority
          />
          <div>
            PROINVENTIVE
            <small>วิเคราะห์ด้วยอัตรา กฟภ. จริง</small>
          </div>
        </div>
        <ThemePicker />
      </header>

      <section className="hero">
        <h1>
          ติดโซลาร์เซลล์<span className="hl">คุ้มไหม?</span> รู้ผลใน 30 วินาที
        </h1>
        <p>กรอกแค่ค่าไฟต่อเดือน — ระบบคำนวณขนาดที่เหมาะสม เงินลงทุน และปีคืนทุนให้ทันที</p>
        <div className="badge-row">
          <span className="badge">✓ อัตราค่าไฟ กฟภ. ครบ 8 ประเภท</span>
          <span className="badge">✓ วิเคราะห์ NPV · IRR · Payback</span>
          <span className="badge">✓ ฟรี ไม่ต้องสมัครสมาชิก</span>
        </div>
      </section>

      <Calculator />

      <p className="disclaimer">
        * ผลลัพธ์เป็นการประมาณการเบื้องต้นจากสมมติฐานมาตรฐาน (PSH {CALC_DEFAULTS.psh} ชม./วัน, PR{' '}
        {CALC_DEFAULTS.pr}, ต้นทุน EPC {cpw} บาท/วัตต์, WACC {CALC_DEFAULTS.wacc * 100}%,
        อายุวิเคราะห์ {CALC_DEFAULTS.years} ปี)
        <br />
        หน่วยใช้ไฟประมาณย้อนกลับจากยอดบิลด้วยอัตรา กฟภ. จริง · รูปทรงผลผลิตรายเดือนเป็นค่าเฉลี่ยระดับภาค
        ไม่ใช่ข้อมูลรายจังหวัด
        <br />
        ตัวเลขจริงขึ้นกับหน้างานและอัตราค่าไฟของท่าน — ใช้เป็นฐานเปรียบเทียบใบเสนอราคา ไม่ใช่ใบเสนอราคา
      </p>
    </div>
  );
}
