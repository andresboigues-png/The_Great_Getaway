// Faithful port of balances.ts simplifyDebts + computeTripBalances split math.
// Source: frontend/static/js/src/pages/settlement/balances.ts
const _ZERO_EPSILON_EUR = 0.5;  // balances.ts:212

function simplifyDebts(balances){
  const creditors=[], debtors=[];
  for (const [person,balance] of Object.entries(balances)){
    if (balance > _ZERO_EPSILON_EUR) creditors.push({person,amount:balance});
    else if (balance < -_ZERO_EPSILON_EUR) debtors.push({person,amount:Math.abs(balance)});
  }
  creditors.sort((a,b)=>b.amount-a.amount);
  debtors.sort((a,b)=>b.amount-a.amount);
  const debts=[]; let i=0,j=0;
  while(i<debtors.length && j<creditors.length){
    const debtor=debtors[i], creditor=creditors[j];
    const pay=Math.min(debtor.amount,creditor.amount);
    debts.push({from:debtor.person,to:creditor.person,amount:pay});
    debtor.amount-=pay; creditor.amount-=pay;
    if (debtor.amount < _ZERO_EPSILON_EUR) i++;
    if (creditor.amount < _ZERO_EPSILON_EUR) j++;
  }
  return debts;
}

// compute trip balances for a synthetic expense list + roster (no settlements)
function computeTripBalances(exps, companionNames){
  const expAttr = new Set();
  for (const e of exps){ if(e.who) expAttr.add(e.who); for (const k of Object.keys(e.splits||{})) expAttr.add(k); }
  const roster = Array.from(new Set([...companionNames, ...expAttr]));
  const bal={}; roster.forEach(p=>bal[p]=0);
  for (const e of exps){
    const amount=e.euroValue||e.value||0;
    if (bal[e.who]!==undefined) bal[e.who]+=amount;
    if (e.splits && Object.keys(e.splits).length>0){
      const totalPct=Object.values(e.splits).reduce((s,p)=>s+Number(p||0),0);
      const denom=totalPct>0?totalPct:100;
      for (const [person,pct] of Object.entries(e.splits)){
        if (bal[person]!==undefined) bal[person]-= amount*(Number(pct)/denom);
      }
    } else {
      const share=amount/Math.max(roster.length,1);
      roster.forEach(p=>{ if(bal[p]!==undefined) bal[p]-=share; });
    }
  }
  return bal;
}

function show(title, bal){
  console.log(`\n## ${title}`);
  console.log('  balances:', Object.fromEntries(Object.entries(bal).map(([k,v])=>[k, +v.toFixed(4)])));
  console.log('  simplifyDebts ->', simplifyDebts(bal).map(d=>`${d.from}->${d.to} €${d.amount.toFixed(4)}`));
  console.log('  sum:', +Object.values(bal).reduce((a,b)=>a+b,0).toFixed(6));
}

// CASE 1: €0.99 coffee split 50/50 — each owes €0.495, BELOW the 0.50 epsilon
show('CASE1 €0.99 split 50/50 (real €0.495 debt)', computeTripBalances(
  [{who:'Alex', euroValue:0.99, splits:{Alex:50,Sara:50}}], ['Alex','Sara']));

// CASE 2: €0.80 split 50/50 -> each owes 0.40 < 0.50
show('CASE2 €0.80 split 50/50', computeTripBalances(
  [{who:'Alex', euroValue:0.80, splits:{Alex:50,Sara:50}}], ['Alex','Sara']));

// CASE 3: classic 3-way uneven indivisible: €10 split 3 ways equally (no splits)
show('CASE3 €10 no-split equal among 3', computeTripBalances(
  [{who:'Alex', euroValue:10, splits:{}}], ['Alex','Sara','Tom']));

// CASE 4: €100 three-way 33/33/34 custom (sums to 100)
show('CASE4 €100 splits 33/33/34', computeTripBalances(
  [{who:'Alex', euroValue:100, splits:{Alex:33,Sara:33,Tom:34}}], ['Alex','Sara','Tom']));

// CASE 5: many tiny debts each below epsilon but summing large
const many=[]; for(let k=0;k<20;k++) many.push({who:'Alex', euroValue:0.80, splits:{Alex:50,Sara:50}});
show('CASE5 20x €0.80 (Sara really owes €8.00)', computeTripBalances(many, ['Alex','Sara']));

// CASE 6: zero amount expense
show('CASE6 €0 expense', computeTripBalances(
  [{who:'Alex', euroValue:0, splits:{Alex:50,Sara:50}}], ['Alex','Sara']));

// CASE 7: a 0.49 residual after a partial settle scenario (creditor 100, debtor 100.49)
show('CASE7 epsilon edge: A +100.00, B -100.49, C +0.49',
  {A:100.00, B:-100.49, C:0.49});
