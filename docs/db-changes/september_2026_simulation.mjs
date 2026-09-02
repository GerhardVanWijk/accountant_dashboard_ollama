/* eslint-disable */
/**
 * September 2026 demo-data — CHRONOLOGICAL WAC simulation + seed/rollback SQL generator.
 * SINGLE SOURCE OF TRUTH.   node docs/db-changes/september_2026_simulation.mjs
 *   --sql   also (re)writes 00NN_september_2026_data.sql, _rollback.sql, _manifest.md
 *
 * Reproduces the EXACT production contracts (verified 2026-09-02 vs live schema +
 * migrations 0031/0032/0033/0035 + invoice/bill/creditNote/supplierReturn/stockAdjustment/
 * stockTake/stockTransfer/customerReceipt/payment/depreciation services). See PART V of
 * docs/SEPTEMBER_2026_DATA_PLAN.md.
 *
 *   WAC receipt : new_wac = round((q0*w0 + qi*ci)/(q0+qi), 4)  [cost_price numeric(14,4)];  q0<=0 -> round(ci,4)
 *   issue/return/transfer/supplier-return/adj/stock-take : value at current WAC (or frozen override)
 *   movement.total_cost = round(|q|*unit_cost, 2)
 *   journal : RAW |q|*unit_cost -> aggregate per account -> ONE round(sum,2) (migr 0035); numeric(14,2)
 *   depreciation : round((cost-residual)/life/12, 2) per asset, NO proration, full month
 *   JE numbers : journal_number_counters.next_value = 4101 -> JE-4101..
 */
import { writeFileSync } from 'node:fs';

const r4 = (n) => Math.round((n + Number.EPSILON) * 1e4) / 1e4;
const r2 = (n) => Math.round((n + Number.EPSILON) * 1e2) / 1e2;
const f2 = (n) => r2(n).toFixed(2);
const S = (a) => a.reduce((s, x) => s + x, 0);
const WRITE_SQL = process.argv.includes('--sql');

const COMPANY = '676c6cda-2e67-4ee3-8aaa-249b2c6bbc01';
const WH_CPT = '692a3d01-9835-4340-b5ab-44fe96067490';
const WH_JHB = '5eed0000-0000-4000-8000-010000000001';
const BANK = '2fb81a17-92b6-4936-9925-456a73a91cd1';
const T_STD = '04ea4780-e508-4e49-9e08-7ffd66fd45f5';
const T_ZERO = 'b250a43b-1a78-4704-b617-9770cd6fb0d0';
const SUP_BOLAND = '5eed0000-0000-4000-8000-020000000001';
const JE_START = 4101;

const ACC = {1000:'897d22f7-4f05-478d-80e2-c2587e13fc36',1100:'ffccddca-0407-4dce-857e-0f9d9390c5dc',1200:'68e7f979-1050-4ac8-992c-86e343d139f6',1210:'2f84adeb-fc8c-4ca2-88db-f7c2b530176d',1500:'a877a3dd-fdbf-417e-a91b-6fe596a68510',1590:'0d23cb36-4baf-4cce-b707-5fac6e7a02a2',2000:'b62d9bcb-2ec7-4113-985e-82a8c6371026',2100:'a2f0f779-61d8-4b0d-9354-deb1b4aeefa4',2110:'8ddb7eb3-faf1-430e-8b01-98ed71c7eb9c',2200:'dff77a81-e418-4613-9dc7-d70c29304357',2210:'8bccaab4-ca26-4827-b0e0-274c3445dade',4010:'c3227054-bc5f-4807-a77d-306a3ff83976',4020:'237c4f7d-fb4b-44ec-b53a-a5d3c3bb7450',4030:'cef522ef-b8a5-4427-8995-57187bb822d3',4040:'1692ddc3-ecde-4775-a72d-3f4cafbb0ec2',4050:'d5629da9-879b-4940-9888-9b402b15da5a',4900:'411cd356-c4d5-44bf-b5e3-a6031cd4f20d',5000:'c1b87c04-5bf2-46c5-a0b4-90113d38e66c',5010:'03151d0e-fcf0-451a-95d1-c58746e53b08',5020:'5f8f2cf3-506c-4fb4-b209-ae05b928abaa',5030:'fbe3c6fa-4285-4fbe-8a5f-6654c4ae9407',5040:'325131ab-7ec9-4a69-a99b-4b7901c5c449',5050:'5844be10-2745-43cd-9095-d0ed8770dfe4',5060:'879e4703-8a4b-45a0-9b80-1a260c1b1acb',5110:'f8c82e74-fc72-4388-946e-2400d272925d',5120:'521d029a-1726-4f80-a9ee-123b09621da6',5130:'291e51ea-e275-45f2-92d6-e2c6ba4fb60a',5140:'b462bcd6-2ac4-4c64-adc0-0c9c8c3b0946',5150:'caa9848d-7fb9-4ab0-932d-5cd905d8e243',5160:'069c8682-325b-4119-ba9e-6488b4947d45',5180:'37d2f948-d572-4abf-bc17-3812b174aa91',5190:'110629eb-3af8-41da-9c54-66c674c6fa3e',5200:'42f71790-0776-4b4b-a42b-9b1c630df390',5210:'29580994-c48c-4f10-8c08-68518b2cb744',5240:'df997f01-4069-4d5c-8ede-4ca3c20979ef',5400:'82404e62-ac81-4b4f-b1c6-e278e59e10f4'};
const REV={Furniture:4010,'Printers & Equipment':4020,Peripherals:4020,Stationery:4030,Consumables:4040};
const COGS={Furniture:5010,'Printers & Equipment':5020,Peripherals:5020,Stationery:5030,Consumables:5040};
const CATID={Furniture:'a8493e3b-778e-4b3a-9de2-54d7b659e167','Printers & Equipment':'450338db-48c4-43fd-9374-ff8720515b19',Peripherals:'c9fb0387-20b0-40cd-94ce-21dc11fccd94',Stationery:'2c6eebe0-ffb8-4451-a39a-c48c132dd12f',Consumables:'a982e1a1-569c-4ea8-9ea2-c5c397c36663'};
const CUST={Riverside:'986e2b94-09a2-4b65-b75b-9f2118301141',Protea:'2c2e92ca-c203-4fe7-83e7-bb155902ce92',Brightline:'a3fa6f9d-22ae-458e-aacc-e6604b41af99',CodeForge:'0c6b391c-bf45-48ce-903d-d6377b32c781',Karoo:'1d6f242d-7aab-41e5-bd35-03a4c564d5ba',Summit:'22063537-4822-4fea-8cae-1e5e951c7510',Ndlovu:'1e8d56eb-59c4-418a-84d6-ea6a37f783e3',Horizon:'031c9632-776c-445e-9153-bced43333e12',SwiftHaul:'1e5e60a2-773a-443d-873f-b6f4e74f98c8',Ubuntu:'04a47ecc-de81-4405-9df2-76b2827d372b',Greenacres:'2411bdf0-0669-4f11-a2fe-a0024b356f32',Maluleke:'13e02593-777b-4224-9e50-e6d9aea24d8e',FreshMart:'c7bc573f-6bc4-4ada-9104-9ccf0c2822c4',Cape:'9da7e0f6-7d08-4524-8a4d-d4bf97f3fdf5',Apex:'a09cfa66-9b76-4510-a557-399d8b4079ac',Prestige:'1b54b0af-bd4e-43c8-83bf-4b180dd3b531'};
const SUP={Alpine:'2da979c6-b72f-4e23-9596-260a5064e0c6',PrintTech:'c791b70d-b132-457a-817e-bdedd992a37a',TonerZone:'65bafbe4-953b-4a24-b374-a75feb429f65',Sappi:'f19106c1-b173-4070-a66f-966dacba9eab',Nationwide:'48d72e32-650e-4982-915f-98cee0986a97',CenturyCity:'e147092a-45e6-4f65-b6e1-cbd427671699',Highveld:'99d58075-964c-4089-81a5-48cfc122cf01',FibreStream:'a1b53033-f0e3-44d8-bab3-6a341402343e',Guardian:'c958c215-72bb-4469-bfef-c78953b8ff43',QuickFuel:'df9f6d74-0f78-4a9a-a262-fb0c764db59d',RapidCourier:'fdec4536-3de3-4157-980b-1e8892f4dd15',Boland:SUP_BOLAND};
const PID={'CON-001':'e49efbd1-74d7-4701-9e7a-b174437cbb8b','CON-002':'f12bc2ad-9c45-43d4-8814-31728b128fb8','CON-003':'da8f92f9-d103-45bc-b928-d66e0804d80b','CON-004':'a5b6f5d0-c453-4ae2-a811-514d6baa9aee','CON-005':'bdccbc71-4f9f-4c15-ba8a-a59884bed33e','CON-006':'b0d10b92-189a-4619-a996-0fd573d0b287','CON-007':'2b995d55-7e7a-464c-b9f3-4ce20da3bb84','FUR-001':'a1a589ac-8eec-4654-9087-c049d61b0d18','FUR-002':'79b5298e-b34d-43aa-a4e8-5104122d9fe2','FUR-003':'f6e4536f-4195-4c48-b043-767fcc002736','FUR-004':'afc54f7d-ebb8-4671-b25f-1ec60ff783bc','FUR-005':'4e31b8e9-360d-4cd2-923c-d0741ef615eb','FUR-006':'fa720588-27f5-4d91-a18d-ad06dbe51bf0','FUR-007':'fd727024-acc8-4384-91c8-4f4cd81c6a61','FUR-008':'7d531616-c44d-47dc-b6f4-7ea20201289a','FUR-009':'e7f99b76-cb1e-4778-b345-424c3324e5a9','FUR-010':'ead417dd-7aee-4eee-a007-8467f400a4d8','FUR-011':'39840274-8210-4af0-a955-5b1f3c15dc94','PER-001':'aba15935-1b14-47e8-9ad9-3d5b92e20121','PER-002':'9279d70d-f8d6-4c14-be52-fa90cee8c9c1','PER-003':'1b6a9926-aab9-4c85-89a4-2586f31749a5','PER-004':'da787ce2-5b7e-4bec-ba42-a68da679a862','PRN-001':'8676826b-040e-4693-a2eb-876c1ce2bf91','PRN-002':'94ab6fc1-b31d-4ef6-96d0-ded6fa3c1718','PRN-003':'37434f57-4afc-48ff-9e5c-434c1dbb93c3','PRN-004':'4231f62b-19c9-4053-b017-7fb8fea40272','PRN-005':'b8cd6190-ffd4-4f73-a0bb-4f535aa48826','PRN-006':'cb6e4124-84a0-4f12-8914-e27674c9e710','PRN-007':'9a3278d3-867e-42c6-8139-340dfdc84da9','PRN-008':'75b7bdcc-4d24-46ef-8cfd-44383b6f902d','PRN-009':'5db609d0-2fe8-469c-bd1e-c7ff00210972','STA-001':'67becdf3-5573-4fb3-8aac-4e6ea68d5d15','STA-002':'d0a2c671-6fb9-48ec-8d0d-1ea1e5b8f5e3','STA-003':'57ea5dcf-52e2-41f1-9d62-f716e0899ebd','STA-004':'4addbc14-2f71-4441-82ed-c7a936ddb603','STA-005':'f833a23d-d874-4504-817b-d091031b743e','STA-006':'dc34774f-b5c7-41e6-9974-a93959d5e585','STA-007':'b71200bd-f712-40ea-8b50-e5708d4992bd','STA-008':'3f7a6670-36df-493d-b39b-c86983e5ad90','STA-009':'3ffee2af-a30a-4ff5-bf6a-63419e309477','STA-010':'cf7378f1-20f3-4076-8fbf-426259c5071b','STA-011':'df345451-4263-4b51-bd19-86554260994d','STA-012':'ee1792f7-78e7-41df-b319-d04cfc8064e4','STA-013':'9d0b89df-e023-4f65-89ee-edee62755652','STA-014':'1d698ca5-1106-49de-ae59-db8c8077e2ec','STA-015':'4f327c22-d1e8-4cf8-a340-4eda1b8a0174','STA-016':'01beac73-4bfc-4973-93ce-13d8f6886eb5','STA-017':'6043e8b9-c964-4edf-b7aa-4ab34cc3011b'};

const OPEN={'CON-001':[165,784.2046],'CON-002':[81,894.1719],'CON-003':[81,895.3400],'CON-004':[100,896.6089],'CON-005':[181,207.7895],'CON-006':[171,276.6000],'CON-007':[47,1141.5510],'FUR-001':[40,1475.0473],'FUR-002':[11,2650.0000],'FUR-003':[52,611.5455],'FUR-004':[8,1163.3412],'FUR-005':[22,1338.4286],'FUR-006':[13,2083.8462],'FUR-007':[22,1544.3636],'FUR-008':[35,890.0000],'FUR-009':[26,782.7857],'FUR-010':[10,1980.0000],'FUR-011':[26,553.9655],'PER-001':[213,119.2458],'PER-002':[243,64.8500],'PER-003':[88,380.0000],'PER-004':[85,420.9333],'PRN-001':[17,1831.5000],'PRN-002':[7,3424.1250],'PRN-003':[5,2931.5625],'PRN-004':[0,8900.0000],'PRN-005':[25,1250.0000],'PRN-006':[18,983.2667],'PRN-007':[163,95.5182],'PRN-008':[39,483.6923],'PRN-009':[11,1669.8000],'STA-001':[720,234.4525],'STA-002':[343,95.0000],'STA-003':[677,28.0811],'STA-004':[498,45.1953],'STA-005':[489,18.0855],'STA-006':[426,32.1745],'STA-007':[461,28.1761],'STA-008':[396,33.7912],'STA-009':[258,54.6812],'STA-010':[904,14.9639],'STA-011':[1052,22.0000],'STA-012':[280,68.0948],'STA-013':[357,78.3042],'STA-014':[326,92.4594],'STA-015':[379,42.2539],'STA-016':[246,110.6680],'STA-017':[352,47.7303]};
const CATOF={}; for(const s of Object.keys(OPEN)) CATOF[s]= s[0]==='C'?'Consumables':s[0]==='F'?'Furniture':s[1]==='E'?'Peripherals':s.slice(0,3)==='PRN'?'Printers & Equipment':'Stationery';
const SKUNAME={'CON-001':'Black Toner Cartridge','CON-002':'Cyan Toner Cartridge','CON-003':'Magenta Toner Cartridge','CON-004':'Yellow Toner Cartridge','CON-005':'Mono Inkjet Cartridge','CON-006':'Colour Inkjet Cartridge','CON-007':'Imaging Drum Unit','FUR-001':'Ergonomic Task Chair','FUR-002':'Executive Leather Chair','FUR-003':'Visitor Cantilever Chair','FUR-004':'Reception Tub Chair','FUR-005':'Straight Office Desk 1500mm','FUR-006':'Corner Workstation Desk','FUR-007':'3-Drawer Steel Filing Cabinet','FUR-009':'4-Tier Bookshelf','FUR-010':'2-Door Office Storage Cupboard','PER-001':'USB Keyboard','PER-002':'USB Optical Mouse','PER-003':'1080p Webcam','PER-004':'Single Monitor Arm','PRN-001':'Mono Laser Printer A4','PRN-002':'Colour Laser Printer A4','PRN-004':'Colour Laser MFP A3','PRN-005':'Cross-Cut Paper Shredder','PRN-006':'A3 Pouch Laminator','PRN-007':'Desktop Calculator 12-Digit','PRN-008':'2-Colour Printing Calculator','STA-001':'A4 Copier Paper (box of 5 reams)','STA-002':'A3 Copier Paper (ream)','STA-003':'A4 Hardcover Notebook','STA-004':'Ballpoint Pens (box of 50)','STA-005':'HB Pencils (box of 12)','STA-009':'Full-Strip Stapler','STA-010':'Staples 26/6 (box of 5000)','STA-011':'Lever-Arch File A4','STA-012':'Manila Folders (box of 100)','STA-013':'DL Envelopes (box of 500)','STA-014':'A4 Envelopes (box of 250)','STA-016':'Printer Labels A4 (box of 100 sheets)'};

// ── state ──
const stock={}; const bal={}; const gl={}; const journals=[]; const movements=[]; const itlog=[];
for(const [s,[q,w]] of Object.entries(OPEN)){ stock[s]={qoh:q,wac:w}; bal[`${s}|${WH_CPT}`]=q; }
const OPEN_VAL=r2(S(Object.entries(OPEN).map(([s,[q,w]])=>q*w)));
let jeN=JE_START;
const addGL=(c,d,cr)=>{ gl[c]=r2((gl[c]||0)+(d||0)-(cr||0)); };
function postJE(date,source,memo,raw){
  const by={}; for(const l of raw){ by[l.code]=by[l.code]||{d:0,c:0}; by[l.code].d+=l.dr||0; by[l.code].c+=l.cr||0; }
  const lines=[]; let sd=0,sc=0;
  for(const code of Object.keys(by).sort((a,b)=>a-b)){
    const d=r2(by[code].d), c=r2(by[code].c); const nd=Math.max(d-c,0), nc=Math.max(c-d,0);
    if(nd===0&&nc===0) continue; lines.push({code:+code,dr:r2(nd),cr:r2(nc)}); addGL(code,r2(nd),r2(nc)); sd+=r2(nd); sc+=r2(nc);
  }
  if(Math.abs(sd-sc)>0.005) throw new Error(`UNBALANCED ${memo}: dr ${f2(sd)} cr ${f2(sc)} [${JSON.stringify(lines)}]`);
  const n=`JE-${jeN++}`; journals.push({n,date,source,memo,lines}); return n;
}
function mv(o){ movements.push(o); return o; }
// costing (post_inventory_transaction)
function recv(sku,wh,qty,ci,date,st,sid,slid){
  const p=stock[sku]; const q0=p.qoh; const mc=r4(ci);
  let nw; if(q0+qty<=0) nw=p.wac; else if(q0<=0) nw=r4(ci); else nw=r4((q0*p.wac+qty*ci)/(q0+qty));
  p.wac=nw; p.qoh=r4(q0+qty); bal[`${sku}|${wh}`]=r4((bal[`${sku}|${wh}`]||0)+qty);
  const raw=Math.abs(qty)*mc; mv({sku,wh,type:'goods_received',qty,unit_cost:mc,total_cost:r2(raw),date,st,sid,slid});
  return {raw,dir:'recv'};
}
function issue(sku,wh,qty,date,mvType,st,sid,slid,over){
  const p=stock[sku]; const mc= over!=null? r4(over): p.wac;
  p.qoh=r4(p.qoh+qty); bal[`${sku}|${wh}`]=r4((bal[`${sku}|${wh}`]||0)+qty);
  const raw=Math.abs(qty)*mc; mv({sku,wh,type:mvType,qty,unit_cost:mc,total_cost:r2(raw),date,st,sid,slid});
  return {raw,dir:'issue',cost:mc};
}
function retIn(sku,wh,qty,date,mvType,st,sid,slid,over){
  const p=stock[sku]; const mc= over!=null? r4(over): p.wac;
  p.qoh=r4(p.qoh+qty); bal[`${sku}|${wh}`]=r4((bal[`${sku}|${wh}`]||0)+qty);
  const raw=Math.abs(qty)*mc; mv({sku,wh,type:mvType,qty,unit_cost:mc,total_cost:r2(raw),date,st,sid,slid});
  return {raw,dir:'recv',cost:mc};
}
function xfer(sku,from,to,qty,date,st,sid,slid){
  const p=stock[sku]; const mc=p.wac;
  bal[`${sku}|${from}`]=r4((bal[`${sku}|${from}`]||0)-qty); bal[`${sku}|${to}`]=r4((bal[`${sku}|${to}`]||0)+qty);
  const raw=qty*mc;
  mv({sku,wh:from,type:'transfer_out',qty:-qty,unit_cost:mc,total_cost:r2(raw),date,st,sid,slid});
  mv({sku,wh:to,type:'transfer_in',qty:qty,unit_cost:mc,total_cost:r2(raw),date,st,sid,slid});
  return raw;
}
function invJE(date,contribs,extra,source,memo){
  const raw=[];
  for(const c of contribs){
    if(c.dir==='issue'){ raw.push({code:c.contra,dr:c.raw}); raw.push({code:c.inv,cr:c.raw}); }
    else { raw.push({code:c.inv,dr:c.raw}); raw.push({code:c.contra,cr:c.raw}); }
  }
  for(const e of extra) raw.push(e);
  return postJE(date,source,memo,raw);
}

// ══════════ TRANSACTION DESIGN ══════════
const D={quotes:[],salesOrders:[],purchaseOrders:[],bills:[],invoices:[],creditNotes:[],receipts:[],payments:[],supplierReturns:[],stockAdjustments:[],stockTakes:[],stockTransfers:[],fixedAssets:[],bankLines:[],depreciation:null,payrollJE:null,trueUpJE:null};

const STOCK_BILLS=[
 {n:'BILL-2029',date:'2026-09-05',sup:'Alpine',po:'PO-2026-0001',cat:'Furniture',due:'2026-10-05',lines:[['FUR-001',20,1500],['FUR-005',10,1400]]},
 {n:'BILL-2030',date:'2026-09-05',sup:'PrintTech',po:'PO-2026-0002',cat:'Printers & Equipment',due:'2026-10-05',lines:[['PRN-002',4,3400],['PRN-004',3,8000]]},
 {n:'BILL-2031',date:'2026-09-08',sup:'TonerZone',po:'PO-2026-0003',cat:'Consumables',due:'2026-10-08',lines:[['CON-001',60,780],['CON-002',20,880]]},
 {n:'BILL-2032',date:'2026-09-08',sup:'Sappi',po:null,cat:'Stationery',due:'2026-10-08',lines:[['STA-001',180,230]]},
 {n:'BILL-2033',date:'2026-09-09',sup:'Nationwide',po:null,cat:'Stationery',due:'2026-10-09',lines:[['STA-011',300,21.50],['STA-004',300,44]]},
 {n:'BILL-2034',date:'2026-09-10',sup:'TonerZone',po:null,cat:'Consumables',due:'2026-10-10',lines:[['CON-005',40,200]]},
];
const EXP_BILLS=[
 {n:'BILL-2035',date:'2026-09-05',sup:'CenturyCity',due:'2026-09-07',acc:5110,ex:19000,vat:2850,desc:'Warehouse & showroom rent — September 2026'},
 {n:'BILL-2036',date:'2026-09-05',sup:'Highveld',due:'2026-09-25',acc:5120,ex:5200,vat:780,desc:'Electricity — August usage'},
 {n:'BILL-2037',date:'2026-09-05',sup:'FibreStream',due:'2026-09-25',acc:5130,ex:1400,vat:210,desc:'Business fibre & VoIP — September'},
 {n:'BILL-2038',date:'2026-09-05',sup:'Guardian',due:'2026-09-25',acc:5150,ex:2100,vat:315,desc:'Business asset & liability cover — September'},
 {n:'BILL-2039',date:'2026-09-06',sup:'QuickFuel',due:'2026-09-20',acc:5160,ex:6800,vat:0,desc:'Fleet fuel cards — August statement (zero-rated)'},
 {n:'BILL-2040',date:'2026-09-08',sup:'RapidCourier',due:'2026-09-22',acc:5160,ex:3900,vat:585,desc:'Outbound courier & deliveries — early September'},
];
const FA_BILL={n:'BILL-2045',date:'2026-09-08',sup:'Boland',due:'2026-10-31',ex:245000,vat:36750,name:'Used Toyota Hilux 2.4GD-6 D/Cab — delivery vehicle',residual:25000,life:5};
const DIRECT_EXP=[
 {date:'2026-09-05',acc:5190,ex:2000,vat:300,desc:'Cloud accounting & email subscriptions — monthly',cat:'Software & Subscriptions'},
 {date:'2026-09-20',acc:5180,ex:2500,vat:375,desc:'Local print & radio advertising campaign',cat:'Advertising'},
 {date:'2026-09-25',acc:5210,ex:1600,vat:240,desc:'Office & warehouse cleaning — September',cat:'Cleaning'},
 {date:'2026-09-25',acc:5240,ex:900,vat:0,desc:'Staff refreshments & month-end function (input VAT denied s17(2)(a))',cat:'Staff Welfare'},
];
const BANK_CHARGES=[
 {date:'2026-09-15',amt:210,desc:'Card machine settlement fees — first half September'},
 {date:'2026-09-30',amt:180,desc:'Monthly account admin fee'},
 {date:'2026-09-30',amt:130,desc:'Card machine settlement fees — second half September'},
];
const INTEREST={date:'2026-09-30',amt:185,desc:'Credit interest — business cheque account'};

const INVOICES=[
 {n:'INV-1063',date:'2026-09-08',cust:'Riverside',cat:'Furniture',due:'2026-10-08',lines:[['FUR-001',10,2300],['FUR-005',5,2150],['FUR-003',8,980]]},
 {n:'INV-1064',date:'2026-09-09',cust:'Protea',cat:'Printers & Equipment',due:'2026-10-09',lines:[['PRN-002',3,5400],['PRN-001',6,2900]]},
 {n:'INV-1065',date:'2026-09-10',cust:'Brightline',cat:'Stationery',due:'2026-10-10',lines:[['STA-001',80,340],['STA-003',120,45],['STA-011',100,37]]},
 {n:'INV-1066',date:'2026-09-11',cust:'CodeForge',cat:'Peripherals',due:'2026-10-11',lines:[['PER-001',40,190],['PER-002',50,110],['PER-004',20,680]]},
 {n:'INV-1067',date:'2026-09-12',cust:'Karoo',cat:'Consumables',due:'2026-10-12',lines:[['CON-001',30,1200],['CON-005',30,330],['CON-006',20,440]]},
 {n:'INV-1068',date:'2026-09-15',cust:'Summit',so:'SO-2026-0001',cat:'Furniture',due:'2026-10-15',lines:[['FUR-003',15,960],['FUR-007',8,2450],['FUR-009',10,1250]]},
 {n:'INV-1069',date:'2026-09-16',cust:'Ndlovu',cat:'Stationery',due:'2026-10-16',lines:[['STA-001',50,340],['STA-004',60,76],['STA-013',30,125]]},
 {n:'INV-1070',date:'2026-09-17',cust:'Horizon',cat:'Consumables',due:'2026-10-17',lines:[['CON-002',12,1400],['CON-003',10,1400],['CON-004',10,1400]]},
 {n:'INV-1071',date:'2026-09-18',cust:'Greenacres',cat:'Furniture',due:'2026-10-18',lines:[['FUR-002',4,4100],['FUR-006',3,3300]]},
 {n:'INV-1072',date:'2026-09-19',cust:'Maluleke',so:'SO-2026-0002',cat:'Printers & Equipment',due:'2026-10-19',lines:[['PRN-005',8,1950],['PRN-006',6,1550],['PRN-007',20,160]]},
 {n:'INV-1073',date:'2026-09-22',cust:'FreshMart',cat:'Consumables',due:'2026-10-22',lines:[['CON-001',25,1200],['CON-007',10,1750]]},
 {n:'INV-1074',date:'2026-09-23',cust:'Cape',so:'SO-2026-0003',cat:'Stationery',due:'2026-10-23',lines:[['STA-001',40,340],['STA-016',15,175],['STA-012',20,110]]},
 {n:'INV-1075',date:'2026-09-24',cust:'Riverside',cat:'Furniture',due:'2026-10-24',lines:[['FUR-001',6,2300]]},
 {n:'INV-1076',date:'2026-09-25',cust:'Apex',cat:'Peripherals',due:'2026-10-25',lines:[['PER-003',8,620],['PER-001',20,190]]},
 {n:'INV-1077',date:'2026-09-26',cust:'Protea',due:'2026-10-26',service:{acc:4050,ex:4500,desc:'Delivery & on-site installation — boardroom fit-out'}},
 {n:'INV-1078',date:'2026-09-29',cust:'Summit',due:'2026-10-29',service:{acc:4050,ex:2800,desc:'Assembly, delivery & waste removal — filing project'}},
 {n:'INV-1079',date:'2026-09-29',cust:'SwiftHaul',cat:'Stationery',zero:true,due:'2026-10-29',lines:[['STA-001',25,300]]},
 {n:'INV-1080',date:'2026-09-30',cust:'Ubuntu',cat:'Stationery',due:'2026-10-30',lines:[['STA-003',50,45],['STA-005',40,30],['STA-010',30,25]]},
];

// ── chronological event list ──
const EV=[];
const push=(date,seq,fn)=>EV.push({date,seq,fn});
STOCK_BILLS.forEach(b=>push(b.date,10,()=>{
  const contribs=[]; let ex=0,vat=0; b.lineData=[];
  b.lines.forEach(([sku,qty,unit],i)=>{ const lt=r2(qty*unit); ex+=lt; const lv=r2(lt*0.15); vat+=lv;
    contribs.push({...recv(sku,WH_CPT,qty,unit,b.date,'bill',b.n,`L${i+1}`),inv:1200,contra:2000});
    b.lineData.push({sku,qty,unit,lineTotal:lt,vat:lv,tax:T_STD,i:i+1}); });
  ex=r2(ex); vat=r2(vat); const total=r2(ex+vat); const apExtra=r2(total-ex);
  b.ex=ex; b.vat=vat; b.total=total;
  b.je=invJE(b.date,contribs,[{code:2110,dr:vat},{code:2000,cr:apExtra}],'bill',`Bill ${b.n}`);
  D.bills.push(b);
}));
EXP_BILLS.forEach(b=>push(b.date,11,()=>{
  const total=r2(b.ex+b.vat); b.total=total;
  b.je=postJE(b.date,'bill',`Bill ${b.n}`,[{code:b.acc,dr:b.ex},...(b.vat>0?[{code:2110,dr:b.vat}]:[]),{code:2000,cr:total}]);
  D.bills.push(b);
}));
push(FA_BILL.date,12,()=>{ const b=FA_BILL; const total=r2(b.ex+b.vat); b.total=total;
  b.je=postJE(b.date,'bill',`Bill ${b.n}`,[{code:1500,dr:b.ex},{code:2110,dr:b.vat},{code:2000,cr:total}]);
  D.bills.push(b);
  D.fixedAssets.push({n:'FA-006',name:b.name,cost:b.ex,residual:b.residual,life:b.life,date:b.date,sourceBill:b.n});
});
DIRECT_EXP.forEach(e=>push(e.date,20,()=>{ const total=r2(e.ex+e.vat);
  const je=postJE(e.date,'bank',e.desc,[{code:e.acc,dr:e.ex},...(e.vat>0?[{code:2110,dr:e.vat}]:[]),{code:1000,cr:total}]);
  D.bankLines.push({date:e.date,dir:'credit',amount:total,desc:e.desc,category:e.cat,je,onStmt:true});
}));
INVOICES.forEach(inv=>push(inv.date,30,()=>{
  inv.lineData=[];
  if(inv.service){ const ex=r2(inv.service.ex), vat=r2(ex*0.15), total=r2(ex+vat);
    inv.je=postJE(inv.date,'invoice',`Sales invoice ${inv.n}`,[{code:1100,dr:total},{code:inv.service.acc,cr:ex},{code:2100,cr:vat}]);
    inv.ex=ex; inv.vat=vat; inv.total=total; inv.cogs=0;
    inv.lineData.push({desc:inv.service.desc,qty:1,unit:ex,lineTotal:ex,vat,tax:T_STD,product:null,i:1}); D.invoices.push(inv); return; }
  const contribs=[]; let ex=0,vat=0,cogs=0; const tax=inv.zero?T_ZERO:T_STD;
  inv.lines.forEach(([sku,qty,unit],i)=>{ const lt=r2(qty*unit); ex+=lt; const lv=inv.zero?0:r2(lt*0.15); vat+=lv;
    const c=issue(sku,WH_CPT,-qty,inv.date,'sale','invoice',inv.n,`L${i+1}`); cogs+=c.raw;
    contribs.push({...c,inv:1200,contra:COGS[inv.cat]});
    inv.lineData.push({sku,qty,unit,lineTotal:lt,vat:lv,tax,i:i+1}); });
  ex=r2(ex); vat=r2(vat); const total=r2(ex+vat);
  inv.je=invJE(inv.date,contribs,[{code:1100,dr:total},{code:REV[inv.cat],cr:ex},...(vat>0?[{code:2100,cr:vat}]:[])],'invoice',`Sales invoice ${inv.n}`);
  inv.ex=ex; inv.vat=vat; inv.total=total; inv.cogs=r2(cogs); D.invoices.push(inv);
}));
// transfers
push('2026-09-19',40,()=>{ const raw=xfer('STA-011',WH_CPT,WH_JHB,20,'2026-09-19','stock_transfer','TRF-0001','L1');
  D.stockTransfers.push({n:'TRF-0001',kind:'immediate',date:'2026-09-19',lines:[{sku:'STA-011',qty:20,unit_cost:r4(raw/20),total:r2(raw)}]});
});
push('2026-09-23',40,()=>{ const w=stock['PRN-005'].wac; xfer('PRN-005',WH_CPT,WH_JHB,6,'2026-09-23','stock_transfer','TRF-0002','L1');
  const v=r2(6*w);
  const jd=postJE('2026-09-23','stock_transfer','Stock transfer TRF-0002 — dispatch',[{code:1210,dr:v},{code:1200,cr:v}]);
  D.stockTransfers.push({n:'TRF-0002',kind:'lifecycle',date:'2026-09-23',received:'2026-09-25',wac:w,transitValue:v,jeDispatch:jd,lines:[{sku:'PRN-005',qty:6,unit_cost:w,total:v}]});
});
push('2026-09-25',41,()=>{ const t=D.stockTransfers.find(x=>x.n==='TRF-0002'); const v=t.transitValue;
  t.jeReceipt=postJE('2026-09-25','stock_transfer','Stock transfer TRF-0002 — receipt',[{code:1200,dr:v},{code:1210,cr:v}]);
});
// supplier return SRET-0001 (vs BILL-2030) — PRN-004 x1 faulty, returned at booked cost
push('2026-09-26',50,()=>{ const wac=stock['PRN-004'].wac;
  const c=issue('PRN-004',WH_CPT,-1,'2026-09-26','purchase_return','supplier_return','SRET-0001','L1');
  const exCr=r2(8000), vatRev=r2(exCr*0.15), total=r2(exCr+vatRev);
  const je=invJE('2026-09-26',[{...c,inv:1200,contra:5060}],[{code:2000,dr:total},{code:5060,cr:exCr},{code:2110,cr:vatRev}],'supplier_return','Supplier return SRET-0001 — PrintTech debit note, R9,200 recoverable (Dr AP / Cr Inventory + Cr VAT input)');
  D.supplierReturns.push({n:'SRET-0001',date:'2026-09-26',sup:'PrintTech',bill:'BILL-2030',sku:'PRN-004',qty:1,unitPrice:8000,ex:exCr,vat:vatRev,total,wacAtReturn:wac,cogsRaw:r2(c.raw),je});
});
// stock take STK-0001 (2026-09-27) — full CPT count, 2 non-zero variances
push('2026-09-27',60,()=>{
  const date='2026-09-27'; const frozen={};
  for(const sku of Object.keys(OPEN)) frozen[sku]={expected:r4(bal[`${sku}|${WH_CPT}`]||0),unit:stock[sku].wac};
  const variances=[['STA-005',+3],['STA-009',-2]];
  const contribs=[];
  for(const [sku,dq] of variances){ const fr=frozen[sku];
    const c= dq<0 ? issue(sku,WH_CPT,dq,date,'stock_take','stock_take','STK-0001',`L-${sku}`,fr.unit)
                  : retIn(sku,WH_CPT,dq,date,'stock_take','stock_take','STK-0001',`L-${sku}`,fr.unit);
    contribs.push({...c,inv:1200,contra:5050}); }
  const je=invJE(date,contribs,[],'stock_take','Stock take STK-0001 — net variance');
  const netVar=r2(S(variances.map(([s,dq])=>r2(dq*frozen[s].unit)))); // stockTakeService: round per line, then sum
  D.stockTakes.push({n:'STK-0001',date,frozen,variances,je,netVarianceValue:netVar});
});
// stock adjustment ADJ-0001 (2026-09-28) — write-off -3 STA-002 water damage @ WAC 95.00
push('2026-09-28',70,()=>{ const date='2026-09-28'; const unit=stock['STA-002'].wac;
  const c=issue('STA-002',WH_CPT,-3,date,'write_off','stock_adjustment','ADJ-0001','L1',unit);
  const je=invJE(date,[{...c,inv:1200,contra:5050}],[],'stock_adjustment','Stock adjustment ADJ-0001 — write-off (water damage)');
  D.stockAdjustments.push({n:'ADJ-0001',date,sku:'STA-002',qty:-3,unit,costEffect:r2(-3*unit),je});
});
// payroll summary JE (2026-09-25)
push('2026-09-25',25,()=>{ D.payrollJE=postJE('2026-09-25','manual','September 2026 salaries — summary journal (payroll module not production-tested; no employee/payslip records)',[{code:5400,dr:62000},{code:1000,cr:52380},{code:2200,cr:9000},{code:2210,cr:620}]);
  D.bankLines.push({date:'2026-09-25',dir:'credit',amount:52380,desc:'Salary payments — September (net)',category:'Salaries',je:D.payrollJE,onStmt:true});
});
// bank charges + interest
BANK_CHARGES.forEach(bc=>push(bc.date,80,()=>{ const je=postJE(bc.date,'bank',bc.desc,[{code:5140,dr:bc.amt},{code:1000,cr:bc.amt}]);
  D.bankLines.push({date:bc.date,dir:'credit',amount:bc.amt,desc:bc.desc,category:'Bank Charges',je,onStmt:true}); }));
push(INTEREST.date,81,()=>{ const je=postJE(INTEREST.date,'bank',INTEREST.desc,[{code:1000,dr:INTEREST.amt},{code:4900,cr:INTEREST.amt}]);
  D.bankLines.push({date:INTEREST.date,dir:'debit',amount:INTEREST.amt,desc:INTEREST.desc,category:'Interest Income',je,onStmt:true}); });
// bank charge that appears on the September statement but is NOT yet booked (reconciling item -> October JE)
push('2026-09-30',82,()=>{ D.unbookedStmtCharge={date:'2026-09-30',dir:'credit',amount:55,desc:'Debit-order dispute admin fee'}; });
// depreciation (2026-09-30)
push('2026-09-30',90,()=>{
  const A=[{n:'FA-001',base:288000,life:5,accum:4800},{n:'FA-002',base:48000,life:6,accum:666.67},{n:'FA-003',base:60000,life:3,accum:1666.67},{n:'FA-004',base:20000,life:3,accum:555.56},{n:'FA-005',base:31000,life:6,accum:430.56},{n:'FA-006',base:220000,life:5,accum:0}];
  const raw=[]; const entries=[];
  for(const a of A){ const amt=r2(a.base/a.life/12); raw.push({code:5200,dr:amt}); raw.push({code:1590,cr:amt}); entries.push({asset:a.n,amount:amt,accumAfter:r2(a.accum+amt),carryingAfter:r2((a.n==='FA-006'?245000:{'FA-001':320000,'FA-002':48000,'FA-003':66000,'FA-004':22000,'FA-005':31000}[a.n]) - r2(a.accum+amt))}); }
  const je=postJE('2026-09-30','depreciation','Depreciation run for period ending 2026-09-30',raw);
  D.depreciation={je,entries,total:r2(S(entries.map(e=>e.amount)))};
});

// credit notes (2026-09-30)
push('2026-09-30',95,()=>{
  const date='2026-09-30';
  const q=1, exU=2300, ex=r2(q*exU), vat=r2(ex*0.15), total=r2(ex+vat);
  const c=retIn('FUR-001',WH_CPT,q,date,'sales_return','credit_note','CN-1007','L1');
  const je=invJE(date,[{...c,inv:1200,contra:COGS['Furniture']}],[{code:REV['Furniture'],dr:ex},{code:2100,dr:vat},{code:1100,cr:total}],'credit_note','Credit note CN-1007 (return)');
  D.creditNotes.push({n:'CN-1007',date,cust:'Riverside',invoice:'INV-1075',reason:'return',sku:'FUR-001',qty:q,exUnit:exU,ex,vat,total,cogsReversal:r2(c.raw),je,allocTo:'INV-1075',allocAmt:total});
  const ex2=1800, vat2=r2(ex2*0.15), total2=r2(ex2+vat2);
  const je2=postJE(date,'credit_note','Credit note CN-1008 (pricing_error)',[{code:REV['Printers & Equipment'],dr:ex2},{code:2100,dr:vat2},{code:1100,cr:total2}]);
  D.creditNotes.push({n:'CN-1008',date,cust:'Protea',invoice:'INV-1064',reason:'pricing_error',ex:ex2,vat:vat2,total:total2,je:je2,allocTo:'INV-1064',allocAmt:total2});
});

// process chronologically
EV.sort((a,b)=> a.date<b.date?-1: a.date>b.date?1: a.seq-b.seq);
for(const e of EV) e.fn();

// ── inventory rounding true-up (precedent: JE-4100 "Phase 21.1 4dp re-restatement") ──
const closeVal=r2(S(Object.entries(stock).map(([s,p])=>p.qoh*p.wac)));
const gl1200now=r2(1569743.20 + (gl[1200]||0));
const residual=r2(closeVal - gl1200now);
if(Math.abs(residual)>=0.01){
  const je=residual>0
    ? postJE('2026-09-30','manual','Inventory valuation rounding true-up (4dp WAC vs 2dp GL, per Phase 21.1 convention)',[{code:1200,dr:residual},{code:5000,cr:residual}])
    : postJE('2026-09-30','manual','Inventory valuation rounding true-up (4dp WAC vs 2dp GL, per Phase 21.1 convention)',[{code:5000,dr:-residual},{code:1200,cr:-residual}]);
  D.trueUpJE={je,residual};
}

// receipts / payments now that totals known (dated within month; recon flag)
const invByN=Object.fromEntries(D.invoices.map(i=>[i.n,i]));
const billByN=Object.fromEntries(D.bills.map(b=>[b.n,b]));
const RECEIPTS=[
 {n:'REC-1204',date:'2026-09-12',cust:'Riverside',method:'eft',allocs:[['INV-1063',null]]},
 {n:'REC-1205',date:'2026-09-15',cust:'Protea',method:'eft',allocs:[['INV-1064','net-cn']]},
 {n:'REC-1206',date:'2026-09-16',cust:'Brightline',method:'eft',allocs:[['INV-1065',null]]},
 {n:'REC-1207',date:'2026-09-18',cust:'CodeForge',method:'card',allocs:[['INV-1066',null]]},
 {n:'REC-1208',date:'2026-09-19',cust:'Karoo',method:'eft',allocs:[['INV-1067',30000]]},
 {n:'REC-1209',date:'2026-09-22',cust:'Summit',method:'eft',allocs:[['INV-1068',null]]},
 {n:'REC-1210',date:'2026-09-24',cust:'Ndlovu',method:'eft',allocs:[['INV-1069',null]]},
 {n:'REC-1211',date:'2026-09-25',cust:'Horizon',method:'cheque',allocs:[['INV-1070',25000]]},
 {n:'REC-1212',date:'2026-09-26',cust:'Greenacres',method:'eft',allocs:[['INV-1071',null]]},
 {n:'REC-1213',date:'2026-09-29',cust:'Maluleke',method:'eft',allocs:[['INV-1072',null]]},
 {n:'REC-1214',date:'2026-09-29',cust:'FreshMart',method:'card',allocs:[['INV-1073',null]]},
 {n:'REC-1215',date:'2026-09-30',cust:'Cape',method:'eft',allocs:[['INV-1074',null]]},
 {n:'REC-1216',date:'2026-09-30',cust:'Apex',method:'eft',allocs:[['INV-1076',null]]},
 {n:'REC-1217',date:'2026-09-30',cust:'Riverside',method:'eft',onAccount:2500,allocs:[]},
];
// timing items: deliberately NOT on the September statement (in books, clear in October)
const TIMING_NOT_ON_STMT = new Set(['REC-1216','REC-1217','PAY-2230']);
const cnAllocByInv={}; for(const cn of D.creditNotes) if(cn.allocTo) cnAllocByInv[cn.allocTo]=r2((cnAllocByInv[cn.allocTo]||0)+cn.allocAmt);
for(const rc of RECEIPTS){ let amt=0; rc.allocLines=[];
  for(const [inN,a] of rc.allocs){ const inv=invByN[inN]; const v= a==null? inv.total : a==='net-cn'? r2(inv.total-(cnAllocByInv[inN]||0)) : a; amt+=v; rc.allocLines.push({invoice:inN,amount:r2(v)}); }
  if(rc.onAccount) amt+=rc.onAccount; amt=r2(amt); rc.amount=amt; rc.unallocated=r2(amt - S(rc.allocLines.map(a=>a.amount)));
  rc.je=postJE(rc.date,'customer_receipt',`Customer receipt ${rc.n}`,[{code:1000,dr:amt},{code:1100,cr:amt}]);
  D.receipts.push(rc);
  D.bankLines.push({date:rc.date,dir:'debit',amount:amt,desc:`Customer receipt ${rc.n}`,category:'Customer Receipt',je:rc.je,onStmt:!TIMING_NOT_ON_STMT.has(rc.n)});
}
const PAYMENTS=[
 {n:'PAY-2221',date:'2026-09-12',sup:'Alpine',method:'eft',allocs:[['BILL-2029',null]]},
 {n:'PAY-2222',date:'2026-09-15',sup:'PrintTech',method:'eft',allocs:[['BILL-2030',null]]},
 {n:'PAY-2223',date:'2026-09-18',sup:'TonerZone',method:'eft',allocs:[['BILL-2031',40000]]},
 {n:'PAY-2224',date:'2026-09-19',sup:'Sappi',method:'eft',allocs:[['BILL-2032',null]]},
 {n:'PAY-2225',date:'2026-09-22',sup:'Nationwide',method:'eft',allocs:[['BILL-2033',null]]},
 {n:'PAY-2226',date:'2026-09-24',sup:'CenturyCity',method:'eft',allocs:[['BILL-2035',null]]},
 {n:'PAY-2227',date:'2026-09-25',sup:'Highveld',method:'cheque',allocs:[['BILL-2036',null]]},
 {n:'PAY-2228',date:'2026-09-26',sup:'QuickFuel',method:'eft',allocs:[['BILL-2039',null]]},
 {n:'PAY-2229',date:'2026-09-29',sup:'RapidCourier',method:'eft',allocs:[['BILL-2040',2000]]},
 {n:'PAY-2230',date:'2026-09-30',sup:'TonerZone',method:'eft',allocs:[['BILL-2031','rem'],['BILL-2034',null]]},
];
for(const p of PAYMENTS){ let amt=0; p.allocLines=[];
  for(const [bn,a] of p.allocs){ const b=billByN[bn]; let v;
    if(a==='rem') v=r2(b.total-40000); else if(a!=null) v=a; else v=b.total;
    amt+=v; p.allocLines.push({bill:bn,amount:r2(v)}); }
  amt=r2(amt); p.amount=amt;
  p.je=postJE(p.date,'payment',`${p.n} - supplier payment`,[{code:2000,dr:amt},{code:1000,cr:amt}]);
  D.payments.push(p);
  D.bankLines.push({date:p.date,dir:'credit',amount:amt,desc:`${p.n} — supplier payment`,category:'Supplier Payment',je:p.je,onStmt:!TIMING_NOT_ON_STMT.has(p.n)});
}

D.quotes=[{n:'QUO-1001',date:'2026-09-03',cust:'CodeForge',status:'sent',expiry:'2026-09-24',total:14500},
 {n:'QUO-1002',date:'2026-09-04',cust:'Maluleke',status:'accepted',expiry:'2026-09-25',total:21850,toSO:'SO-2026-0002'},
 {n:'QUO-1003',date:'2026-09-05',cust:'Prestige',status:'declined',expiry:'2026-09-26',total:9200}];
D.salesOrders=[{n:'SO-2026-0001',date:'2026-09-10',cust:'Summit',status:'fulfilled',toInv:'INV-1068'},
 {n:'SO-2026-0002',date:'2026-09-14',cust:'Maluleke',status:'fulfilled',quote:'QUO-1002',toInv:'INV-1072'},
 {n:'SO-2026-0003',date:'2026-09-18',cust:'Cape',status:'fulfilled',toInv:'INV-1074'},
 {n:'SO-2026-0004',date:'2026-09-28',cust:'FreshMart',status:'pending'}];
D.purchaseOrders=[{n:'PO-2026-0001',date:'2026-09-03',sup:'Alpine',status:'received',toBill:'BILL-2029'},
 {n:'PO-2026-0002',date:'2026-09-03',sup:'PrintTech',status:'received',toBill:'BILL-2030'},
 {n:'PO-2026-0003',date:'2026-09-04',sup:'TonerZone',status:'received',toBill:'BILL-2031'},
 {n:'PO-2026-0004',date:'2026-09-04',sup:'Sappi',status:'sent'}];

// ══════════ REPORT ══════════
const out=[]; const L=(s='')=>out.push(s);
L(`OPENING inventory Σ qoh×wac = R ${f2(OPEN_VAL)}   (live GL 1200 = 1,569,743.20)`);
L(`CLOSING inventory Σ qoh×wac = R ${f2(closeVal)}`);
L(`inventory true-up residual  = R ${f2(residual)}  ${D.trueUpJE? '-> '+D.trueUpJE.je : '(none needed)'}`);
const gl1200final=r2(1569743.20+(gl[1200]||0));
L(`closing GL 1200 (post true-up) = R ${f2(gl1200final)}   parity diff vs Σqoh×wac = R ${f2(r2(closeVal-gl1200final))}`);
// GL 1200 bridge
const grRcv=r2(S(D.bills.filter(b=>b.lineData).map(b=>b.ex)));
const cogsInv=r2(S(D.invoices.map(i=>i.cogs)));
const cogsRevCN=r2(S(D.creditNotes.filter(c=>c.reason==='return').map(c=>c.cogsReversal)));
const sretCost=r2(S(D.supplierReturns.map(s=>s.cogsRaw)));
const adjCost=r2(S(D.stockAdjustments.map(a=>Math.abs(a.costEffect))));
const stkNet=r2(S(D.stockTakes.map(t=>t.netVarianceValue)));
L(`GL 1200 bridge:  opening 1,569,743.20`);
L(`  + goods received (6 stock bills)      +${f2(grRcv)}`);
L(`  - COGS on stock invoices              -${f2(cogsInv)}`);
L(`  + COGS reversal CN-1007               +${f2(cogsRevCN)}`);
L(`  - supplier return SRET-0001 (@ cost)  -${f2(sretCost)}`);
L(`  - stock adjustment ADJ-0001           -${f2(adjCost)}`);
L(`  +/- stock take STK-0001 net           ${stkNet<0?'':'+'}${f2(stkNet)}`);
L(`  +/- 4dp/2dp rounding drift + true-up  ${f2(r2(residual))}  (true-up JE-4149)`);
const bridgeClose=r2(1569743.20 + grRcv - cogsInv + cogsRevCN - sretCost - adjCost + stkNet + residual);
L(`  = closing (bridge)  R ${f2(bridgeClose)}   vs GL 1200 R ${f2(gl1200final)}   diff R ${f2(r2(bridgeClose-gl1200final))}`);

// per-warehouse parity
const perSku={}; for(const k of Object.keys(bal)){ const [s]=k.split('|'); perSku[s]=r4((perSku[s]||0)+bal[k]); }
let bm=0; for(const s of Object.keys(OPEN)) if(r4(perSku[s])!==r4(stock[s].qoh)){ bm++; L(`  BAL MISMATCH ${s}`); }
L(`Σ stock_balances per sku == products.quantity_on_hand : ${bm===0?'PASS':'FAIL'}`);
const jhb=Object.keys(bal).filter(k=>k.endsWith(WH_JHB)&&bal[k]!==0).map(k=>`${k.split('|')[0]}×${bal[k]}`);
L(`WH-JHB balances: ${jhb.join(', ')}`);
let neg=0; for(const k of Object.keys(bal)) if(bal[k]<0){ neg++; L(`  NEGATIVE BALANCE ${k} = ${bal[k]}`); }
L(`no negative warehouse balance : ${neg===0?'PASS':'FAIL'}`);

// journals
let TD=0,TC=0,unb=0;
for(const j of journals){ const d=S(j.lines.map(l=>l.dr)),c=S(j.lines.map(l=>l.cr)); TD+=d;TC+=c; if(Math.abs(d-c)>0.005){unb++;L(`UNBALANCED ${j.n}`);} }
L(`\nnew journal_entries: ${journals.length}  (JE-${JE_START} .. ${journals[journals.length-1].n})`);
L(`new journal_lines:   ${S(journals.map(j=>j.lines.length))}`);
L(`Σ new debits  R ${f2(TD)}`);
L(`Σ new credits R ${f2(TC)}`);
L(`Σ(debit − credit) new batch = R ${f2(r2(TD-TC))}   unbalanced entries: ${unb}`);

// closing TB
const LIVE_TB={'1000':212270.67,'1100':207794.04,'1200':1569743.20,'1500':487000,'1590':-8119.46,'2000':-590511.21,'2100':-86742.45,'2110':154620.57,'3000':-500000,'3900':-1342450,'4010':-92478.39,'4020':-287212.76,'4030':-41172.56,'4040':-126269.11,'4050':-1650,'5000':0.07,'5010':57444.86,'5020':178033.42,'5030':26246.64,'5040':77935.51,'5110':38000,'5120':9500,'5130':2800,'5140':47.5,'5150':4200,'5160':13750,'5170':4000,'5180':8900,'5190':4000,'5200':8119.46,'5210':3200,'5220':7500,'5240':1500};
// ── August bank-reconciliation evidence — read-only, live-derived 2026-09-02 ──
// See docs/OFFICE_NATIONAL_RECON_EXPECTATIONS.md.  Every value below is reproduced by a read-only
// SELECT and RE-ASSERTED against live in the 0044 verification block (gates C15a-e).
// REC-1007 / JE-1065 is a 2026-08-31 *August* entry (bank date + JE date + ON-AUG-2026 line 87).
// The apparent R9,803.32 "discrepancy" was a query artefact: use  j.date < '2026-09-01'  everywhere,
// never  j.date <= '2026-08-31'  (a timestamp column silently drops 31-Aug entries after midnight).
const AUG={
  stmtRef:'ON-AUG-2026', stmtId:'df28d259-dfc2-48fb-929c-be9450a08bd7',
  closing:184068.54,        // bank_statements.closing_balance (ON-AUG-2026) → September opening (statement continuity)
  gl1000EndAug:140145.35,   // Σ GL1000 (debit-credit) for JEs dated < 2026-09-01  (REC-1007 INCLUDED)
  gl1000Now:212270.67,      // Σ GL1000 now  (= gl1000EndAug + 72,125.32 Sep receipts JE-1066/1067/1085)
  // C2a / C2b — August book items whose bank rows are dated 2026-09-01 → they CLEAR on the Sep statement
  clearing:[
    {bt:'4acd5c92-f515-4beb-94ae-57fb8223d7a0',ref:'PAY-2004',date:'2026-09-01',desc:'PAY-2004 - supplier payment',amt:46041.29,dir:'credit',cat:'Supplier Payment',wasStatus:'unreconciled'},
    {bt:'7f9d173c-b1ab-4d1c-99a7-a375f5f411a2',ref:'REC-1001',date:'2026-09-01',desc:'Customer receipt REC-1001',amt:2295.29,dir:'debit',cat:'Customer Receipt',wasStatus:'unreconciled'},
  ],
  // pre-existing September receipts — already booked + reconciled, no statement line yet
  septReceipts:[
    {bt:'17f0ff1f-35b3-4be1-997d-d7ab7a4b4049',ref:'REC-1008',  date:'2026-09-01',desc:'Customer receipt REC-1008',           amt:116.64,  dir:'debit',cat:'Customer Receipt',wasStatus:'reconciled'},
    {bt:'6104af71-1d84-4346-ba4a-a5d60a8ec158',ref:'REC-1009-1',date:'2026-09-01',desc:'Customer receipt REC-1009 (tranche 1/2)',amt:25000.00,dir:'debit',cat:'Customer Receipt',wasStatus:'reconciled'},
    {bt:'3d818821-a022-426f-b943-430a6575135e',ref:'REC-1009-2',date:'2026-09-01',desc:'Customer receipt REC-1009 (tranche 2/2)',amt:18263.00,dir:'debit',cat:'Customer Receipt',wasStatus:'reconciled'},
    {bt:'ac1b86de-409d-4a79-9ad3-3ebfea24deda',ref:'REC-1027-1',date:'2026-09-04',desc:'Customer receipt REC-1027 (tranche 1/2)',amt:15000.00,dir:'debit',cat:'Customer Receipt',wasStatus:'reconciled'},
    {bt:'d5b46c1f-fe9e-4e90-9385-aeb1ac0dfd4e',ref:'REC-1027-2',date:'2026-09-04',desc:'Customer receipt REC-1027 (tranche 2/2)',amt:13745.68,dir:'debit',cat:'Customer Receipt',wasStatus:'reconciled'},
  ],
  // still-open August reconciling scenarios (ON-AUG-2026 = in_progress) — brought forward into September
  bf:[
    {c:'C3', signed:-0.16,    fixtureBt:'edf796c4-87a1-40b2-a3cb-8907f7c5d6f5', fixtureAmt:47.66,   note:'R0.16 under-booked bank charge — bank 47.66 vs JE-3001 47.50'},
    {c:'C4', signed:-185.50,  fixtureBt:'046d81c4-0bdf-45f5-a0c0-bc9bc2f74d38', fixtureAmt:185.50,  note:'Cash handling fee — bank-only, not yet booked'},
    {c:'C5', signed:+62.10,   fixtureBt:'5d280d57-2109-4b26-8a24-9c93a65f7a92', fixtureAmt:62.10,   note:'Interest received — bank-only, not yet booked'},
    {c:'C6', signed:+4600.00, fixtureBt:'539ca37d-dea1-43df-b3e7-67ad6e53580f', fixtureAmt:4600.00, note:'Duplicate posting JE-2064 (PAY-2220 in books twice, bank once)'},
    {c:'C7', signed:-3668.60, fixtureBt:'64f28fa4-740a-4b60-a6c5-fc90ae1636c5', fixtureAmt:1834.30, note:'Wrong-sign capture of REC-1020 (2x the R1,834.30 line)'},
    {c:'C11',signed:-405.40,  fixtureBt:'e40148ed-0ac7-45de-8109-ebe87a442cf1', fixtureAmt:95.00,   note:'Pair combination — card-machine rental R95.00 + SMS R310.40, bank-only'},
    {c:'C12',signed:-225.25,  fixtureBt:'90c710d7-4427-4e90-8b1d-374581c6b3f6', fixtureAmt:42.00,   note:'Triple combination — statement fee R42.00 + ATM R118.50 + faster-payment R64.75, bank-only'},
  ],
};
AUG.priorRows=[...AUG.clearing,...AUG.septReceipts];                      // 7 pre-existing September bank rows
const AUG_BF=r2(S(AUG.bf.map(x=>x.signed)));                              // Derivation 3 (itemised) — expect 177.19
const BF_D1 =r2(AUG.closing - AUG.gl1000EndAug - AUG.clearing[0].amt + AUG.clearing[1].amt);  // Derivation 1 (continuity)
if(BF_D1!==AUG_BF) throw new Error(`ABORT: August b/f derivations disagree — continuity ${f2(BF_D1)} vs itemised ${f2(AUG_BF)}`);

const codes=new Set([...Object.keys(LIVE_TB),...Object.keys(gl).map(String)]);
let tbD=0,tbC=0; const tbRows=[];
for(const code of [...codes].sort((a,b)=>a-b)){ const close=r2((LIVE_TB[code]||0)+(gl[code]||0)); if(close===0) continue;
  tbRows.push([code,close]); if(close>0) tbD+=close; else tbC+=-close; }
L(`\n═══ CLOSING TRIAL BALANCE 2026-09-30 ═══`);
for(const [c,v] of tbRows) L(`  ${c}  ${f2(v).padStart(16)}`);
L(`  Σ debit  ${f2(r2(tbD)).padStart(16)}`);
L(`  Σ credit ${f2(r2(tbC)).padStart(16)}`);
L(`  TB difference  R ${f2(r2(tbD-tbC))}`);

// P&L summary
const rev=code=> -(gl[code]||0);
const salesEx=r2(S(D.invoices.map(i=>i.ex)) - S(D.creditNotes.map(cn=>cn.ex)));
const vatOut= r2(-(gl[2100]||0));
const vatIn= r2(gl[2110]||0);
const cogsMv= r2((gl[5010]||0)+(gl[5020]||0)+(gl[5030]||0)+(gl[5040]||0)+(gl[5000]||0));
const invAdj= r2(gl[5050]||0);
const opex= r2((gl[5110]||0)+(gl[5120]||0)+(gl[5130]||0)+(gl[5140]||0)+(gl[5150]||0)+(gl[5160]||0)+(gl[5180]||0)+(gl[5190]||0)+(gl[5200]||0)+(gl[5210]||0)+(gl[5240]||0));
const salaries= r2(gl[5400]||0);
const incomeTot= r2(-(gl[4010]||0)-(gl[4020]||0)-(gl[4030]||0)-(gl[4040]||0)-(gl[4050]||0)-(gl[4900]||0));
const netProfit= r2(incomeTot - cogsMv - invAdj - opex - salaries);
L(`\n═══ SEPTEMBER P&L (movement) ═══`);
L(`  Sales ex-VAT (net of credit notes) : R ${f2(salesEx)}`);
L(`  Revenue recognised (incl 4050 svc, 4900 int) : R ${f2(incomeTot)}`);
L(`  VAT Output movement : R ${f2(vatOut)}   VAT Input movement : R ${f2(vatIn)}   net VAT payable accrued : R ${f2(r2(vatOut-vatIn))}`);
L(`  COGS (5000-5040) : R ${f2(cogsMv)}`);
L(`  Inventory adjustments (5050) : R ${f2(invAdj)}`);
L(`  Operating expenses (51xx incl 5200 dep) : R ${f2(opex)}`);
L(`  Salaries (5400) : R ${f2(salaries)}`);
L(`  ── NET PROFIT : R ${f2(netProfit)}`);
L(`  Gross profit : R ${f2(r2(incomeTot - r2(gl[4900]||0)*-1 - cogsMv))}  (rev ex-interest ${f2(r2(incomeTot-185))} − COGS ${f2(cogsMv)})`);

// AR / AP subledger recon
let arSub=207794.04;
// new invoices raised (non-service included), less receipts allocated, less credit-note AR credit
const invRaised=r2(S(D.invoices.map(i=>i.total)));
const cnAR=r2(S(D.creditNotes.map(cn=>cn.total)));
const recTot=r2(S(D.receipts.map(r=>r.amount)));
const onAcct=r2(S(D.receipts.map(r=>r.unallocated)));
arSub=r2(arSub + invRaised - cnAR - recTot);
L(`\n═══ SUBLEDGER RECON ═══`);
L(`  AR: open 207,794.04 + invoices ${f2(invRaised)} − credit notes ${f2(cnAR)} − receipts ${f2(recTot)} = R ${f2(arSub)}`);
L(`      closing GL 1100 = R ${f2(r2(207794.04+(gl[1100]||0)))}   diff R ${f2(r2(arSub - r2(207794.04+(gl[1100]||0))))}`);
const billRaised=r2(S(D.bills.map(b=>b.total)));
const payTot=r2(S(D.payments.map(p=>p.amount)));
const sretAP=r2(S(D.supplierReturns.map(s=>s.total)));
const apDelta=r2(billRaised - payTot - sretAP);
L(`  AP: bills raised ${f2(billRaised)} − payments ${f2(payTot)} − supplier returns ${f2(sretAP)} = Δ ${f2(apDelta)}`);
L(`      closing GL 2000 = R ${f2(r2(-590511.21+(gl[2000]||0)))}   (GL 2000 Δ ${f2(gl[2000]||0)} ; must == −Δ above ${f2(-apDelta)})`);

// ── Bank reconciliation — CONTINUATION reconciliation (Option A, user-approved 2026-09-02) ──
// September opens at ON-AUG-2026.closing (R184,068.54 — statement continuity, NOT a bank_accounts figure).
// All 7 pre-existing September bank rows are represented: PAY-2004 + REC-1001 (August C2a/C2b, cleared
// here) and the 5 booked receipts REC-1008/1009/1027.  August's C3-C12 stay OPEN on ON-AUG-2026 and are
// carried as ONE explicit b/f reconciling line (R177.19).  The August training fixture is NOT modified.
const bankNet=r2(gl[1000]||0);                       // seed's own GL 1000 movement (73 JEs)
const gl1000final=r2((LIVE_TB['1000']||0)+(gl[1000]||0));  // post-seed GL 1000 "Cash and Bank" absolute (= bank_accounts.current_balance target)
const bookedIn=r2(S(D.bankLines.filter(b=>b.dir==='debit').map(b=>b.amount)));
const bookedOut=r2(S(D.bankLines.filter(b=>b.dir==='credit').map(b=>b.amount)));
const onStmt=D.bankLines.filter(b=>b.onStmt);
const timing=D.bankLines.filter(b=>!b.onStmt);
const priorSigned=r2(S(AUG.priorRows.map(b=> b.dir==='debit'? b.amt : -b.amt)));   // -43,746.00 + 72,125.32 = +28,379.32
const onStmtSigned=r2(S(onStmt.map(b=> b.dir==='debit'? b.amount : -b.amount)));
const SEP_BANKONLY=D.unbookedStmtCharge ? D.unbookedStmtCharge.amount : 0;         // 55.00 (outflow, unmatched line)
const stmtOpen=AUG.closing;
const stmtClose=r2(stmtOpen + priorSigned + onStmtSigned - SEP_BANKONLY);
const gl1000EndSep=r2(AUG.gl1000Now + bankNet);                                    // 212,270.67 + 100,810.25 = 313,080.92
const depositsInTransit=r2(S(timing.filter(t=>t.dir==='debit').map(t=>t.amount)));  // REC-1216 + REC-1217 = 12,574.00
const outstandingPmts=r2(S(timing.filter(t=>t.dir==='credit').map(t=>t.amount)));   // PAY-2230 = 43,260.00
const BF_D2=r2(stmtClose + depositsInTransit - outstandingPmts - gl1000EndSep + SEP_BANKONLY);  // Derivation 2 (forward tie-out)
if(BF_D2!==AUG_BF) throw new Error(`ABORT: August b/f derivations disagree — forward ${f2(BF_D2)} vs ${f2(AUG_BF)}`);
const adjBank=r2(stmtClose + depositsInTransit - outstandingPmts);
const adjBook=r2(gl1000EndSep - SEP_BANKONLY + AUG_BF);
const reconVariance=r2(adjBank - adjBook);
if(reconVariance!==0) throw new Error(`ABORT: September reconciliation variance R${f2(reconVariance)} != 0.00`);
const nStmtLines=AUG.priorRows.length + onStmt.length + 1;                          // 7 prior + 30 new-matched + 1 unmatched R55
L(`\n═══ BANK RECONCILIATION — September (continuation) ═══`);
L(`  new bank_transactions ${onStmt.length + timing.length} + linked pre-existing ${AUG.priorRows.length}   GL 1000 Δ (seed) R ${f2(bankNet)}  (== booked net ${f2(r2(bookedIn-bookedOut))} : ${r2(bookedIn-bookedOut)===bankNet?'PASS':'FAIL'})`);
L(`  September opening (= ON-AUG-2026 closing, continuity) : R ${f2(stmtOpen)}`);
L(`  + prior Sep bank rows now on statement : R ${f2(priorSigned)}  (PAY-2004 -46,041.29 · REC-1001 +2,295.29 · REC-1008/1009/1027 +72,125.32)`);
L(`  + new seed on-statement activity       : R ${f2(onStmtSigned)}   - Sep bank-only (R55, unmatched) : R -${f2(SEP_BANKONLY)}`);
L(`  = September statement CLOSING          : R ${f2(stmtClose)}   (${nStmtLines} lines)`);
L(`  ── September reconciliation schedule ──`);
L(`    statement closing                                    R ${f2(stmtClose)}`);
L(`      + deposits in transit (REC-1216, REC-1217)         +${f2(depositsInTransit)}`);
L(`      - unpresented payment (PAY-2230)                   -${f2(outstandingPmts)}`);
L(`    = adjusted bank balance                              R ${f2(adjBank)}`);
L(`    GL 1000 balance                                      R ${f2(gl1000EndSep)}`);
L(`      - September bank-only fee not booked (debit-order dispute) -${f2(SEP_BANKONLY)}`);
L(`      + August reconciling items b/f (ON-AUG-2026, in progress)  +${f2(AUG_BF)}`);
AUG.bf.forEach(x=>L(`          ${x.c.padEnd(4)} ${(x.signed>=0?'+':'')+f2(x.signed)}  ${x.note}`));
L(`    = adjusted book balance                              R ${f2(adjBook)}`);
L(`  ═══ RECONCILIATION VARIANCE : R ${f2(reconVariance)} ═══`);
L(`  b/f derivations — D1 continuity ${f2(BF_D1)} · D2 forward ${f2(BF_D2)} · D3 itemised ${f2(AUG_BF)}  -> ${BF_D1===BF_D2&&BF_D2===AUG_BF?'AGREE':'DISAGREE — ABORT'}`);

// COUNTS
const nInvL=S(D.invoices.map(i=>i.lineData.length));
const nBillL=S(D.bills.map(b=>b.lineData?b.lineData.length:1));
L(`\n═══ EXACT COUNTS ═══`);
const nPoL=S(D.purchaseOrders.map(po=>{const b=D.bills.find(x=>x.n===po.toBill);return b?b.lineData.length:1;}));
L(`  warehouses +1 · suppliers +1 (ONS-014)`);
L(`  quotes ${D.quotes.length} (jsonb lines only — no quote_lines table) · sales_orders ${D.salesOrders.length} (jsonb lines only) · purchase_orders ${D.purchaseOrders.length} · purchase_order_lines ${nPoL}`);
L(`  invoices ${D.invoices.length} · invoice_lines ${nInvL} (jsonb) + ${nInvL} (normalized)`);
L(`  credit_notes ${D.creditNotes.length} · credit_note_lines ${D.creditNotes.length}`);
L(`  bills ${D.bills.length} · bill_lines ${nBillL}`);
L(`  customer_receipts ${D.receipts.length} · payments ${D.payments.length}`);
L(`  supplier_returns ${D.supplierReturns.length} · supplier_return_lines ${D.supplierReturns.length}`);
L(`  stock_adjustments ${D.stockAdjustments.length} (lines ${D.stockAdjustments.length}) · stock_takes ${D.stockTakes.length} (stock_take_lines 48)`);
L(`  stock_transfers ${D.stockTransfers.length} · stock_transfer_lines ${D.stockTransfers.length}`);
L(`  fixed_assets +1 · depreciation_entries ${D.depreciation.entries.length}`);
L(`  journal_entries ${journals.length} · journal_lines ${S(journals.map(j=>j.lines.length))}`);
L(`  stock_movements ${movements.length}`);
const ITL_SRC=new Set(['bill','invoice','credit_note','supplier_return','stock_adjustment','stock_take','stock_transfer']);
const itlKeys=new Set(); for(const m of movements){ if(!ITL_SRC.has(m.st)) continue;
  let v = m.st==='stock_transfer' ? (D.stockTransfers.find(t=>t.n===m.sid).kind==='immediate'?'complete':(m.type==='transfer_out'?'dispatch':'receive')) : m.st==='credit_note'?'issue':'post';
  itlKeys.add(`${m.st}:${m.sid}:${v}`); }
L(`  inventory_transaction_log ${itlKeys.size}  (one per posting-key)`);
L(`  bank_statements 1 · bank_statement_lines ${nStmtLines} · bank_transactions ${onStmt.length + timing.length} new + ${AUG.priorRows.length} linked · reconciliations 1`);
L(`  depreciation total R ${f2(D.depreciation.total)}  (${D.depreciation.entries.map(e=>e.asset+':'+f2(e.amount)).join('  ')})`);

console.log(out.join('\n'));

// ════════════════════════ SQL + MANIFEST GENERATOR (--sql) ════════════════════════
if(!WRITE_SQL) process.exit(0);

const TT={wh:'01',sup:'02',quo:'10',qln:'11',so:'20',sln:'21',inv:'30',iln:'31',cn:'40',cln:'41',rec:'50',po:'60',pln:'61',bill:'70',bln:'71',sret:'80',srl:'81',pay:'90',adj:'a0',adl:'a1',stk:'b0',stl:'b1',trf:'c0',trl:'c1',je:'d0',jl:'d1',mov:'e0',bs:'f0',bsl:'f1',bt:'f2',recn:'f3',fa:'08',dep:'09',itl:'0a'};
const U=(tt,seq)=>`5eed0000-0000-4000-8000-${TT[tt]}${Number(seq).toString(16).padStart(10,'0')}`;
const q=(s)=> s==null? 'null' : `'${String(s).replace(/'/g,"''")}'`;
const jb=(o)=>`'${JSON.stringify(o).replace(/'/g,"''")}'::jsonb`;
const N=(n)=> n==null? 'null' : f2(n);
const acId=(code)=>ACC[code];

// id maps
const IDS={ warehouse:{ 'WH-JHB':WH_JHB }, supplier:{ Boland:SUP_BOLAND }, doc:{}, line:{}, je:{}, mov:{}, bt:{}, bsl:{}, itl:{}, dep:{}, fa:{} };
let c={quo:0,qln:0,so:0,sln:0,inv:0,iln:0,cn:0,cln:0,rec:0,po:0,pln:0,bill:0,bln:0,sret:0,srl:0,pay:0,adj:0,adl:0,stk:0,stl:0,trf:0,trl:0,je:0,jl:0,mov:0,bs:0,bsl:0,bt:0,recn:0,fa:0,dep:0,itl:0};
const docId=(kind,num)=>{ const k=`${kind}:${num}`; if(!IDS.doc[k]) IDS.doc[k]=U(kind, ++c[kind]); return IDS.doc[k]; };
const lineId=(kind,docnum,ln)=>{ const k=`${kind}:${docnum}:${ln}`; if(!IDS.line[k]) IDS.line[k]=U(kind, ++c[kind]); return IDS.line[k]; };

// journal + line ids (by index)
journals.forEach((j,ix)=>{ j.id=U('je',ix+1); j.lines.forEach((l,li)=>l.id=U('jl',(ix+1)*100+li)); });
const jeById=Object.fromEntries(journals.map(j=>[j.n,j]));

// movement ids + source doc/line resolution
const SRC_KIND={bill:'bill',invoice:'inv',credit_note:'cn',supplier_return:'sret',stock_adjustment:'adj',stock_take:'stk',stock_transfer:'trf'};
movements.forEach((m,ix)=>{ m.id=U('mov',ix+1);
  const kind=SRC_KIND[m.st];
  m.docId= kind ? docId(kind,m.sid) : null;
  m.lineId= kind && m.slid ? lineId(kind==='bill'?'bln':kind==='inv'?'iln':kind==='cn'?'cln':kind==='sret'?'srl':kind==='adj'?'adl':kind==='stk'?'stl':'trl', m.sid, m.slid) : null;
});

const sql=[];
const W=(s='')=>sql.push(s);
W(`-- 0044_september_2026_data.sql   — GENERATED by docs/db-changes/september_2026_simulation.mjs`);
W(`-- September 2026 demo data for Office National Demo (Pty) Ltd  ${COMPANY}`);
W(`-- AUTHORED — DO NOT EXECUTE until the Part W pre-write report is approved.`);
W(`-- Single reviewed idempotent script; every row carries a deterministic UUID`);
W(`--   5eed0000-0000-4000-8000-<TT><counter>  (TT table code — see september_2026_manifest.md).`);
W(`-- Reproduces the exact effect of post_inventory_transaction / the posting services / the`);
W(`-- depreciation engine (verified 2026-09-02). No app service is called; no RPC is invoked.`);
W(`-- Rollback: docs/db-changes/september_2026_rollback.sql (deletes exactly these ids).`);
W(``);
W(`BEGIN;`);
W(``);
W(`-- ── pre-write fingerprint (store output before running) ──`);
W(`-- (run this SELECT on its own and save the output as september_2026_fingerprint_pre.json BEFORE the batch)`);
W(`select 'tb_sum' k, round(sum(jl.debit-jl.credit),2) v from journal_lines jl join journal_entries j on j.id=jl.journal_entry_id where j.company_id='${COMPANY}'`);
W(`union all select 'gl_1200', round(coalesce(sum(jl.debit-jl.credit),0),2) from journal_lines jl join journal_entries j on j.id=jl.journal_entry_id join accounts a on a.id=jl.account_id where j.company_id='${COMPANY}' and a.code='1200'`);
W(`union all select 'inv_val', round(sum(quantity_on_hand*cost_price),2) from products where company_id='${COMPANY}' and track_inventory`);
W(`union all select 'je_count', count(*) from journal_entries where company_id='${COMPANY}'`);
W(`union all select 'je_counter', next_value from journal_number_counters where company_id='${COMPANY}';`);
W(``);
// ── shared FK-safe teardown for the seed batch (used by BOTH the idempotency block and the rollback) ──
// Order is a topological delete: every NO-ACTION child before its parent; cross-link cycles broken first.
const SEED_CYCLE_BREAKERS=[
  `update purchase_orders set bill_id = null where company_id='${COMPANY}' and id::text like '5eed0000-0000-4000-8000-60%';`,
  `update fixed_assets set source_bill_id = null, journal_entry_id = null, disposal_journal_entry_id = null where company_id='${COMPANY}' and id::text like '5eed0000-0000-4000-8000-08%';`,
  `update bank_statement_lines set matched_bank_transaction_id = null where company_id='${COMPANY}' and id::text like '5eed0000-0000-4000-8000-f1%';`,
];
const SEED_DELETES=[
  `delete from bank_transactions     where company_id='${COMPANY}' and id::text like '5eed0000-0000-4000-8000-f2%';`,
  `delete from bank_statement_lines  where company_id='${COMPANY}' and id::text like '5eed0000-0000-4000-8000-f1%';`,
  `delete from reconciliations       where company_id='${COMPANY}' and id::text like '5eed0000-0000-4000-8000-f3%';`,
  `delete from bank_statements       where company_id='${COMPANY}' and id::text like '5eed0000-0000-4000-8000-f0%';`,
  `delete from inventory_transaction_log where company_id='${COMPANY}' and id::text like '5eed0000-0000-4000-8000-0a%';`,
  `delete from stock_movements       where company_id='${COMPANY}' and id::text like '5eed0000-0000-4000-8000-e0%';`,
  `delete from depreciation_entries  where company_id='${COMPANY}' and id::text like '5eed0000-0000-4000-8000-09%';`,
  `delete from credit_note_lines     where company_id='${COMPANY}' and id::text like '5eed0000-0000-4000-8000-41%';`,
  `delete from credit_notes          where company_id='${COMPANY}' and id::text like '5eed0000-0000-4000-8000-40%';`,
  `delete from supplier_return_lines where company_id='${COMPANY}' and id::text like '5eed0000-0000-4000-8000-81%';`,
  `delete from supplier_returns      where company_id='${COMPANY}' and id::text like '5eed0000-0000-4000-8000-80%';`,   // before bills: supplier_returns.bill_id -> bills
  `delete from invoice_lines         where company_id='${COMPANY}' and id::text like '5eed0000-0000-4000-8000-31%';`,
  `delete from invoices              where company_id='${COMPANY}' and id::text like '5eed0000-0000-4000-8000-30%';`,
  `delete from bill_lines            where company_id='${COMPANY}' and id::text like '5eed0000-0000-4000-8000-71%';`,
  `delete from bills                 where company_id='${COMPANY}' and id::text like '5eed0000-0000-4000-8000-70%';`,
  `delete from purchase_order_lines  where company_id='${COMPANY}' and id::text like '5eed0000-0000-4000-8000-61%';`,
  `delete from purchase_orders       where company_id='${COMPANY}' and id::text like '5eed0000-0000-4000-8000-60%';`,
  `delete from sales_orders          where company_id='${COMPANY}' and id::text like '5eed0000-0000-4000-8000-20%';`,
  `delete from quotes                where company_id='${COMPANY}' and id::text like '5eed0000-0000-4000-8000-10%';`,
  `delete from customer_receipts     where company_id='${COMPANY}' and id::text like '5eed0000-0000-4000-8000-50%';`,
  `delete from payments              where company_id='${COMPANY}' and id::text like '5eed0000-0000-4000-8000-90%';`,
  `delete from stock_adjustment_lines where company_id='${COMPANY}' and id::text like '5eed0000-0000-4000-8000-a1%';`,
  `delete from stock_adjustments     where company_id='${COMPANY}' and id::text like '5eed0000-0000-4000-8000-a0%';`,
  `delete from stock_take_lines      where company_id='${COMPANY}' and id::text like '5eed0000-0000-4000-8000-b1%';`,
  `delete from stock_takes           where company_id='${COMPANY}' and id::text like '5eed0000-0000-4000-8000-b0%';`,
  `delete from stock_transfer_lines  where company_id='${COMPANY}' and id::text like '5eed0000-0000-4000-8000-c1%';`,
  `delete from stock_transfers       where company_id='${COMPANY}' and id::text like '5eed0000-0000-4000-8000-c0%';`,
  `delete from fixed_assets          where company_id='${COMPANY}' and id::text like '5eed0000-0000-4000-8000-08%';`,
  `delete from journal_lines where journal_entry_id in (select id from journal_entries where company_id='${COMPANY}' and id::text like '5eed0000-0000-4000-8000-d0%');`,
  `delete from journal_entries       where company_id='${COMPANY}' and id::text like '5eed0000-0000-4000-8000-d0%';`,   // LAST: every document above FKs to journal_entries
  `delete from stock_balances where company_id='${COMPANY}' and warehouse_id='${WH_JHB}';`,
  `delete from warehouses where company_id='${COMPANY}' and id='${WH_JHB}';`,
  `delete from suppliers  where company_id='${COMPANY}' and id='${SUP_BOLAND}';`,
];

W(`-- idempotency: remove any prior run of THIS batch (deterministic id prefix) - FK-safe topological order`);
W(`-- (a) break cross-link / back-ref FK cycles on any prior seed rows`);
for(const s of SEED_CYCLE_BREAKERS) W(s);
W(`update bank_transactions set bank_statement_line_id = null, reconciliation_id = null where company_id='${COMPANY}' and id in (${AUG.priorRows.map(x=>`'${x.bt}'`).join(',')});`);
W(`update bank_transactions set status = 'unreconciled' where company_id='${COMPANY}' and id in ('${AUG.clearing[0].bt}','${AUG.clearing[1].bt}');`);
W(`-- (b) delete children -> parents`);
for(const s of SEED_DELETES) W(s);
W(``);

// 1. master data
W(`-- 1. master data`);
W(`insert into warehouses (id,company_id,name,code,is_default,status,address) values`);
W(`  ('${WH_JHB}','${COMPANY}','Johannesburg Satellite Branch - Midrand','WH-JHB',false,'active',${jb({line1:'Building C, Midrand Business Park',city:'Midrand',province:'Gauteng',postalCode:'1685',country:'ZA'})});`);
W(`insert into suppliers (id,company_id,supplier_number,name) values ('${SUP_BOLAND}','${COMPANY}','ONS-014','Boland Auto & Truck (Pty) Ltd');`);
W(``);

// 1b. journal_entries + journal_lines  (POSTED FIRST - every document below carries a journal_entry_id FK)
W(`-- 1b. journal_entries + journal_lines  (JE-${JE_START} .. JE-${JE_START+journals.length-1}) - posted before all documents, which FK to these`);
for(const j of journals){
  W(`insert into journal_entries (id,company_id,entry_number,date,memo,status,posted_at,currency,source) values`);
  W(`  ('${j.id}','${COMPANY}','${j.n}','${j.date}',${q(j.memo)},'posted','${j.date}','ZAR','${j.source}');`);
  W(`insert into journal_lines (id,journal_entry_id,company_id,account_id,debit,credit,line_no) values`);
  W(`  ${j.lines.map((l,li)=>`('${l.id}','${j.id}','${COMPANY}','${acId(l.code)}',${N(l.dr)},${N(l.cr)},${li})`).join(',\n  ')};`);
}
W(`update journal_number_counters set next_value = ${JE_START+journals.length}, updated_at = now() where company_id='${COMPANY}';`);
W(``);

// helper: jsonb line array for a doc
function jsonLines(kind, docnum, lineData, taxOf){
  return lineData.map((ld,ix)=>({
    id: lineId(kind, docnum, ld.i!=null?`L${ld.i}`:`L${ix+1}`),
    quantity: ld.qty,
    lineTotal: r2(ld.lineTotal),
    productId: ld.sku? PID[ld.sku] : null,
    taxAmount: r2(ld.vat),
    taxRateId: ld.tax,
    unitPrice: ld.unit,
    description: ld.sku? SKUNAME[ld.sku]||ld.sku : ld.desc,
  }));
}

// 2. quotes / sales orders / purchase orders (no GL/stock)
W(`-- 2. quotes / sales orders / purchase orders (no GL, no stock movement)`);
for(const qo of D.quotes){ const id=docId('quo',qo.n); const lid=lineId('qln',qo.n,'L1'); const ex=r2(qo.total/1.15), vat=r2(qo.total-ex);
  const li=[{id:lid,quantity:1,lineTotal:ex,productId:null,taxAmount:vat,taxRateId:T_STD,unitPrice:ex,description:'Quoted goods & delivery'}];
  W(`insert into quotes (id,company_id,quote_number,customer_id,issue_date,expiry_date,line_items,subtotal,tax_total,total,status,currency) values`);
  W(`  ('${id}','${COMPANY}','${qo.n}','${CUST[qo.cust]}','${qo.date}','${qo.expiry}',${jb(li)},${N(ex)},${N(vat)},${N(qo.total)},'${qo.status}','ZAR');`);
}
for(const so of D.salesOrders){ const id=docId('so',so.n); const lid=lineId('sln',so.n,'L1');
  const inv= so.toInv? D.invoices.find(i=>i.n===so.toInv):null;
  const ex= inv? inv.ex : 0, vat= inv? inv.vat : 0, tot= inv? inv.total : 0;
  const li= inv? inv.lineData.map((ld,ix)=>({id:lineId('sln',so.n,`L${ix+1}`),quantity:ld.qty,lineTotal:r2(ld.lineTotal),productId:ld.sku?PID[ld.sku]:null,taxAmount:r2(ld.vat),taxRateId:ld.tax,unitPrice:ld.unit,description:ld.sku?SKUNAME[ld.sku]||ld.sku:ld.desc})) : [{id:lid,quantity:1,lineTotal:0,productId:null,taxAmount:0,taxRateId:T_STD,unitPrice:0,description:'Ordered goods'}];
  W(`insert into sales_orders (id,company_id,order_number,customer_id,${so.quote?'quote_id,':''}order_date,line_items,subtotal,tax_total,total,status,currency) values`);
  W(`  ('${id}','${COMPANY}','${so.n}','${CUST[so.cust]}',${so.quote?`'${docId('quo',so.quote)}',`:''}'${so.date}',${jb(li)},${N(ex)},${N(vat)},${N(tot)},'${so.status}','ZAR');`);
}
for(const po of D.purchaseOrders){ const id=docId('po',po.n);
  const bill= po.toBill? D.bills.find(b=>b.n===po.toBill):null;
  const src= bill? bill : STOCK_BILLS.find(b=>b.n==='BILL-2032'); // PO-0004 open -> Sappi paper
  let li,ex,vat,tot;
  if(bill){ li=bill.lineData.map((ld,ix)=>({id:lineId('pln',po.n,`L${ix+1}`),quantity:ld.qty,lineTotal:r2(ld.lineTotal),productId:PID[ld.sku],taxAmount:r2(ld.vat),taxRateId:T_STD,unitPrice:ld.unit,description:SKUNAME[ld.sku]||ld.sku,sku:ld.sku})); ex=bill.ex; vat=bill.vat; tot=bill.total; }
  else { li=[{id:lineId('pln',po.n,'L1'),quantity:150,lineTotal:34500,productId:PID['STA-001'],taxAmount:5175,taxRateId:T_STD,unitPrice:230,description:SKUNAME['STA-001'],sku:'STA-001'}]; ex=34500; vat=5175; tot=39675; }
  // bill_id is a forward FK (bills are inserted in section 3) -> insert PO without it, link in section 3b (matches the app lifecycle)
  W(`insert into purchase_orders (id,company_id,po_number,supplier_id,order_date,expected_date,line_items,subtotal,tax_total,total,status,currency${bill?',received_date':''}) values`);
  W(`  ('${id}','${COMPANY}','${po.n}','${SUP[po.sup]}','${po.date}','2026-09-12',${jb(li.map(({sku,...x})=>x))},${N(ex)},${N(vat)},${N(tot)},'${po.status}','ZAR'${bill?`,'${bill.date}'`:''});`);
  li.forEach((l,ix)=>W(`insert into purchase_order_lines (id,company_id,purchase_order_id,line_number,product_id,warehouse_id,description,quantity,unit_price,tax_rate_id,tax_amount,line_total) values\n  ('${l.id}','${COMPANY}','${id}',${ix+1},${l.productId?`'${l.productId}'`:'null'},'${WH_CPT}',${q(l.description)},${l.quantity},${N(l.unitPrice)},'${T_STD}',${N(l.taxAmount)},${N(l.lineTotal)});`));
}
W(``);

// 3. bills + bill_lines
W(`-- 3. bills (jsonb line_items) + bill_lines (normalized projection — identical line ids)`);
for(const b of D.bills){ const id=docId('bill',b.n);
  const isStock= !!b.lineData;
  const isFA= b.n==='BILL-2045';
  const isExp= !isStock && !isFA;
  let li, sub, vat, tot, paid, status;
  if(isStock){ li=jsonLines('bln',b.n,b.lineData); sub=b.ex; vat=b.vat; tot=b.total; }
  else if(isFA){ li=[{id:lineId('bln',b.n,'L1'),quantity:1,lineTotal:b.ex,productId:null,taxAmount:b.vat,taxRateId:T_STD,unitPrice:b.ex,description:b.name,fixedAssetDetails:{category:'motor_vehicles',residualValue:b.residual,usefulLifeYears:b.life,depreciationMethod:'straight_line'}}]; sub=b.ex; vat=b.vat; tot=b.total; }
  else { li=[{id:lineId('bln',b.n,'L1'),quantity:1,lineTotal:b.ex,productId:null,taxAmount:b.vat,taxRateId: b.vat>0?T_STD:T_ZERO,unitPrice:b.ex,description:b.desc}]; sub=b.ex; vat=b.vat; tot=b.total; }
  // paid amount from payments
  paid=r2(S(D.payments.flatMap(p=>p.allocLines.filter(a=>a.bill===b.n).map(a=>a.amount))));
  // supplier return reduces bill? SRET-0001 vs BILL-2030 — AP reduced but bill.amount_paid untouched (return is separate)
  status= paid<=0? (isStock||isFA?'awaiting_payment':'awaiting_payment') : paid>=tot-0.005? 'paid' : 'partially_paid';
  const supId= isFA? SUP_BOLAND : SUP[b.sup];
  W(`insert into bills (id,company_id,bill_number,supplier_id,${b.po?'purchase_order_id,':''}issue_date,due_date,line_items,subtotal,tax_total,total,amount_paid,currency,status,journal_entry_id) values`);
  W(`  ('${id}','${COMPANY}','${b.n}','${supId}',${b.po?`'${docId('po',b.po)}',`:''}'${b.date}','${b.due}',${jb(li)},${N(sub)},${N(vat)},${N(tot)},${N(paid)},'ZAR','${status}','${jeById[b.je].id}');`);
  // normalized bill_lines
  li.forEach((l,ix)=>{
    const ld= b.lineData? b.lineData[ix] : null;
    W(`insert into bill_lines (id,company_id,bill_id,line_number,product_id,warehouse_id,description,quantity,unit_price,tax_rate_id,tax_amount,line_total${isFA?',fixed_asset_details':''}) values`);
    W(`  ('${l.id}','${COMPANY}','${id}',${ix+1},${l.productId?`'${l.productId}'`:'null'},${l.productId?`'${WH_CPT}'`:'null'},${q(l.description)},${l.quantity},${N(l.unitPrice)},${l.taxRateId?`'${l.taxRateId}'`:'null'},${N(l.taxAmount)},${N(l.lineTotal)}${isFA?`,${jb(li[0].fixedAssetDetails)}`:''});`);
  });
}
W(``);

// 3b. link purchase_orders -> bills  (bill created with purchase_order_id, THEN PO.bill_id set - src/features/purchases/pages/PurchaseOrdersPage.tsx:77)
for(const po of D.purchaseOrders){ if(!po.toBill) continue;
  W(`update purchase_orders set bill_id='${docId('bill',po.toBill)}', updated_at=now() where company_id='${COMPANY}' and id='${docId('po',po.n)}' and bill_id is null;`);
}
W(``);

// 4. invoices + invoice_lines
W(`-- 4. invoices + invoice_lines`);
for(const inv of D.invoices){ const id=docId('inv',inv.n);
  const li=inv.lineData.map((ld,ix)=>({id:lineId('iln',inv.n,`L${ix+1}`),quantity:ld.qty,lineTotal:r2(ld.lineTotal),productId:ld.sku?PID[ld.sku]:null,taxAmount:r2(ld.vat),taxRateId:ld.tax,unitPrice:ld.unit,description:ld.sku?SKUNAME[ld.sku]||ld.sku:ld.desc}));
  const recPaid=r2(S(D.receipts.flatMap(r=>r.allocLines.filter(a=>a.invoice===inv.n).map(a=>a.amount))));
  const cnPaid=r2(S(D.creditNotes.filter(cn=>cn.allocTo===inv.n).map(cn=>cn.allocAmt)));
  const paid=r2(recPaid+cnPaid);
  const status= paid<=0? 'sent' : paid>=inv.total-0.005? 'paid' : 'partially_paid';
  W(`insert into invoices (id,company_id,invoice_number,customer_id,${inv.so?'sales_order_id,':''}issue_date,due_date,line_items,subtotal,tax_total,total,amount_paid,currency,status,journal_entry_id) values`);
  W(`  ('${id}','${COMPANY}','${inv.n}','${CUST[inv.cust]}',${inv.so?`'${docId('so',inv.so)}',`:''}'${inv.date}','${inv.due}',${jb(li)},${N(inv.ex)},${N(inv.vat)},${N(inv.total)},${N(paid)},'ZAR','${status}','${jeById[inv.je].id}');`);
  li.forEach((l,ix)=>{ const ld=inv.lineData[ix];
    W(`insert into invoice_lines (id,company_id,invoice_id,line_number,product_id,warehouse_id,description,quantity,unit_price,tax_rate_id,tax_amount,line_total) values`);
    W(`  ('${l.id}','${COMPANY}','${id}',${ix+1},${l.productId?`'${l.productId}'`:'null'},${l.productId?`'${WH_CPT}'`:'null'},${q(l.description)},${l.quantity},${N(l.unitPrice)},'${l.taxRateId}',${N(l.taxAmount)},${N(l.lineTotal)});`);
  });
}
W(``);

// 5. credit notes + credit_note_lines
W(`-- 5. credit notes + credit_note_lines`);
for(const cn of D.creditNotes){ const id=docId('cn',cn.n);
  const isRet= cn.reason==='return';
  const lid=lineId('cln',cn.n,'L1');
  const li= isRet
    ? [{id:lid,quantity:cn.qty,lineTotal:cn.ex,productId:PID[cn.sku],taxAmount:cn.vat,taxRateId:T_STD,unitPrice:cn.exUnit,description:SKUNAME[cn.sku],originalInvoiceLineId: lineId('iln',cn.invoice,'L1')}]
    : [{id:lid,quantity:1,lineTotal:cn.ex,productId:null,taxAmount:cn.vat,taxRateId:T_STD,unitPrice:cn.ex,description:'Price adjustment — '+cn.invoice}];
  const alloc = cn.allocTo ? [{invoiceId: docId('inv',cn.allocTo), amount: r2(cn.allocAmt), allocatedAt: `${cn.date}T12:00:00+00:00`}] : [];
  const cnStatus = cn.allocTo && r2(cn.allocAmt) >= r2(cn.total)-0.005 ? 'allocated' : 'issued';
  W(`insert into credit_notes (id,company_id,credit_note_number,customer_id,invoice_id,issue_date,reason,line_items,subtotal,tax_total,total,amount_allocated,allocations,currency,status,journal_entry_id) values`);
  W(`  ('${id}','${COMPANY}','${cn.n}','${CUST[cn.cust]}','${docId('inv',cn.invoice)}','${cn.date}','${cn.reason}',${jb(li)},${N(cn.ex)},${N(cn.vat)},${N(cn.total)},${N(cn.allocTo?cn.allocAmt:0)},${jb(alloc)},'ZAR','${cnStatus}','${jeById[cn.je].id}');`);
  W(`insert into credit_note_lines (id,company_id,credit_note_id,line_number,product_id,warehouse_id,description,quantity,unit_price,tax_rate_id,tax_amount,line_total,original_invoice_line_id) values`);
  W(`  ('${lid}','${COMPANY}','${id}',1,${li[0].productId?`'${li[0].productId}'`:'null'},${isRet?`'${WH_CPT}'`:'null'},${q(li[0].description)},${li[0].quantity},${N(li[0].unitPrice)},'${T_STD}',${N(li[0].taxAmount)},${N(li[0].lineTotal)},${isRet?`'${li[0].originalInvoiceLineId}'`:'null'});`);
}
W(``);

// 6. fixed asset + depreciation entries
W(`-- 6. fixed_assets (FA-006, capitalised from BILL-2045) + September depreciation entries`);
{ const fa=D.fixedAssets[0]; const id=U('fa',1); IDS.fa['FA-006']=id;
  W(`insert into fixed_assets (id,company_id,asset_number,name,description,category,acquisition_date,cost,residual_value,useful_life_years,depreciation_method,gl_asset_account_id,gl_accumulated_depreciation_account_id,gl_depreciation_expense_account_id,accumulated_depreciation,status,journal_entry_id,source_bill_id) values`);
  W(`  ('${id}','${COMPANY}','FA-006',${q(fa.name)},${q('Second-hand delivery vehicle — capitalised from '+fa.sourceBill)},'motor_vehicles','${fa.date}',${N(fa.cost)},${N(fa.residual)},${fa.life},'straight_line','${ACC[1500]}','${ACC[1590]}','${ACC[5200]}',${N(D.depreciation.entries.find(e=>e.asset==='FA-006').amount)},'active','${jeById[D.bills.find(b=>b.n===fa.sourceBill).je].id}','${docId('bill',fa.sourceBill)}');`);
}
{ const LIVEFA={ 'FA-001':'live','FA-002':'live','FA-003':'live','FA-004':'live','FA-005':'live' };
  W(`-- (existing FA-001..FA-005 ids resolved by asset_number at run time)`);
  D.depreciation.entries.forEach((e,ix)=>{ const id=U('dep',ix+1); IDS.dep[e.asset]=id;
    const faRef= e.asset==='FA-006'? `'${IDS.fa['FA-006']}'` : `(select id from fixed_assets where company_id='${COMPANY}' and asset_number='${e.asset}')`;
    W(`insert into depreciation_entries (id,company_id,asset_id,period_end,amount,accumulated_depreciation_after,carrying_value_after,journal_entry_id) values`);
    W(`  ('${id}','${COMPANY}',${faRef},'2026-09-30',${N(e.amount)},${N(e.accumAfter)},${N(e.carryingAfter)},'${jeById[D.depreciation.je].id}');`);
  });
  W(`-- set FA-001..005 accumulated depreciation to the ABSOLUTE post-September value (idempotent)`);
  W(`update fixed_assets set accumulated_depreciation = v.accum, status = 'active', updated_at = now() from (values`);
  W(`  ${D.depreciation.entries.filter(e=>e.asset!=='FA-006').map(e=>`('${e.asset}',${N(e.accumAfter)}::numeric)`).join(', ')}`);
  W(`) as v(num,accum) where fixed_assets.company_id='${COMPANY}' and fixed_assets.asset_number = v.num;`);
}
W(``);

// 7. journal_entries + journal_lines are emitted in section 1b ABOVE — before any document that
//    carries a journal_entry_id FK (bills, invoices, credit_notes, fixed_assets, depreciation_entries).

// 8. stock movements
W(`-- 8. stock_movements (append-only; unit_cost 4dp, total_cost 2dp — engine contract)`);
for(const m of movements){
  W(`insert into stock_movements (id,company_id,product_id,warehouse_id,type,quantity_delta,unit_cost,total_cost,movement_date,source_document_type,source_document_id,source_document_line_id,created_by,reference) values`);
  W(`  ('${m.id}','${COMPANY}','${PID[m.sku]}','${m.wh}','${m.type}',${m.qty},${m.unit_cost.toFixed(4)},${N(m.total_cost)},'${m.date}',${q(m.st)},${m.docId?`'${m.docId}'`:'null'},${m.lineId?`'${m.lineId}'`:'null'},'seed:september-2026',${q(`${m.st}:${m.docId||m.sid}`)});`);
}
W(``);

// 9. inventory_transaction_log
W(`-- 9. inventory_transaction_log (one row per posting-key: movement_ids + journal_entry_id)`);
{ const groups={};
  for(const m of movements){ const kind=SRC_KIND[m.st]; if(!kind) continue;
    let verb;
    if(m.st==='credit_note') verb='issue';
    else if(m.st==='stock_transfer'){ const t=D.stockTransfers.find(t=>t.n===m.sid);
      verb= t.kind==='immediate' ? 'complete' : (m.type==='transfer_out' ? 'dispatch' : 'receive'); }
    else verb='post';
    const key=`${m.st}:${m.docId}:${verb}`;
    (groups[key]=groups[key]||{st:m.st,docId:m.docId,sid:m.sid,verb,mv:[]}).mv.push(m.id);
  }
  Object.values(groups).forEach((g,ix)=>{ const id=U('itl',ix+1);
    // journal entry for this posting
    let jeN2;
    if(g.st==='stock_transfer'){ const t=D.stockTransfers.find(t=>t.n===g.sid); jeN2= g.verb==='dispatch'? t.jeDispatch : g.verb==='receive'? t.jeReceipt : null; }
    else { const dmap={bill:D.bills,invoice:D.invoices,credit_note:D.creditNotes,supplier_return:D.supplierReturns,stock_adjustment:D.stockAdjustments,stock_take:D.stockTakes}; jeN2=(dmap[g.st].find(x=>x.n===g.sid)).je; }
    W(`insert into inventory_transaction_log (id,company_id,posting_key,source_type,source_id,kind,journal_entry_id,movement_ids,created_by) values`);
    W(`  ('${id}','${COMPANY}',${q(`${g.st}:${g.docId}:${g.verb}`)},${q(g.st)},'${g.docId}','${g.verb==='dispatch'||g.verb==='receive'?'post':'post'}',${jeN2?`'${jeById[jeN2].id}'`:'null'},array[${g.mv.map(x=>`'${x}'`).join(',')}]::uuid[],'seed:september-2026');`);
  });
}
W(``);

// 10. inventory documents (adj / take / transfer / supplier return)
W(`-- 10. inventory documents`);
{ const a=D.stockAdjustments[0]; const id=docId('adj',a.n); const lid=lineId('adl',a.n,'L1');
  W(`insert into stock_adjustments (id,company_id,adjustment_number,warehouse_id,adjustment_date,reason,notes,total_cost_effect,status,posted_by,posted_at,journal_entry_id) values`);
  W(`  ('${id}','${COMPANY}','${a.n}','${WH_CPT}','${a.date}','write_off','Water damage — storeroom roof leak, stock unsaleable',${N(a.costEffect)},'posted','seed:september-2026','${a.date}','${jeById[a.je].id}');`);
  W(`insert into stock_adjustment_lines (id,company_id,stock_adjustment_id,line_number,product_id,warehouse_id,quantity_delta,unit_cost,cost_effect,notes) values`);
  W(`  ('${lid}','${COMPANY}','${id}',1,'${PID[a.sku]}','${WH_CPT}',${a.qty},${a.unit.toFixed(4)},${N(a.costEffect)},'Water-damaged A3 copier paper');`);
}
{ const t=D.stockTakes[0]; const id=docId('stk',t.n);
  W(`insert into stock_takes (id,company_id,stock_take_number,warehouse_id,scope,count_date,frozen_at,total_variance_value,status,posted_by,posted_at,journal_entry_id) values`);
  W(`  ('${id}','${COMPANY}','${t.n}','${WH_CPT}','all','${t.date}','${t.date}T06:00:00+00:00',${N(t.netVarianceValue)},'posted','seed:september-2026','${t.date}','${jeById[t.je].id}');`);
  W(`-- 48 frozen count lines (expected_qty = WH-CPT balance at freeze; unit_cost = frozen WAC; 2 non-zero variances)`);
  const varMap=Object.fromEntries(t.variances);
  let ln=0;
  for(const sku of Object.keys(OPEN).sort()){ ln++; const fr=t.frozen[sku]; const dv=varMap[sku]||0; const counted=r4(fr.expected+dv);
    const lid=lineId('stl',t.n, dv!==0?`L-${sku}`:`L${ln}`);
    W(`insert into stock_take_lines (id,company_id,stock_take_id,line_number,product_id,warehouse_id,expected_qty,counted_qty,unit_cost,variance_qty,variance_value${dv!==0?',reason':''}) values`);
    W(`  ('${lid}','${COMPANY}','${id}',${ln},'${PID[sku]}','${WH_CPT}',${fr.expected},${counted},${fr.unit.toFixed(4)},${dv},${N(dv*fr.unit)}${dv!==0?`,${q(dv>0?'Count over — mis-picked from adjacent bin':'Count short — breakage not previously logged')}`:''});`);
  }
}
for(const t of D.stockTransfers){ const id=docId('trf',t.n); const lid=lineId('trl',t.n,'L1'); const l=t.lines[0];
  W(`insert into stock_transfers (id,company_id,transfer_number,from_warehouse_id,to_warehouse_id,transfer_date,${t.received?'received_date,':''}notes,total_cost,status${t.jeDispatch?',dispatched_journal_entry_id':''}${t.jeReceipt?',received_journal_entry_id':''}) values`);
  W(`  ('${id}','${COMPANY}','${t.n}','${WH_CPT}','${WH_JHB}','${t.date}',${t.received?`'${t.received}',`:''}${q(t.kind==='immediate'?'Immediate branch top-up — Midrand counter stock':'Bulk shredder stock relocation to Midrand — in-transit tracked')},${N(l.total)},'completed'${t.jeDispatch?`,'${jeById[t.jeDispatch].id}'`:''}${t.jeReceipt?`,'${jeById[t.jeReceipt].id}'`:''});`);
  W(`insert into stock_transfer_lines (id,company_id,stock_transfer_id,line_number,product_id,quantity,unit_cost,total_cost) values`);
  W(`  ('${lid}','${COMPANY}','${id}',1,'${PID[l.sku]}',${l.qty},${l.unit_cost.toFixed(4)},${N(l.total)});`);
}
{ const s=D.supplierReturns[0]; const id=docId('sret',s.n); const lid=lineId('srl',s.n,'L1');
  W(`insert into supplier_returns (id,company_id,return_number,supplier_id,bill_id,return_date,reason,subtotal,tax_total,total,status,journal_entry_id,notes) values`);
  W(`  ('${id}','${COMPANY}','${s.n}','${SUP[s.sup]}','${docId('bill',s.bill)}','${s.date}','Faulty on arrival — MFP fuser unit',${N(s.ex)},${N(s.vat)},${N(s.total)},'posted','${jeById[s.je].id}','Faulty MFP fuser unit returned to PrintTech at booked cost (WAC R8,000). Debit note ${s.n} — R9,200.00 (incl VAT) recoverable from PrintTech; BILL-2030 remains fully paid, so PrintTech carries a R9,200.00 debit balance pending refund or offset against a future bill.');`);
  W(`insert into supplier_return_lines (id,company_id,supplier_return_id,line_number,product_id,warehouse_id,description,quantity,unit_price,tax_rate_id,tax_amount,line_total) values`);
  W(`  ('${lid}','${COMPANY}','${id}',1,'${PID[s.sku]}','${WH_CPT}',${q(SKUNAME[s.sku])},${s.qty},${N(s.unitPrice)},'${T_STD}',${N(s.vat)},${N(s.ex)});`);
}
W(``);

// 11. customer receipts + payments
W(`-- 11. customer_receipts + payments (JE already posted above; allocations bump invoice/bill amount_paid handled inline)`);
for(const rc of D.receipts){ const id=docId('rec',rc.n);
  const alloc=rc.allocLines.map(a=>({invoiceId:docId('inv',a.invoice),amount:a.amount}));
  W(`insert into customer_receipts (id,company_id,receipt_number,customer_id,bank_account_id,date,method,amount,allocations,unallocated_amount,currency,journal_entry_id) values`);
  W(`  ('${id}','${COMPANY}','${rc.n}','${CUST[rc.cust]}','${BANK}','${rc.date}','${rc.method}',${N(rc.amount)},${jb(alloc)},${N(rc.unallocated)},'ZAR','${jeById[rc.je].id}');`);
}
for(const p of D.payments){ const id=docId('pay',p.n);
  const alloc=p.allocLines.map(a=>({billId:docId('bill',a.bill),amount:a.amount}));
  W(`insert into payments (id,company_id,payment_number,supplier_id,bank_account_id,date,method,amount,allocations,unallocated_amount,currency,journal_entry_id) values`);
  W(`  ('${id}','${COMPANY}','${p.n}','${SUP[p.sup]}','${BANK}','${p.date}','${p.method}',${N(p.amount)},${jb(alloc)},0,'ZAR','${jeById[p.je].id}');`);
}
W(``);

// 12. bank statement + lines + transactions + reconciliation  (CONTINUATION reconciliation, Option A)
W(`-- 12. bank_statements + bank_statement_lines + bank_transactions + reconciliations`);
W(`--     September is a CONTINUATION reconciliation. Opening = ON-AUG-2026.closing_balance (statement`);
W(`--     continuity). PAY-2004 & REC-1001 are the August C2a/C2b timing items clearing here; the 5 booked`);
W(`--     receipts REC-1008/1009/1027 get their statement lines. August's C3-C12 remain OPEN on ON-AUG-2026`);
W(`--     and are carried as ONE R${f2(AUG_BF)} brought-forward reconciling line. August fixture is NOT touched.`);
const bsId=U('bs',1);
const reconUuid=U('recn',1);
const orderedNew=[...onStmt].sort((a,b)=> a.date<b.date?-1:a.date>b.date?1:0);
// ordered statement lines: 7 pre-existing (linked to existing bank_transactions) then new-seed activity
const priorRowsSql=AUG.priorRows.map(x=>({kind:'prior',date:x.date,dir:x.dir,amt:x.amt,desc:x.desc,ref:x.ref,bt:x.bt}));
const newRowsSql=orderedNew.map(b=>({kind:'new',date:b.date,dir:b.dir,amt:b.amount,desc:b.desc,ref:jeById[b.je].n,je:jeById[b.je],cat:b.category}));
const stmtRows=[...priorRowsSql,...newRowsSql];
const nLines=stmtRows.length+1;
const clearedBt=[];  // bank_transaction ids on the September reconciliation
W(`insert into bank_statements (id,company_id,bank_account_id,reference,source_format,period_start,period_end,opening_balance,closing_balance,currency,line_count,import_status,reconciliation_status,balance_check_ok,imported_by,notes)`);
W(`select '${bsId}','${COMPANY}','${BANK}','ON-SEP-2026','manual','2026-09-01','2026-09-30',`);
W(`  a.closing_balance, ${f2(stmtClose)}, 'ZAR', ${nLines}, 'imported', 'reconciled', true, 'seed:september-2026',`);
W(`  'September continuation reconciliation. Opening = ON-AUG-2026 closing (statement continuity). PAY-2004 & REC-1001 are the August C2a/C2b timing items clearing here. August C3-C12 remain open on ON-AUG-2026; carried as a R${f2(AUG_BF)} brought-forward reconciling line. Reconciliation variance R0.00.'`);
W(`from bank_statements a where a.company_id='${COMPANY}' and a.reference='${AUG.stmtRef}' and round(a.closing_balance,2) = ${f2(AUG.closing)};`);
// NOTE circular non-deferrable FKs: bank_transactions.bank_statement_line_id -> bank_statement_lines(id)
//   AND bank_statement_lines.matched_bank_transaction_id -> bank_transactions(id).  Insert one side with
//   the cross-ref NULL, then backfill.  reconciliation_id is set in a final pass after the reconciliations row.
let seq=0, running=r2(AUG.closing);
for(const rw of stmtRows){
  seq++;
  running=r2(running + (rw.dir==='debit'? rw.amt : -rw.amt));
  const bslId=U('bsl',++c.bsl);
  if(rw.kind==='prior'){
    clearedBt.push(rw.bt);
    // the bank_transaction already exists -> line can reference it immediately
    W(`insert into bank_statement_lines (id,company_id,bank_statement_id,bank_account_id,sequence,txn_date,description,reference,external_ref_id,amount,direction,running_balance,line_state,matched_bank_transaction_id,raw_source) values`);
    W(`  ('${bslId}','${COMPANY}','${bsId}','${BANK}',${seq},'${rw.date}',${q(rw.desc)},'${rw.ref}','${rw.ref}',${f2(rw.amt)},'${rw.dir}',${f2(running)},'matched','${rw.bt}',${jb({source:'seed:september-2026',link:'pre-existing bank_transaction cleared on the September statement',bank_transaction_id:rw.bt})});`);
    W(`update bank_transactions set status='reconciled', bank_statement_line_id='${bslId}', updated_at=now()`);
    W(`  where company_id='${COMPANY}' and id='${rw.bt}' and reference='${rw.ref}' and round(amount,2)=${f2(rw.amt)} and direction='${rw.dir}';`);
  } else {
    const btId=U('bt',++c.bt); IDS.bt[rw.je.n+':'+rw.desc]=btId; clearedBt.push(btId);
    // line first (matched_bank_transaction_id null), then bt referencing the line, then backfill the line
    W(`insert into bank_statement_lines (id,company_id,bank_statement_id,bank_account_id,sequence,txn_date,description,reference,external_ref_id,amount,direction,running_balance,line_state,raw_source) values`);
    W(`  ('${bslId}','${COMPANY}','${bsId}','${BANK}',${seq},'${rw.date}',${q(rw.desc)},'${rw.je.n}','${rw.je.n}',${f2(rw.amt)},'${rw.dir}',${f2(running)},'matched',${jb({source:'seed:september-2026',matched:true})});`);
    W(`insert into bank_transactions (id,company_id,bank_account_id,date,description,reference,amount,direction,status,category,source,journal_entry_id,bank_statement_line_id,allocations) values`);
    W(`  ('${btId}','${COMPANY}','${BANK}','${rw.date}',${q(rw.desc)},'${rw.je.n}',${f2(rw.amt)},'${rw.dir}','reconciled',${q(rw.cat)},'manual','${rw.je.id}','${bslId}','[]'::jsonb);`);
    W(`update bank_statement_lines set matched_bank_transaction_id='${btId}' where id='${bslId}' and company_id='${COMPANY}';`);
  }
}
// timing bank_transactions — in the books, NOT on the September statement (deposits in transit + unpresented)
const timingBt={};
for(const b of D.bankLines.filter(x=>!x.onStmt)){
  const btId=U('bt',++c.bt); const je=jeById[b.je];
  const ref=(b.desc.match(/(REC|PAY)-\d+/)||[b.je])[0]; timingBt[ref]=btId;
  W(`insert into bank_transactions (id,company_id,bank_account_id,date,description,reference,amount,direction,status,category,source,journal_entry_id,allocations) values`);
  W(`  ('${btId}','${COMPANY}','${BANK}','${b.date}',${q(b.desc+' (in transit at month-end)')},'${je.n}',${f2(b.amount)},'${b.dir}','unreconciled',${q(b.category)},'manual','${je.id}','[]'::jsonb);`);
}
// the R55 September bank-only line — on the statement, not yet booked (October reconciling item)
{ seq++; running=r2(running - SEP_BANKONLY); const bslId=U('bsl',++c.bsl);
  W(`insert into bank_statement_lines (id,company_id,bank_statement_id,bank_account_id,sequence,txn_date,description,amount,direction,running_balance,line_state,raw_source) values`);
  W(`  ('${bslId}','${COMPANY}','${bsId}','${BANK}',${seq},'2026-09-30',${q(D.unbookedStmtCharge.desc)},${f2(SEP_BANKONLY)},'credit',${f2(running)},'unmatched',${jb({source:'seed:september-2026',note:'bank charge on the September statement, not yet booked — October reconciling item'})});`);
}
// September reconciliations record — inserted ONLY when every reconciliation assertion holds (fail-closed)
W(`insert into reconciliations (id,company_id,bank_account_id,statement_date,statement_balance,gl_cashbook_balance,adjusted_bank_balance,variance,cleared_transaction_ids,unpresented_transaction_ids,uncleared_deposit_ids,finalized_at,finalized_by_user_id,notes)`);
W(`select '${reconUuid}','${COMPANY}','${BANK}','2026-09-30',`);
W(`  ${f2(stmtClose)}, d.gl_now, ${f2(adjBank)}, 0.00,`);
W(`  to_jsonb(array[${clearedBt.map(x=>`'${x}'`).join(',')}]::uuid[]),`);
W(`  to_jsonb(array['${timingBt['PAY-2230']}']::uuid[]),`);
W(`  to_jsonb(array['${timingBt['REC-1216']}','${timingBt['REC-1217']}']::uuid[]),`);
W(`  '2026-09-30T12:00:00+00:00', 'seed:september-2026',`);
W(`  'September continuation reconciliation. Variance R0.00. Brought forward from ON-AUG-2026 (in progress) = R${f2(AUG_BF)} across C3-C12. Derivations agree: continuity ${f2(BF_D1)} = forward ${f2(BF_D2)} = itemised ${f2(AUG_BF)}.'`);
W(`from (select`);
W(`  (select round(closing_balance,2) from bank_statements where company_id='${COMPANY}' and reference='${AUG.stmtRef}') aug_close,`);
W(`  (select round(coalesce(sum(jl.debit-jl.credit),0),2) from journal_lines jl join journal_entries j on j.id=jl.journal_entry_id join accounts a on a.id=jl.account_id where j.company_id='${COMPANY}' and a.code='1000' and j.date < '2026-09-01') gl_aug,`);
W(`  (select round(coalesce(sum(jl.debit-jl.credit),0),2) from journal_lines jl join journal_entries j on j.id=jl.journal_entry_id join accounts a on a.id=jl.account_id where j.company_id='${COMPANY}' and a.code='1000') gl_now,`);
W(`  (select amount from bank_transactions where company_id='${COMPANY}' and id='${AUG.clearing[0].bt}') pay2004,`);
W(`  (select amount from bank_transactions where company_id='${COMPANY}' and id='${AUG.clearing[1].bt}') rec1001`);
W(`) d`);
W(`where round(d.aug_close - d.gl_aug - d.pay2004 + d.rec1001, 2) = ${f2(AUG_BF)}                                              -- Derivation 1: continuity`);
W(`  and round(${f2(stmtClose)} + ${f2(depositsInTransit)} - ${f2(outstandingPmts)} - d.gl_now + ${f2(SEP_BANKONLY)}, 2) = ${f2(AUG_BF)}   -- Derivation 2: forward tie-out`);
W(`  and round(d.aug_close, 2) = ${f2(AUG.closing)}                                                                          -- statement continuity`);
W(`  and round((${f2(stmtClose)} + ${f2(depositsInTransit)} - ${f2(outstandingPmts)}) - (d.gl_now - ${f2(SEP_BANKONLY)} + ${f2(AUG_BF)}), 2) = 0.00;   -- variance = R0.00`);
// link every cleared bank_transaction to the reconciliation — ONLY if the reconciliation row was created
W(`update bank_transactions set reconciliation_id='${reconUuid}', updated_at=now()`);
W(`  where company_id='${COMPANY}' and id in (${clearedBt.map(x=>`'${x}'`).join(',')})`);
W(`  and exists (select 1 from reconciliations where id='${reconUuid}' and company_id='${COMPANY}');`);
W(``);

// 13. products + stock_balances
W(`-- 13. products.quantity_on_hand / cost_price  (application-maintained — no DB trigger)`);
W(`update products set quantity_on_hand = v.qoh, cost_price = v.wac, updated_at = now() from (values`);
const moved=Object.keys(OPEN).filter(s=> OPEN[s][0]!==stock[s].qoh || OPEN[s][1]!==stock[s].wac);
W(`  ${moved.map(s=>`('${PID[s]}'::uuid, ${stock[s].qoh}::numeric, ${stock[s].wac.toFixed(4)}::numeric)`).join(',\n  ')}`);
W(`) as v(pid,qoh,wac) where products.id = v.pid and products.company_id='${COMPANY}';`);
W(``);
W(`-- stock_balances: WH-CPT set to the ABSOLUTE closing balance (idempotent) + new WH-JHB rows`);
const cptClose={}, cptDelta={};
for(const k of Object.keys(bal)){ const [s,w]=k.split('|'); if(w===WH_CPT){ const d=r4(bal[k]-(OPEN[s]?OPEN[s][0]:0)); if(d!==0){ cptDelta[s]=d; cptClose[s]=r4(bal[k]); } } }
W(`update stock_balances set quantity_on_hand = v.qoh, updated_at = now() from (values`);
W(`  ${Object.entries(cptClose).map(([s,v])=>`('${PID[s]}'::uuid, ${v}::numeric)`).join(',\n  ')}`);
W(`) as v(pid,qoh) where stock_balances.product_id = v.pid and stock_balances.warehouse_id='${WH_CPT}' and stock_balances.company_id='${COMPANY}';`);
const jhbBal=Object.keys(bal).filter(k=>k.endsWith(WH_JHB)&&bal[k]!==0);
W(`insert into stock_balances (company_id,product_id,warehouse_id,quantity_on_hand) values`);
W(`  ${jhbBal.map(k=>{const s=k.split('|')[0]; return `('${COMPANY}','${PID[s]}','${WH_JHB}',${bal[k]})`;}).join(',\n  ')};`);
W(``);
W(`-- bank_accounts.current_balance  (denormalized display cache — application-maintained, NO DB trigger;`);
W(`-- the Banking UI shows it as the account's headline balance and it is designed to equal GL 1000`);
W(`-- "Cash and Bank" — see docs/OFFICE_NATIONAL_RECON_EXPECTATIONS.md. Set to the ABSOLUTE post-seed`);
W(`-- GL 1000 balance, idempotent. Reconciliation logic does NOT read this column.)`);
W(`update bank_accounts set current_balance = ${f2(gl1000final)}, updated_at = now()`);
W(`  where id = '${BANK}' and company_id = '${COMPANY}';`);
W(``);

// 14. verification — C1..C20 pre-commit gates (every row: v must equal expected, else DO NOT COMMIT)
W(`-- 14. verification gates C1..C20 — every row's  v  must equal  expected.  If any differ: ROLLBACK.`);
const P='5eed0000-0000-4000-8000-';
const NJL=S(journals.map(j=>j.lines.length));
const invTot=r2(S(D.invoices.map(i=>i.total))), recTot2=r2(S(D.receipts.map(x=>x.amount))), cnTot=r2(S(D.creditNotes.map(x=>x.total)));
const billTot=r2(S(D.bills.map(b=>b.total))), payTot2=r2(S(D.payments.map(p=>p.amount))), sretTot=r2(S(D.supplierReturns.map(s=>s.total)));
const arDelta=r2(invTot-recTot2-cnTot), apDelta2=r2(billTot-payTot2-sretTot);
const GL=(code,extra='')=>`(select coalesce(sum(jl.debit-jl.credit),0) from journal_lines jl join journal_entries j on j.id=jl.journal_entry_id join accounts a on a.id=jl.account_id where j.company_id='${COMPANY}' and a.code='${code}'${extra})`;
const nNewBt=onStmt.length+timing.length;
let _vn=0;
const V=(k,expr,exp)=>W(`${_vn++===0?'select':'union all select'} '${k}' k, (${expr})::text v, '${exp}' expected`);
// C1 — every new journal entry balances individually
V('C1_new_je_balance',`select count(*) from (select journal_entry_id from journal_lines jl join journal_entries j on j.id=jl.journal_entry_id where j.company_id='${COMPANY}' and j.id::text like '${P}d0%' group by journal_entry_id having round(sum(jl.debit-jl.credit),2)<>0) x`,'0');
// C2 — no orphan journal_lines
V('C2_orphan_journal_lines',`select count(*) from journal_lines jl where jl.company_id='${COMPANY}' and not exists (select 1 from journal_entries j where j.id=jl.journal_entry_id)`,'0');
// C3 — no orphan normalized document lines
V('C3_orphan_doc_lines',`select (select count(*) from invoice_lines l where l.company_id='${COMPANY}' and not exists(select 1 from invoices i where i.id=l.invoice_id)) + (select count(*) from bill_lines l where l.company_id='${COMPANY}' and not exists(select 1 from bills b where b.id=l.bill_id)) + (select count(*) from purchase_order_lines l where l.company_id='${COMPANY}' and not exists(select 1 from purchase_orders p where p.id=l.purchase_order_id)) + (select count(*) from credit_note_lines l where l.company_id='${COMPANY}' and not exists(select 1 from credit_notes cn where cn.id=l.credit_note_id))`,'0');
// C4 — JSONB <-> normalized line parity for all four document types (count + id-set equality)
for(const [nm,doc,dp,lp,jsonCol] of [['inv','invoices','30','31','line_items'],['bill','bills','70','71','line_items'],['po','purchase_orders','60','61','line_items'],['cn','credit_notes','40','41','line_items']]){
  const norm=nm==='inv'?'invoice_lines':nm==='bill'?'bill_lines':nm==='po'?'purchase_order_lines':'credit_note_lines';
  V(`C4_${nm}_norm_ct`,`select count(*) from ${norm} where company_id='${COMPANY}' and id::text like '${P}${lp}%'`, String(nm==='inv'?nInvL:nm==='bill'?nBillL:nm==='po'?nPoL:D.creditNotes.length));
  V(`C4_${nm}_jsonb_ct`,`select coalesce(sum(jsonb_array_length(${jsonCol})),0) from ${doc} where company_id='${COMPANY}' and id::text like '${P}${dp}%'`, String(nm==='inv'?nInvL:nm==='bill'?nBillL:nm==='po'?nPoL:D.creditNotes.length));
  V(`C4_${nm}_id_parity`,`select (select count(*) from (select (e->>'id')::uuid lid from ${doc} d, jsonb_array_elements(d.${jsonCol}) e where d.company_id='${COMPANY}' and d.id::text like '${P}${dp}%' except select id from ${norm} where company_id='${COMPANY}' and id::text like '${P}${lp}%') a) + (select count(*) from (select id from ${norm} where company_id='${COMPANY}' and id::text like '${P}${lp}%' except select (e->>'id')::uuid from ${doc} d, jsonb_array_elements(d.${jsonCol}) e where d.company_id='${COMPANY}' and d.id::text like '${P}${dp}%') b)`,'0');
}
// C5 — every seeded stock movement has a source document (+line where product-bearing) that resolves
V('C5_mv_missing_docid',`select count(*) from stock_movements where company_id='${COMPANY}' and id::text like '${P}e0%' and source_document_id is null`,'0');
V('C5_mv_missing_lineid',`select count(*) from stock_movements where company_id='${COMPANY}' and id::text like '${P}e0%' and product_id is not null and source_document_line_id is null`,'0');
V('C5_mv_lineid_resolves',`select count(*) from stock_movements sm where sm.company_id='${COMPANY}' and sm.id::text like '${P}e0%' and sm.source_document_line_id is not null and not exists (select 1 from (select id from bill_lines union all select id from invoice_lines union all select id from credit_note_lines union all select id from supplier_return_lines union all select id from stock_adjustment_lines union all select id from stock_take_lines union all select id from stock_transfer_lines) u where u.id=sm.source_document_line_id)`,'0');
// C6 / C7 — inventory_transaction_log integrity
V('C6_itl_movements_resolve',`select count(*) from inventory_transaction_log itl, unnest(itl.movement_ids) mid where itl.company_id='${COMPANY}' and itl.id::text like '${P}0a%' and not exists (select 1 from stock_movements sm where sm.id=mid)`,'0');
V('C7_itl_je_resolves',`select count(*) from inventory_transaction_log itl where itl.company_id='${COMPANY}' and itl.id::text like '${P}0a%' and itl.journal_entry_id is not null and not exists (select 1 from journal_entries j where j.id=itl.journal_entry_id)`,'0');
// C8 — no negative stock balances anywhere
V('C8_negative_balances',`select count(*) from stock_balances where company_id='${COMPANY}' and quantity_on_hand < 0`,'0');
// C9 — products.quantity_on_hand == Σ warehouse stock_balances
V('C9_qoh_vs_balances',`select count(*) from (select p.id from products p join stock_balances sb on sb.product_id=p.id where p.company_id='${COMPANY}' group by p.id,p.quantity_on_hand having p.quantity_on_hand <> sum(sb.quantity_on_hand)) x`,'0');
// C10 — inventory valuation == GL 1200
V('C10_valuation_vs_gl1200',`select round(${GL('1200')} - (select coalesce(sum(quantity_on_hand*cost_price),0) from products where company_id='${COMPANY}' and track_inventory),2)`,'0.00');
V('C10_gl1200_close',`select round(${GL('1200')},2)`,f2(gl1200final));
// C11 — GL 1210 (in-transit) fully settled
V('C11_gl1210',`select round(${GL('1210')},2)`,'0.00');
// C12 — AP control == supplier subledger; PrintTech carries the R9,200 debit balance
V('C12_ap_control_close',`select round(${GL('2000')},2)`,f2(r2(-590511.21-apDelta2)));
V('C12_ap_subledger_delta',`select round((select coalesce(sum(total),0) from bills where company_id='${COMPANY}' and id::text like '${P}70%') - (select coalesce(sum(amount),0) from payments where company_id='${COMPANY}' and id::text like '${P}90%') - (select coalesce(sum(total),0) from supplier_returns where company_id='${COMPANY}' and id::text like '${P}80%'),2)`,f2(apDelta2));
V('C12_printtech_debit_bal',`select round((select coalesce(sum(total),0) from bills where company_id='${COMPANY}' and id::text like '${P}70%' and supplier_id='c791b70d-b132-457a-817e-bdedd992a37a') - (select coalesce(sum((a->>'amount')::numeric),0) from payments p, jsonb_array_elements(p.allocations) a where p.company_id='${COMPANY}' and p.id::text like '${P}90%' and (a->>'billId')::uuid in (select id from bills where company_id='${COMPANY}' and supplier_id='c791b70d-b132-457a-817e-bdedd992a37a')) - (select coalesce(sum(total),0) from supplier_returns where company_id='${COMPANY}' and id::text like '${P}80%' and supplier_id='c791b70d-b132-457a-817e-bdedd992a37a'),2)`,'-9200.00');
// C13 — AR control == customer subledger
V('C13_ar_control_delta',`select round(${GL('1100')} - 207794.04,2)`,f2(arDelta));
V('C13_ar_subledger_delta',`select round((select coalesce(sum(total),0) from invoices where company_id='${COMPANY}' and id::text like '${P}30%') - (select coalesce(sum(amount),0) from customer_receipts where company_id='${COMPANY}' and id::text like '${P}50%') - (select coalesce(sum(total),0) from credit_notes where company_id='${COMPANY}' and id::text like '${P}40%'),2)`,f2(arDelta));
// C14 — VAT arithmetic internally consistent
V('C14_line_vat_std',`select count(*) from (select id, line_total, tax_amount from invoice_lines where company_id='${COMPANY}' and id::text like '${P}31%' and tax_rate_id='${T_STD}' union all select id, line_total, tax_amount from bill_lines where company_id='${COMPANY}' and id::text like '${P}71%' and tax_rate_id='${T_STD}') l where round(l.line_total*0.15,2) <> l.tax_amount`,'0');
V('C14_header_vat_inv',`select count(*) from invoices where company_id='${COMPANY}' and id::text like '${P}30%' and round((select coalesce(sum((e->>'taxAmount')::numeric),0) from jsonb_array_elements(line_items) e),2) <> tax_total`,'0');
V('C14_header_vat_bill',`select count(*) from bills where company_id='${COMPANY}' and id::text like '${P}70%' and round((select coalesce(sum((e->>'taxAmount')::numeric),0) from jsonb_array_elements(line_items) e),2) <> tax_total`,'0');
V('C14_vat_output_delta',`select round(${GL('2100')} - (-86742.45),2)`,f2(r2(gl[2100]||0)));
V('C14_vat_input_delta',`select round(${GL('2110')} - 154620.57,2)`,f2(r2(gl[2110]||0)));
// C15 — bank reconciliation (continuation): variance 0.00, three b/f derivations agree, fixture untouched
V('C15a_recon_row_exists',`select count(*) from reconciliations where company_id='${COMPANY}' and id::text like '${P}f3%'`,'1');
V('C15b_recon_variance',`select round(coalesce((select variance from reconciliations where company_id='${COMPANY}' and id::text like '${P}f3%'),999),2)`,'0.00');
V('C15c_bf_deriv1_continuity',`select round((select closing_balance from bank_statements where company_id='${COMPANY}' and reference='${AUG.stmtRef}') - ${GL('1000'," and j.date < '2026-09-01'")} - (select amount from bank_transactions where company_id='${COMPANY}' and id='${AUG.clearing[0].bt}') + (select amount from bank_transactions where company_id='${COMPANY}' and id='${AUG.clearing[1].bt}'),2)`,f2(AUG_BF));
V('C15d_bf_deriv2_forward',`select round(${f2(stmtClose)} + ${f2(depositsInTransit)} - ${f2(outstandingPmts)} - ${GL('1000')} + ${f2(SEP_BANKONLY)},2)`,f2(AUG_BF));
V('C15e_bf_deriv3_itemised',`select ${f2(AUG_BF)}::numeric`,f2(AUG_BF));
for(const x of AUG.bf) V(`C15f_fixture_${x.c}_amt`,`select round((select amount from bank_transactions where company_id='${COMPANY}' and id='${x.fixtureBt}'),2)`,f2(x.fixtureAmt));
V('C15g_fixture_C6_dup_je',`select count(*) from journal_entries where company_id='${COMPANY}' and entry_number in ('JE-2063','JE-2064')`,'2');
V('C15h_fixture_pay2220_gl',`select round(${GL('1000'," and j.entry_number in ('JE-2063','JE-2064')")},2)`,'-9200.00');
V('C15i_sep_opening_continuity',`select round((select opening_balance from bank_statements where company_id='${COMPANY}' and reference='ON-SEP-2026') - (select closing_balance from bank_statements where company_id='${COMPANY}' and reference='${AUG.stmtRef}'),2)`,'0.00');
V('C15j_aug_fixture_untouched',`select (select reconciliation_status from bank_statements where company_id='${COMPANY}' and reference='${AUG.stmtRef}')::text || '/' || (select line_count from bank_statements where company_id='${COMPANY}' and reference='${AUG.stmtRef}')::text`,'in_progress/87');
V('C15k_pay2004_rec1001_linked',`select count(*) from bank_transactions where company_id='${COMPANY}' and id in ('${AUG.clearing[0].bt}','${AUG.clearing[1].bt}') and status='reconciled' and bank_statement_line_id is not null and reconciliation_id::text like '${P}f3%'`,'2');
// C16 — deterministic seed id counts (exact — no more, no less)
const C16=[['01','warehouses',1],['02','suppliers',1],['10','quotes',D.quotes.length],['20','sales_orders',D.salesOrders.length],['30','invoices',D.invoices.length],['31','invoice_lines',nInvL],['40','credit_notes',D.creditNotes.length],['41','credit_note_lines',D.creditNotes.length],['50','customer_receipts',D.receipts.length],['60','purchase_orders',D.purchaseOrders.length],['61','purchase_order_lines',nPoL],['70','bills',D.bills.length],['71','bill_lines',nBillL],['80','supplier_returns',D.supplierReturns.length],['81','supplier_return_lines',D.supplierReturns.length],['90','payments',D.payments.length],['a0','stock_adjustments',D.stockAdjustments.length],['a1','stock_adjustment_lines',D.stockAdjustments.length],['b0','stock_takes',D.stockTakes.length],['b1','stock_take_lines',48],['c0','stock_transfers',D.stockTransfers.length],['c1','stock_transfer_lines',D.stockTransfers.length],['d0','journal_entries',journals.length],['d1','journal_lines',NJL],['e0','stock_movements',movements.length],['08','fixed_assets',1],['09','depreciation_entries',D.depreciation.entries.length],['0a','inventory_transaction_log',itlKeys.size],['f0','bank_statements',1],['f1','bank_statement_lines',nStmtLines],['f2','bank_transactions',nNewBt],['f3','reconciliations',1]];
for(const [pfx,tbl,n] of C16) V(`C16_${tbl}`,`select count(*) from ${tbl} where company_id='${COMPANY}' and id::text like '${P}${pfx}%'`,String(n));
// C16b — PO<->bill lifecycle links (bill inserted with purchase_order_id, PO.bill_id set afterwards in section 3b)
{ const nLinked=D.purchaseOrders.filter(p=>p.toBill).length;
  V('C16b_po_bill_id_set',`select count(*) from purchase_orders where company_id='${COMPANY}' and id::text like '${P}60%' and bill_id is not null`,String(nLinked));
  V('C16b_bill_po_id_set',`select count(*) from bills where company_id='${COMPANY}' and id::text like '${P}70%' and purchase_order_id is not null`,String(nLinked));
  V('C16b_po_bill_roundtrip',`select count(*) from purchase_orders po join bills b on b.id=po.bill_id where po.company_id='${COMPANY}' and po.id::text like '${P}60%' and b.purchase_order_id = po.id`,String(nLinked));
}
// C17 — JE counter correct + collision-free
V('C17_je_counter',`select next_value from journal_number_counters where company_id='${COMPANY}'`,String(JE_START+journals.length));
V('C17_dup_entry_number',`select count(*) from (select entry_number from journal_entries where company_id='${COMPANY}' group by entry_number having count(*)>1) x`,'0');
V('C17_max_nonseed_je',`select coalesce(max((regexp_replace(entry_number,'\\D','','g'))::int),0) from journal_entries where company_id='${COMPANY}' and entry_number ~ '^JE-[0-9]+$' and id::text not like '${P}d0%'`,String(JE_START-1));
// C18 — whole-company trial balance
V('C18_trial_balance',`select round(sum(jl.debit-jl.credit),2) from journal_lines jl join journal_entries j on j.id=jl.journal_entry_id where j.company_id='${COMPANY}'`,'0.00');
// C19 — September statement balance arithmetic
V('C19_stmt_closing',`select round(closing_balance,2) from bank_statements where company_id='${COMPANY}' and reference='ON-SEP-2026'`,f2(stmtClose));
V('C19_stmt_line_sum',`select round(bs.opening_balance + sum(case when bsl.direction='debit' then bsl.amount else -bsl.amount end),2) from bank_statements bs join bank_statement_lines bsl on bsl.bank_statement_id=bs.id where bs.company_id='${COMPANY}' and bs.reference='ON-SEP-2026' group by bs.opening_balance`,f2(stmtClose));
// C20 — pre-existing rows untouched
V('C20_nonseed_je_count',`select count(*) from journal_entries where company_id='${COMPANY}' and id::text not like '${P}d0%'`,'171');
V('C20_golden_sep_je',`select count(*) from journal_entries where company_id='${COMPANY}' and entry_number in ('JE-1066','JE-1067','JE-1085','JE-1096','JE-1098')`,'5');
V('C20_bank_txn_total',`select count(*) from bank_transactions where company_id='${COMPANY}'`,String(94+nNewBt));
// C21 — bank_accounts.current_balance re-synced to post-seed GL 1000
V('C21_bank_current_balance',`select round(current_balance,2) from bank_accounts where company_id='${COMPANY}' and id='${BANK}'`,f2(gl1000final));
V('C21_bank_balance_eq_gl1000',`select round((select current_balance from bank_accounts where company_id='${COMPANY}' and id='${BANK}') - ${GL('1000')},2)`,'0.00');
W(`;`);
W(``);
W(`-- ROLLBACK;   -- dry run: inspect every C1..C20 row (v == expected), THEN re-run with COMMIT`);
W(`COMMIT;`);

writeFileSync(new URL('./0044_september_2026_data.sql', import.meta.url), sql.join('\n')+'\n');

// ── rollback ──
const rb=[];
const R=(s='')=>rb.push(s);
const NLINES=nStmtLines, NEWBT=nNewBt;
const preSeedFa=D.depreciation.entries.filter(e=>e.asset!=='FA-006').map(e=>[e.asset, r2(e.accumAfter-e.amount)]);
const linkBt2=[AUG.clearing[0].bt,AUG.clearing[1].bt];
const linkBt5=AUG.septReceipts.map(x=>x.bt);
R(`-- september_2026_rollback.sql  — GENERATED. Removes EXACTLY the 0044 seed batch and restores the`);
R(`-- pre-write fingerprint.  FAIL-CLOSED: a guard block ABORTS unless the exact post-seed state is present`);
R(`-- (so a second run aborts; later JEs / stock activity / a drifted counter all abort).  All restores are`);
R(`-- ABSOLUTE (idempotent), never deltas.  Company-scoped throughout.  Touches no August/golden history,`);
R(`-- no schema_migrations, no migration 0043.  The August ON-AUG-2026 fixture is NOT modified.`);
R(`BEGIN;`);
R(``);
R(`-- ── guard: abort unless the exact 0044 post-seed fingerprint is present ──`);
R(`do $$`);
R(`declare v_je int; v_ctr int; v_late int; v_inv numeric; v_gl1200 numeric; v_mov int; v_recn int; v_stmt int; v_link int;`);
R(`begin`);
R(`  select count(*) into v_je from journal_entries where company_id='${COMPANY}' and id::text like '5eed0000-0000-4000-8000-d0%';`);
R(`  select next_value into v_ctr from journal_number_counters where company_id='${COMPANY}';`);
R(`  if v_je = 0 and v_ctr = ${JE_START} then raise exception 'ROLLBACK ABORT: batch 0044 not present (0 seed JEs, counter already ${JE_START}) — nothing to roll back'; end if;`);
R(`  if v_je <> ${journals.length} then raise exception 'ROLLBACK ABORT: expected ${journals.length} seed journal_entries, found %', v_je; end if;`);
R(`  if v_ctr <> ${JE_START+journals.length} then raise exception 'ROLLBACK ABORT: journal_number_counters.next_value expected ${JE_START+journals.length}, found %', v_ctr; end if;`);
R(`  select count(*) into v_late from journal_entries where company_id='${COMPANY}' and entry_number ~ '^JE-[0-9]+$' and (regexp_replace(entry_number,'\\D','','g'))::int > ${JE_START+journals.length-1};`);
R(`  if v_late <> 0 then raise exception 'ROLLBACK ABORT: % journal entries numbered above JE-${JE_START+journals.length-1} exist — resolve manually; will not blind-reset the counter', v_late; end if;`);
R(`  select round(coalesce(sum(quantity_on_hand*cost_price),0),2) into v_inv from products where company_id='${COMPANY}' and track_inventory;`);
R(`  if v_inv <> ${f2(gl1200final)} then raise exception 'ROLLBACK ABORT: inventory valuation expected ${f2(gl1200final)} (post-seed), found % — later stock activity; not overwriting products/stock_balances', v_inv; end if;`);
R(`  select round(coalesce(sum(jl.debit-jl.credit),0),2) into v_gl1200 from journal_lines jl join journal_entries j on j.id=jl.journal_entry_id join accounts a on a.id=jl.account_id where j.company_id='${COMPANY}' and a.code='1200';`);
R(`  if v_gl1200 <> ${f2(gl1200final)} then raise exception 'ROLLBACK ABORT: GL 1200 expected ${f2(gl1200final)}, found %', v_gl1200; end if;`);
R(`  select count(*) into v_mov from stock_movements where company_id='${COMPANY}' and id::text like '5eed0000-0000-4000-8000-e0%';`);
R(`  if v_mov <> ${movements.length} then raise exception 'ROLLBACK ABORT: expected ${movements.length} seed stock_movements, found %', v_mov; end if;`);
R(`  select count(*) into v_recn from reconciliations where company_id='${COMPANY}' and id::text like '5eed0000-0000-4000-8000-f3%';`);
R(`  if v_recn <> 1 then raise exception 'ROLLBACK ABORT: expected 1 seed reconciliations row, found %', v_recn; end if;`);
R(`  select count(*) into v_stmt from bank_statements where company_id='${COMPANY}' and reference='ON-SEP-2026';`);
R(`  if v_stmt <> 1 then raise exception 'ROLLBACK ABORT: ON-SEP-2026 statement not found (count %)', v_stmt; end if;`);
R(`  select count(*) into v_link from bank_transactions where company_id='${COMPANY}' and id in ('${linkBt2[0]}','${linkBt2[1]}') and status='reconciled' and reconciliation_id::text like '5eed0000-0000-4000-8000-f3%';`);
R(`  if v_link <> 2 then raise exception 'ROLLBACK ABORT: PAY-2004/REC-1001 not in expected post-seed linked state (count %)', v_link; end if;`);
R(`  raise notice 'ROLLBACK pre-flight OK — 0044 batch present and unchanged; proceeding.';`);
R(`end $$;`);
R(``);
R(`-- ── 1. un-link the 7 pre-existing September bank_transactions (restore their exact pre-seed state) ──`);
R(`update bank_transactions set status='unreconciled', bank_statement_line_id=null, reconciliation_id=null, updated_at=now()`);
R(`  where company_id='${COMPANY}' and id in ('${linkBt2[0]}','${linkBt2[1]}');   -- C2a/C2b: back to unreconciled (their pre-seed status)`);
R(`update bank_transactions set bank_statement_line_id=null, reconciliation_id=null, updated_at=now()`);
R(`  where company_id='${COMPANY}' and id in (${linkBt5.map(x=>`'${x}'`).join(',')});   -- REC-1008/1009/1027: stay 'reconciled', drop the seed links`);
R(``);
R(`-- ── 2. break cross-link / back-ref FK cycles on the seed rows before deleting ──`);
for(const s of SEED_CYCLE_BREAKERS) R(s);
R(``);
R(`-- ── 3. delete the seed batch (shared FK-safe topological order; journal_entries LAST) ──`);
for(const s of SEED_DELETES) R(s);
R(``);
R(`-- ── 4. ABSOLUTE restores (idempotent — safe to run twice; guarded by the pre-flight block above) ──`);
R(`update fixed_assets set accumulated_depreciation = v.accum, updated_at = now() from (values`);
R(`  ${preSeedFa.map(([n,a])=>`('${n}',${f2(a)}::numeric)`).join(', ')}`);
R(`) as v(num,accum) where fixed_assets.company_id='${COMPANY}' and fixed_assets.asset_number = v.num;`);
R(``);
R(`update products set quantity_on_hand = v.qoh, cost_price = v.wac, updated_at = now() from (values`);
R(`  ${moved.map(s=>`('${PID[s]}'::uuid, ${OPEN[s][0]}::numeric, ${OPEN[s][1].toFixed(4)}::numeric)`).join(',\n  ')}`);
R(`) as v(pid,qoh,wac) where products.id = v.pid and products.company_id='${COMPANY}';`);
R(``);
R(`update stock_balances set quantity_on_hand = v.qoh, updated_at = now() from (values`);
R(`  ${Object.keys(cptDelta).map(s=>`('${PID[s]}'::uuid, ${OPEN[s][0]}::numeric)`).join(',\n  ')}`);
R(`) as v(pid,qoh) where stock_balances.product_id = v.pid and stock_balances.warehouse_id='${WH_CPT}' and stock_balances.company_id='${COMPANY}';`);
R(``);
R(`update journal_number_counters set next_value = ${JE_START}, updated_at = now() where company_id='${COMPANY}';`);
R(``);
R(`-- bank_accounts.current_balance → pre-seed absolute (= pre-seed GL 1000). Idempotent.`);
R(`update bank_accounts set current_balance = ${f2(LIVE_TB['1000'])}, updated_at = now() where id = '${BANK}' and company_id='${COMPANY}';`);
R(``);
R(`-- ── 5. post-rollback fingerprint proof (every row: v must equal expected) ──`);
R(`select 'tb_sum' k, round(sum(jl.debit-jl.credit),2)::text v, '0.00' expected from journal_lines jl join journal_entries j on j.id=jl.journal_entry_id where j.company_id='${COMPANY}'`);
R(`union all select 'gl_1200', round(coalesce((select sum(jl.debit-jl.credit) from journal_lines jl join journal_entries j on j.id=jl.journal_entry_id join accounts a on a.id=jl.account_id where j.company_id='${COMPANY}' and a.code='1200'),0),2)::text, '1569743.20'`);
R(`union all select 'inv_val', round(coalesce(sum(quantity_on_hand*cost_price),0),2)::text, '1569743.20' from products where company_id='${COMPANY}' and track_inventory`);
R(`union all select 'je_count', count(*)::text, '171' from journal_entries where company_id='${COMPANY}'`);
R(`union all select 'je_counter', next_value::text, '${JE_START}' from journal_number_counters where company_id='${COMPANY}'`);
R(`union all select 'seed_rows_remaining', (`);
R(`  (select count(*) from journal_entries where company_id='${COMPANY}' and id::text like '5eed0000-0000-4000-8000-%')`);
R(` + (select count(*) from stock_movements where company_id='${COMPANY}' and id::text like '5eed0000-0000-4000-8000-%')`);
R(` + (select count(*) from bank_transactions where company_id='${COMPANY}' and id::text like '5eed0000-0000-4000-8000-%')`);
R(` + (select count(*) from bank_statement_lines where company_id='${COMPANY}' and id::text like '5eed0000-0000-4000-8000-%')`);
R(` + (select count(*) from reconciliations where company_id='${COMPANY}' and id::text like '5eed0000-0000-4000-8000-%')`);
R(` + (select count(*) from invoices where company_id='${COMPANY}' and id::text like '5eed0000-0000-4000-8000-%')`);
R(` + (select count(*) from bills where company_id='${COMPANY}' and id::text like '5eed0000-0000-4000-8000-%')`);
R(` + (select count(*) from warehouses where company_id='${COMPANY}' and id::text like '5eed0000-0000-4000-8000-%')`);
R(` + (select count(*) from suppliers where company_id='${COMPANY}' and id::text like '5eed0000-0000-4000-8000-%'))::text, '0'`);
R(`union all select 'pay2004_rec1001_status', string_agg(status::text,'/' order by reference), 'unreconciled/unreconciled' from bank_transactions where company_id='${COMPANY}' and id in ('${linkBt2[0]}','${linkBt2[1]}')`);
R(`union all select 'linked_bt_reconciliation_id', count(*)::text, '0' from bank_transactions where company_id='${COMPANY}' and id in ('${linkBt2[0]}','${linkBt2[1]}',${linkBt5.map(x=>`'${x}'`).join(',')}) and reconciliation_id is not null`);
R(`union all select 'bank_transactions_total', count(*)::text, '94' from bank_transactions where company_id='${COMPANY}'`);
R(`union all select 'bank_current_balance', round(current_balance,2)::text, '${f2(LIVE_TB['1000'])}' from bank_accounts where company_id='${COMPANY}' and id='${BANK}'`);
R(`union all select 'aug_statement_untouched', (reconciliation_status::text||'/'||line_count::text), 'in_progress/87' from bank_statements where company_id='${COMPANY}' and reference='${AUG.stmtRef}';`);
R(``);
R(`-- ROLLBACK;  -- dry run: inspect the fingerprint proof above, then re-run with COMMIT`);
R(`COMMIT;`);
writeFileSync(new URL('./september_2026_rollback.sql', import.meta.url), rb.join('\n')+'\n');

// ── manifest ──
const mf=[];
const M=(s='')=>mf.push(s);
M(`# SEPTEMBER 2026 SEED MANIFEST`);
M(``);
M(`Generated by \`docs/db-changes/september_2026_simulation.mjs\`. Authoritative rollback boundary.`);
M(`Company \`${COMPANY}\`. Every row below is created by \`0044_september_2026_data.sql\` and`);
M(`deleted by \`september_2026_rollback.sql\`.`);
M(``);
M(`## Deterministic UUID scheme`);
M(``);
M(`\`5eed0000-0000-4000-8000-<TT><10-hex-counter>\`  — TT = 2-hex table code:`);
M(``);
M('| TT | table | TT | table | TT | table |');
M('|----|-------|----|-------|----|-------|');
M('| 01 | warehouses | 02 | suppliers | 08 | fixed_assets |');
M('| 09 | depreciation_entries | 0a | inventory_transaction_log | 10/11 | quotes / lines |');
M('| 20/21 | sales_orders / lines | 30/31 | invoices / lines | 40/41 | credit_notes / lines |');
M('| 50 | customer_receipts | 60/61 | purchase_orders / lines | 70/71 | bills / lines |');
M('| 80/81 | supplier_returns / lines | 90 | payments | a0/a1 | stock_adjustments / lines |');
M('| b0/b1 | stock_takes / lines | c0/c1 | stock_transfers / lines | d0/d1 | journal_entries / lines |');
M('| e0 | stock_movements | f0/f1/f2 | bank_statements / lines / transactions | f3 | reconciliations |');
M(``);
M(`Rollback is FAIL-CLOSED: a guard block aborts unless the exact 0044 post-seed fingerprint is present`);
M(`(so a second run aborts; later JEs / stock activity / a drifted counter all abort). It then deletes`);
M(`\`where id::text like '5eed0000-0000-4000-8000-<TT>%'\` per table in reverse dependency order,`);
M(`UN-LINKS the 7 pre-existing September bank_transactions (PAY-2004, REC-1001 → \`unreconciled\`; the 5`);
M(`REC-1008/1009/1027 rows keep \`reconciled\`, links dropped), and restores \`products\`,`);
M(`\`stock_balances\` (WH-CPT), \`fixed_assets\` accumulated depreciation, \`bank_accounts.current_balance\``);
M(`and \`journal_number_counters.next_value\` to ABSOLUTE pre-write values (idempotent, not deltas). A`);
M(`post-rollback fingerprint proof is printed. The August ON-AUG-2026 fixture is NOT modified.`);
M(``);
M(`## Fixed ids`);
M(`- warehouse WH-JHB : \`${WH_JHB}\``);
M(`- supplier "Boland Auto & Truck (Pty) Ltd" : \`${SUP_BOLAND}\``);
M(`- fixed asset FA-006 : \`${IDS.fa['FA-006']}\``);
M(`- bank statement ON-SEP-2026 : \`${bsId}\`  (continuation of ON-AUG-2026 \`${AUG.stmtId}\`, opening = R${f2(AUG.closing)})`);
M(`- September reconciliation : \`${reconUuid}\`  (variance R0.00; August b/f R${f2(AUG_BF)})`);
M(``);
M(`## Pre-existing September bank_transactions linked by 0044 (UPDATE, not INSERT)`);
M(`| bank_transaction id | ref | amount | pre-seed status | post-seed |`);
M(`|---|---|---|---|---|`);
AUG.priorRows.forEach(x=>M(`| \`${x.bt}\` | ${x.ref} | ${f2(x.amt)} ${x.dir} | ${x.wasStatus} | reconciled, linked to ON-SEP-2026 + reconciliation ${reconUuid.slice(0,13)}… |`));
M(``);
M(`## Document-number ranges (secondary check)`);
M(`| type | range |`);
M(`|------|-------|`);
M(`| quotes | QUO-1001 … QUO-1003 |`);
M(`| sales orders | SO-2026-0001 … SO-2026-0004 |`);
M(`| purchase orders | PO-2026-0001 … PO-2026-0004 |`);
M(`| invoices | INV-1063 … INV-1080 |`);
M(`| credit notes | CN-1007 … CN-1008 |`);
M(`| customer receipts | REC-1204 … REC-1217 |`);
M(`| bills | BILL-2029 … BILL-2045 |`);
M(`| supplier returns | SRET-0001 |`);
M(`| payments | PAY-2221 … PAY-2230 |`);
M(`| stock adjustments | ADJ-0001 |`);
M(`| stock takes | STK-0001 |`);
M(`| stock transfers | TRF-0001 … TRF-0002 |`);
M(`| fixed assets | FA-006 |`);
M(`| journal entries | JE-${JE_START} … JE-${JE_START+journals.length-1} |`);
M(``);
M(`## Exact row counts created`);
M('```');
M(out.slice(out.findIndex(l=>l.includes('EXACT COUNTS'))).join('\n'));
M('```');
M(``);
M(`## journal_number_counters`);
M(`- pre-write \`next_value\` = **${JE_START}**  → post-write **${JE_START+journals.length}**  (rollback resets to ${JE_START})`);
M(``);
M(`## Full journal-entry list`);
M(`| # | id | date | source | memo |`);
M(`|---|----|------|--------|------|`);
for(const j of journals) M(`| ${j.n} | \`${j.id}\` | ${j.date} | ${j.source} | ${j.memo.replace(/\|/g,'\\|')} |`);
writeFileSync(new URL('./september_2026_manifest.md', import.meta.url), mf.join('\n')+'\n');

console.log(`\n\nWROTE:\n  docs/db-changes/0044_september_2026_data.sql   (${sql.length} lines)\n  docs/db-changes/september_2026_rollback.sql    (${rb.length} lines)\n  docs/db-changes/september_2026_manifest.md`);
