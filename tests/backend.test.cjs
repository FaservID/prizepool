const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const crypto = require('node:crypto');
const path = require('node:path');
class Sheet {
  constructor(name){this.name=name;this.rows=[];}
  getLastRow(){return this.rows.length;}
  appendRow(row){this.rows.push([...row]);}
  getRange(r,c,n=1,m=1){
    // Whole-column range A:C used only for number formatting.
    if(typeof r==='string')return {setNumberFormat:()=>{}};
    return {
      getValues:()=>Array.from({length:n},(_,i)=>Array.from({length:m},(_,j)=>this.rows[r-1+i]?.[c-1+j]??'')),
      setValues:values=>{for(let i=0;i<n;i++){if(!this.rows[r-1+i])this.rows[r-1+i]=[];for(let j=0;j<m;j++)this.rows[r-1+i][c-1+j]=values[i][j];}},
      setValue:value=>{if(!this.rows[r-1])this.rows[r-1]=[];this.rows[r-1][c-1]=value;},
    };
  }
  setFrozenRows(){}
}
const tabs=new Map();
const ss={getId:()=> 'SHEET_TEST',getSheetByName:n=>tabs.get(n),insertSheet:n=>{let s=new Sheet(n);tabs.set(n,s);return s;},toast:()=>{}};
const props=new Map();
const propsApi={getProperty:k=>props.get(k)||null,setProperty:(k,v)=>props.set(k,v),setProperties:obj=>Object.entries(obj).forEach(([k,v])=>props.set(k,v))};
const ctx=vm.createContext({
  SpreadsheetApp:{getActiveSpreadsheet:()=>ss,openById:id=>{assert.equal(id,'SHEET_TEST');return ss;}},
  PropertiesService:{getScriptProperties:()=>propsApi},
  Utilities:{getUuid:()=>crypto.randomUUID(),computeDigest:(_,v)=>[...crypto.createHash('sha256').update(v).digest()],base64Encode:v=>Buffer.from(v.map(b=>b<0?b+256:b)).toString('base64'),DigestAlgorithm:{SHA_256:'sha256'},Charset:{UTF_8:'utf8'}},
  LockService:{getScriptLock:()=>({waitLock:()=>{},releaseLock:()=>{}})},
  HtmlService:{createHtmlOutput:html=>({html,setXFrameOptionsMode(){return this;}}),XFrameOptionsMode:{ALLOWALL:1}},
  Date,Math,String,Set,Map,JSON,Array,Error,Object,console,
});
vm.runInContext(fs.readFileSync(path.join(__dirname,'../apps-script/Code.gs'),'utf8'),ctx);
function run(js){return vm.runInContext(js,ctx);}
run('setupProject()');
assert.equal(tabs.size,3);
assert.equal(run('getSetting_("STATUS")'),'DRAFT');
// setup is repeatable before generate
run('setupProject()');
props.set('ADMIN_SALT','SALT');
props.set('ADMIN_HASH',run('hashText_("SALT|testing-password-very-long")'));
props.set('ALLOWED_ORIGINS','https://faservid.github.io');
const initial=run('generateTickets_()');
assert.equal(initial.status,'TICKETS_READY');
assert.equal(initial.total,65);
assert.equal(initial.selected,0);
assert.equal(initial.tickets[0].registrationNumber,'001');
assert.equal(initial.tickets[0].checkToken,'2027001');
assert.equal(initial.tickets[51].checkToken,'2027052');
assert.equal(initial.tickets[64].checkToken,'2027065');
assert.equal(new Set(initial.tickets.map(x=>x.token)).size,65);
assert.throws(()=>run('generateTickets_()'),/DRAFT/);
ctx.verifyArgs={checkToken:'2027052',token:initial.tickets[51].token};
assert.throws(()=>run('verifyTicket_(verifyArgs)'),/belum dibuka/);
// Invalid EO entries must not modify saved status.
const valid=initial.tickets.map((t,i)=>({registrationNumber:t.registrationNumber,checkToken:t.checkToken,selected:i<8}));
ctx.invalidCount=valid.map((v,i)=>({...v,selected:i<7}));
assert.throws(()=>run('importResults_(invalidCount)'),/tepat 8 TRUE/);
assert.equal(run('getSetting_("STATUS")'),'TICKETS_READY');
ctx.invalidToken=valid.map(x=>({...x}));ctx.invalidToken[5].checkToken='2027999';
assert.throws(()=>run('importResults_(invalidToken)'),/Token tidak cocok/);
ctx.duplicate=valid.map(x=>({...x}));ctx.duplicate[1].registrationNumber='001';
assert.throws(()=>run('importResults_(duplicate)'),/duplikat/);
ctx.validResults=valid.reverse();
const imported=run('importResults_(validResults)');
assert.equal(imported.status,'LOCKED');
assert.equal(imported.selected,8);
assert.throws(()=>run('importResults_(validResults)'),/satu kali/);
// QR mismatch must not be enough to claim ticket 052.
run("changeStatus_('LOCKED','LIVE')");
ctx.wrongQr={checkToken:'2027052',token:initial.tickets[0].token};
assert.throws(()=>run('verifyTicket_(wrongQr)'),/tidak cocok/);
assert.equal(run('publicInfo_().checked'),0);
const result1=run('verifyTicket_(verifyArgs)');
assert.equal(result1.registrationNumber,'052');
assert.equal(result1.eligible,false);
assert.equal(result1.alreadyChecked,false);
const result2=run('verifyTicket_(verifyArgs)');
assert.equal(result2.eligible,false);
assert.equal(result2.alreadyChecked,true);
assert.equal(run('publicInfo_().checked'),1);
assert.throws(()=>run("assertAdmin_('wrong')"),/salah/);
run("assertAdmin_('testing-password-very-long')");
const request={parameter:{requestId:'secret123',origin:'https://faservid.github.io',payload:JSON.stringify({action:'publicInfo'})}};
ctx.request=request;
const html=run('doPost(request)').html;
assert.ok(html.includes('NBSA_PRIZEPOOL_RESULT'));
assert.ok(!html.includes(initial.tickets[0].token));
ctx.wrongOrigin={parameter:{...request.parameter,origin:'https://attacker.example'}};
assert.ok(!run('doPost(wrongOrigin)').html.includes('NBSA_PRIZEPOOL_RESULT'));
run("changeStatus_('LIVE','CLOSED')");
assert.throws(()=>run('verifyTicket_(verifyArgs)'),/ditutup/);
console.log('PASS backend: setup, 65 QR, 2027+001..065, 0 initial TRUE, validasi EO 8/65, import sekali, LIVE, QR pairing, scan ulang, admin, CLOSED.');
