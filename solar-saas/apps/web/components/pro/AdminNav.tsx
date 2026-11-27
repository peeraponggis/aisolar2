import Link from 'next/link';

/** สลับระหว่างงานของแอดมิน — ตรวจ lead กับตรวจการชำระเงิน */
export default function AdminNav({
  active,
  pendingLeads,
  pendingPayments,
}: {
  active: 'leads' | 'payments';
  pendingLeads: number;
  pendingPayments: number;
}) {
  return (
    <nav className="admin-nav">
      <Link href="/pro/admin/leads" aria-current={active === 'leads' ? 'page' : undefined}>
        ตรวจ Lead
        {pendingLeads > 0 && <span className="pending-dot">{pendingLeads}</span>}
      </Link>
      <Link href="/pro/admin" aria-current={active === 'payments' ? 'page' : undefined}>
        ตรวจการชำระเงิน
        {pendingPayments > 0 && <span className="pending-dot">{pendingPayments}</span>}
      </Link>
    </nav>
  );
}
