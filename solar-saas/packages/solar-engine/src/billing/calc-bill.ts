import type { BillInput, BillResult, PeaRates, Tier } from '../types.ts';
import { VOLTAGE_LABEL } from '../rates/pea-rates.ts';

/**
 * คำนวณค่าพลังงานแบบขั้นบันได
 * tiers: [[จำนวนหน่วยในขั้น, อัตรา], ..., [null, อัตราส่วนเกิน]]
 */
export function applyTiers(units: number, tiers: Tier[]): number {
  let cost = 0;
  let rem = units;
  for (const [span, rate] of tiers) {
    if (rem <= 0) break;
    const take = span == null ? rem : Math.min(rem, span);
    cost += take * rate;
    rem -= take;
  }
  return cost;
}

/**
 * คำนวณบิลค่าไฟ กฟภ. — pure function, ผลลัพธ์ต้องตรงกับ calcPEA()
 * ใน asc_e_analysis.html ทุกประเภท (ยืนยันด้วย golden tests)
 */
export function calculateBill(input: BillInput, R: PeaRates): BillResult {
  let units = 0;
  let energyCost = 0;
  let serviceFee = 0;
  let demandCost = 0;
  let rateDescription = '';
  let note: string | undefined;

  switch (input.type) {
    case 1: {
      if (input.mode === 'normal') {
        units = input.units;
        const r = units <= 150 ? R.t1.normal.under150 : R.t1.normal.over150;
        energyCost = applyTiers(units, r.tiers);
        serviceFee = r.s;
        rateDescription = `ประเภท 1.1 บ้านอยู่อาศัย อัตราปกติ (${units <= 150 ? 'ไม่เกิน' : 'เกิน'} 150 หน่วย/เดือน)`;
      } else {
        const r = R.t1.tou[input.voltage] ?? R.t1.tou.low!;
        units = input.peakUnits + input.offPeakUnits;
        energyCost = input.peakUnits * r.p + input.offPeakUnits * r.op;
        serviceFee = r.s;
        rateDescription = `ประเภท 1.2 บ้านอยู่อาศัย TOU (${VOLTAGE_LABEL[input.voltage]}) — Peak ${r.p} / Off-Peak ${r.op} บาท/หน่วย`;
      }
      break;
    }
    case 2: {
      if (input.mode === 'normal') {
        const r = R.t2.normal[input.voltage] ?? R.t2.normal.low!;
        units = input.units;
        energyCost = r.flat !== undefined ? units * r.flat : applyTiers(units, r.tiers!);
        serviceFee = r.s;
        rateDescription =
          `ประเภท 2.1 กิจการขนาดเล็ก อัตราปกติ (${VOLTAGE_LABEL[input.voltage]})` +
          (r.flat !== undefined ? ` — อัตราเดียว ${r.flat} บาท/หน่วย` : ' — อัตราขั้นบันได');
      } else {
        const r = R.t2.tou[input.voltage] ?? R.t2.tou.low!;
        units = input.peakUnits + input.offPeakUnits;
        energyCost = input.peakUnits * r.p + input.offPeakUnits * r.op;
        serviceFee = r.s;
        rateDescription = `ประเภท 2.2 กิจการขนาดเล็ก TOU (${VOLTAGE_LABEL[input.voltage]}) — Peak ${r.p} / Off-Peak ${r.op} บาท/หน่วย`;
      }
      break;
    }
    case 3:
    case 5: {
      if (input.mode === 'normal') {
        const r = (input.type === 3 ? R.t3 : R.t5).normal[input.voltage];
        units = input.units;
        demandCost = input.demandKw * r.d;
        energyCost = units * r.e;
        serviceFee = r.s;
        rateDescription =
          `ประเภท ${input.type === 3 ? '3.1 กิจการขนาดกลาง' : '5.2 กิจการเฉพาะอย่าง (ยังไม่ติด TOU)'}` +
          ` (${VOLTAGE_LABEL[input.voltage]}) — Demand ${r.d} บาท/kW, พลังงาน ${r.e} บาท/หน่วย`;
      } else {
        const r = R.touShared[input.voltage];
        units = input.peakUnits + input.offPeakUnits;
        demandCost = input.demandKw * r.d;
        energyCost = input.peakUnits * r.p + input.offPeakUnits * r.op;
        serviceFee = r.s;
        rateDescription =
          `ประเภท ${input.type}.${input.type === 5 ? '1' : '2'} อัตรา TOU (${VOLTAGE_LABEL[input.voltage]})` +
          ` — Demand ${r.d} บาท/kW, Peak ${r.p} / Off-Peak ${r.op} บาท/หน่วย`;
      }
      break;
    }
    case 4: {
      if (input.mode === 'tod') {
        const r = R.t4.tod[input.voltage];
        units = input.units;
        // ⚠️ กฎ กฟภ.: Demand ช่วง Partial คิดเฉพาะส่วนที่เกินช่วง Peak
        const billablePartial = Math.max(0, input.demandPartialKw - input.demandPeakKw);
        demandCost = input.demandPeakKw * r.dP + billablePartial * r.dPart;
        energyCost = units * r.e;
        serviceFee = r.s;
        note =
          `Peak ${input.demandPeakKw.toLocaleString('th-TH')} kW × ${r.dP} + Partial ส่วนเกิน ` +
          `${billablePartial.toLocaleString('th-TH')} kW × ${r.dPart}` +
          (input.demandPartialKw > 0 && billablePartial === 0
            ? ' (Partial ไม่เกิน Peak จึงไม่คิดค่าความต้องการฯ)'
            : '');
        rateDescription = `ประเภท 4.1 กิจการขนาดใหญ่ อัตรา TOD (${VOLTAGE_LABEL[input.voltage]}) — พลังงาน ${r.e} บาท/หน่วย`;
      } else {
        const r = R.touShared[input.voltage];
        units = input.peakUnits + input.offPeakUnits;
        demandCost = input.demandKw * r.d;
        energyCost = input.peakUnits * r.p + input.offPeakUnits * r.op;
        serviceFee = r.s;
        rateDescription =
          `ประเภท 4.2 กิจการขนาดใหญ่ อัตรา TOU (${VOLTAGE_LABEL[input.voltage]})` +
          ` — Demand ${r.d} บาท/kW, Peak ${r.p} / Off-Peak ${r.op} บาท/หน่วย`;
      }
      break;
    }
    case 6: {
      if (input.mode === 'normal') {
        const r = R.t6.normal[input.voltage];
        units = input.units;
        energyCost = r.flat !== undefined ? units * r.flat : applyTiers(units, r.tiers!);
        serviceFee = r.s;
        rateDescription =
          `ประเภท 6.1 องค์กรที่ไม่แสวงหากำไร อัตราปกติ (${VOLTAGE_LABEL[input.voltage]})` +
          (r.flat !== undefined ? ` — อัตราเดียว ${r.flat} บาท/หน่วย` : ' — อัตราขั้นบันได');
      } else {
        const r = R.touShared[input.voltage];
        units = input.peakUnits + input.offPeakUnits;
        demandCost = input.demandKw * r.d;
        energyCost = input.peakUnits * r.p + input.offPeakUnits * r.op;
        serviceFee = r.s;
        rateDescription =
          `ประเภท 6.2 อัตรา TOU (${VOLTAGE_LABEL[input.voltage]})` +
          ` — Demand ${r.d} บาท/kW, Peak ${r.p} / Off-Peak ${r.op} บาท/หน่วย`;
      }
      break;
    }
    case 7: {
      if (input.mode === 'normal') {
        units = input.units;
        energyCost = applyTiers(units, R.t7.normal.tiers);
        serviceFee = R.t7.normal.s;
        rateDescription = 'ประเภท 7.1 สูบน้ำเพื่อการเกษตร อัตราปกติ (อัตราขั้นบันได)';
      } else {
        const r = R.touShared[input.voltage];
        units = input.peakUnits + input.offPeakUnits;
        demandCost = input.demandKw * r.d;
        energyCost = input.peakUnits * r.p + input.offPeakUnits * r.op;
        serviceFee = R.t7.touService;
        rateDescription =
          `ประเภท 7.2 สูบน้ำเพื่อการเกษตร TOU (${VOLTAGE_LABEL[input.voltage]})` +
          ` — Demand ${r.d} บาท/kW, Peak ${r.p} / Off-Peak ${r.op} บาท/หน่วย`;
      }
      break;
    }
    case 8: {
      units = input.units;
      energyCost = units * R.t8.flat;
      serviceFee = R.t8.s;
      rateDescription = `ประเภท 8 ไฟฟ้าชั่วคราว — อัตราเดียว ${R.t8.flat} บาท/หน่วย (ไม่มีค่าบริการรายเดือน)`;
      break;
    }
  }

  const ftTotal = units * input.ft;
  const totalBeforeVat = demandCost + energyCost + serviceFee + ftTotal;
  const vatAmount = totalBeforeVat * (input.vatPercent / 100);
  const grandTotal = totalBeforeVat + vatAmount;

  return {
    units,
    demandCost,
    energyCost,
    serviceFee,
    ftTotal,
    totalBeforeVat,
    vatAmount,
    grandTotal,
    rateDescription,
    note,
  };
}
