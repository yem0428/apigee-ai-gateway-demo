import test from 'node:test';
import assert from 'node:assert/strict';

// Test suite for Developer List Sorting & Attribution Table Column Sorting logic

const SAMPLE_ATTRIBUTIONS = [
  {
    userEmail: 'diana.evans@example.com',
    name: 'Diana Evans',
    tier: 'Enterprise AI Tier',
    badge: 'Prepaid Wallet',
    billingType: 'PREPAID',
    totalConsumedUsd: 0.00,
    totalCalls: 1,
    totalTokens: 116,
    currentBalanceUsd: 20.00,
  },
  {
    userEmail: 'charlie.davis@example.com',
    name: 'Charlie Davis',
    tier: 'Standard AI Tier',
    badge: 'Prepaid Wallet',
    billingType: 'PREPAID',
    totalConsumedUsd: 0.00,
    totalCalls: 0,
    totalTokens: 0,
    currentBalanceUsd: 20.00,
  },
  {
    userEmail: 'alice.smith@example.com',
    name: 'Alice Smith',
    tier: 'Enterprise AI Tier',
    badge: 'Prepaid Wallet',
    billingType: 'PREPAID',
    totalConsumedUsd: 0.00,
    totalCalls: 1,
    totalTokens: 279,
    currentBalanceUsd: 19.55,
  },
  {
    userEmail: 'zoe.wilson@example.com',
    name: 'Zoe Wilson',
    tier: 'Enterprise AI Tier',
    badge: 'Prepaid Wallet',
    billingType: 'PREPAID',
    totalConsumedUsd: 0.26,
    totalCalls: 28,
    totalTokens: 38400,
    currentBalanceUsd: 118.95,
  },
  {
    userEmail: 'postpaid.corp@company.com',
    name: 'Corporate Postpaid User',
    tier: 'Standard AI Tier',
    badge: 'Postpaid Plan',
    billingType: 'POSTPAID',
    totalConsumedUsd: 15.50,
    totalCalls: 120,
    totalTokens: 500000,
    currentBalanceUsd: 0.00,
  },
];

function sortDeveloperList(devs) {
  return [...devs].sort((a, b) => {
    const nameA = (a.name || a.email).toLowerCase();
    const nameB = (b.name || b.email).toLowerCase();
    const cmp = nameA.localeCompare(nameB);
    return cmp !== 0 ? cmp : a.email.localeCompare(b.email);
  });
}

function sortAttributionTable(rows, column, direction) {
  return [...rows].sort((a, b) => {
    let cmp = 0;
    switch (column) {
      case 'name': {
        const nameA = (a.name || a.userEmail).toLowerCase();
        const nameB = (b.name || b.userEmail).toLowerCase();
        cmp = nameA.localeCompare(nameB);
        if (cmp === 0) cmp = a.userEmail.localeCompare(b.userEmail);
        break;
      }
      case 'tier': {
        const tierA = (a.badge || a.tier || '').toLowerCase();
        const tierB = (b.badge || b.tier || '').toLowerCase();
        cmp = tierA.localeCompare(tierB);
        if (cmp === 0) {
          cmp = (a.name || a.userEmail).toLowerCase().localeCompare((b.name || b.userEmail).toLowerCase());
        }
        break;
      }
      case 'billing': {
        cmp = (a.billingType || '').localeCompare(b.billingType || '');
        if (cmp === 0) {
          cmp = (a.name || a.userEmail).toLowerCase().localeCompare((b.name || b.userEmail).toLowerCase());
        }
        break;
      }
      case 'consumed': {
        const valA = Number(a.totalConsumedUsd) || 0;
        const valB = Number(b.totalConsumedUsd) || 0;
        cmp = valA - valB;
        if (cmp === 0) cmp = (a.totalTokens || 0) - (b.totalTokens || 0);
        if (cmp === 0) {
          cmp = (a.name || a.userEmail).toLowerCase().localeCompare((b.name || b.userEmail).toLowerCase());
        }
        break;
      }
      case 'balance': {
        const balA = Number(a.currentBalanceUsd) || 0;
        const balB = Number(b.currentBalanceUsd) || 0;
        cmp = balA - balB;
        if (cmp === 0) {
          cmp = (a.name || a.userEmail).toLowerCase().localeCompare((b.name || b.userEmail).toLowerCase());
        }
        break;
      }
      case 'quota': {
        const totalAllocA = (a.totalConsumedUsd || 0) + (a.currentBalanceUsd || 0);
        const pctA = totalAllocA > 0 ? (a.totalConsumedUsd || 0) / totalAllocA : 0;
        const totalAllocB = (b.totalConsumedUsd || 0) + (b.currentBalanceUsd || 0);
        const pctB = totalAllocB > 0 ? (b.totalConsumedUsd || 0) / totalAllocB : 0;
        cmp = pctA - pctB;
        if (cmp === 0) cmp = (Number(a.totalConsumedUsd) || 0) - (Number(b.totalConsumedUsd) || 0);
        if (cmp === 0) {
          cmp = (a.name || a.userEmail).toLowerCase().localeCompare((b.name || b.userEmail).toLowerCase());
        }
        break;
      }
      default:
        cmp = 0;
    }
    return direction === 'asc' ? cmp : -cmp;
  });
}

test('Developer list sorts alphabetically by developer name', () => {
  const devs = SAMPLE_ATTRIBUTIONS.map((a) => ({
    email: a.userEmail,
    name: a.name,
    badge: a.badge,
  }));
  const sorted = sortDeveloperList(devs);

  assert.equal(sorted[0].name, 'Alice Smith');
  assert.equal(sorted[1].name, 'Corporate Postpaid User');
  assert.equal(sorted[2].name, 'Charlie Davis');
  assert.equal(sorted[3].name, 'Diana Evans');
  assert.equal(sorted[4].name, 'Zoe Wilson');
});

test('Table sorts by User & Persona (name)', () => {
  const asc = sortAttributionTable(SAMPLE_ATTRIBUTIONS, 'name', 'asc');
  assert.equal(asc[0].name, 'Alice Smith');
  assert.equal(asc[asc.length - 1].name, 'Zoe Wilson');

  const desc = sortAttributionTable(SAMPLE_ATTRIBUTIONS, 'name', 'desc');
  assert.equal(desc[0].name, 'Zoe Wilson');
  assert.equal(desc[desc.length - 1].name, 'Alice Smith');
});

test('Table sorts by Total Consumed (numerical spend)', () => {
  const desc = sortAttributionTable(SAMPLE_ATTRIBUTIONS, 'consumed', 'desc');
  // Highest spend is Corporate Postpaid User ($15.50), then Zoe Wilson ($0.26)
  assert.equal(desc[0].name, 'Corporate Postpaid User');
  assert.equal(desc[1].name, 'Zoe Wilson');

  const asc = sortAttributionTable(SAMPLE_ATTRIBUTIONS, 'consumed', 'asc');
  assert.equal(asc[asc.length - 1].name, 'Corporate Postpaid User');
});

test('Table sorts by Active Balance', () => {
  const desc = sortAttributionTable(SAMPLE_ATTRIBUTIONS, 'balance', 'desc');
  // Highest balance is Zoe Wilson ($118.95)
  assert.equal(desc[0].name, 'Zoe Wilson');

  const asc = sortAttributionTable(SAMPLE_ATTRIBUTIONS, 'balance', 'asc');
  // Lowest balance is Corporate Postpaid User ($0.00)
  assert.equal(asc[0].name, 'Corporate Postpaid User');
});

test('Table sorts by Billing Mode', () => {
  const asc = sortAttributionTable(SAMPLE_ATTRIBUTIONS, 'billing', 'asc');
  assert.equal(asc[0].billingType, 'POSTPAID');

  const desc = sortAttributionTable(SAMPLE_ATTRIBUTIONS, 'billing', 'desc');
  assert.equal(desc[0].billingType, 'PREPAID');
});
