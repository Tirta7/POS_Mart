import fetch from 'node-fetch';

async function test() {
  const transaction = {
    id: Date.now().toString(),
    type: 'IN',
    date: new Date().toISOString(),
    documentNo: `RCV-${Date.now()}`,
    supplierId: 'sup-1',
    employeeId: 'SYS',
    items: [],
    totalValue: 0
  };

  const res = await fetch('http://localhost:4173/api/saas/stock-transactions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-tenant-id': 'TID-DEMO-123' },
    body: JSON.stringify(transaction)
  });
  
  console.log(res.status);
  const text = await res.text();
  console.log(text);
}

test();
