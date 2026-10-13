/**
 * AK PACK FITNESS Attendance + Member API
 *
 * Apps Script project properties:
 *   SPREADSHEET_ID = Google spreadsheet ID
 *   ADMIN_PIN = strong admin PIN for member CRUD and attendance history
 *
 * MEMBERS headers: Membership ID | Name | Mobile | Status | Expiry
 * ATTENDANCE headers are created automatically.
 */
const MEMBERS_SHEET = 'MEMBERS';
const ATTENDANCE_SHEET = 'ATTENDANCE';
const MEMBER_HEADERS = ['Membership ID', 'Name', 'Mobile', 'Status', 'Expiry'];
const ATTENDANCE_HEADERS = ['Membership ID', 'Name', 'Mobile', 'Date', 'Clock In', 'Clock Out', 'Duration', 'Status', 'Updated At'];

function doGet(e) {
  try {
    const action = String(e && e.parameter && e.parameter.action || '');
    if (action === 'ping') return json_(ping_());
    if (action === 'schema') return json_(schema_());
    return json_({ok:true,service:'AK PACK FITNESS Attendance API',version:3,actions:['schema','ping','lookup','clockIn','clockOut','attendanceSearch','memberHistory','memberList','memberCreate','memberUpdate','memberArchive']});
  } catch (err) {
    return json_({ok:false,error:safeMessage_(err)});
  }
}
function doPost(e) {
  try {
    const p = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    let out;
    switch (String(p.action || '')) {
      case 'ping': out = ping_(); break;
      case 'schema': out = schema_(); break;
      case 'lookup': out = lookupMember_(p.identity); break;
      case 'clockIn': out = clockIn_(p.membershipId); break;
      case 'clockOut': out = clockOut_(p.membershipId); break;
      case 'attendanceSearch': requireAdmin_(p.adminPin); out = {ok:true,records:searchAttendance_(p)}; break;
      case 'memberHistory': requireAdmin_(p.adminPin); out = memberHistory_(p.membershipId); break;
      case 'memberList': requireAdmin_(p.adminPin); out = {ok:true,members:listMembers_(p.query)}; break;
      case 'memberCreate': requireAdmin_(p.adminPin); out = createMember_(p.member || {}); break;
      case 'memberUpdate': requireAdmin_(p.adminPin); out = updateMember_(p.membershipId,p.member || {}); break;
      case 'memberArchive': requireAdmin_(p.adminPin); out = archiveMember_(p.membershipId); break;
      default: throw new Error('Unknown action: ' + String(p.action || '(empty)'));
    }
    return json_(out);
  } catch (err) {
    return json_({ok:false,error:safeMessage_(err)});
  }
}
function json_(obj) { return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON); }
function safeMessage_(e) { const s=e&&e.message?e.message:String(e||'Unexpected server error'); return s.length>260?s.slice(0,260):s; }
function props_(){return PropertiesService.getScriptProperties();}
function spreadsheet_(){const id=props_().getProperty('SPREADSHEET_ID');if(!id)throw new Error('Set SPREADSHEET_ID in Apps Script Project Settings.');return SpreadsheetApp.openById(id);}
function ensureSheet_(name,headers){const ss=spreadsheet_();let sh=ss.getSheets().find(s=>s.getName().trim().toLowerCase()===name.toLowerCase());if(!sh)sh=ss.insertSheet(name);if(sh.getLastRow()===0)sh.getRange(1,1,1,headers.length).setValues([headers]);return sh;}
function membersSheet_(){return ensureSheet_(MEMBERS_SHEET,MEMBER_HEADERS);}
function attendanceSheet_(){return ensureSheet_(ATTENDANCE_SHEET,ATTENDANCE_HEADERS);}
function ping_(){const s=schema_();return {ok:true,message:'Google Sheets connection successful.',spreadsheet:s.spreadsheet,sheet:s.memberSheet,columns:s.columns,spreadsheetConfigured:true,actions:s.actions};}
function schema_(){const ss=spreadsheet_(),sh=membersSheet_(),lastCol=Math.max(1,sh.getLastColumn()),rawHeaders=sh.getRange(1,1,1,lastCol).getDisplayValues()[0].map(v=>String(v).trim()),headers=rawHeaders.filter(Boolean);const hm=headerMap_(sh);const aliases={membershipId:['membership id','membershipid','member id','id','membership no','membership number','member no','client id'],name:['name','member name','client name','full name','customer name'],mobile:['mobile','mobile number','phone','phone number','registered mobile','contact number','whatsapp number'],status:['status','membership status','member status'],expiry:['expiry','expiry date','membership expiry','valid till','valid until','end date']};const mapped={};Object.keys(aliases).forEach(k=>{const i=hm.col(aliases[k]);mapped[k]=i<0?null:rawHeaders[i]||null});return {ok:true,service:'AK PACK FITNESS Attendance API',version:3,spreadsheet:ss.getName(),memberSheet:sh.getName(),columns:headers,mappedColumns:mapped,memberRows:Math.max(0,sh.getLastRow()-1),attendanceSheet:attendanceSheet_().getName(),actions:['lookup','clockIn','clockOut','attendanceSearch','memberHistory','memberList','memberCreate','memberUpdate','memberArchive']};}
function digits_(v){return String(v==null?'':v).replace(/\D/g,'');}
function mobileKey_(v){let s=digits_(v);if(s.length>10)s=s.slice(-10);return s;}
function tz_(){return Session.getScriptTimeZone()||'Asia/Kolkata';}
function dateText_(v){if(!v)return '';if(v instanceof Date&&!isNaN(v.getTime()))return Utilities.formatDate(v,tz_(),'yyyy-MM-dd');const s=String(v).trim();if(/^\d{4}-\d{2}-\d{2}$/.test(s))return s;const d=new Date(s);return isNaN(d.getTime())?s:Utilities.formatDate(d,tz_(),'yyyy-MM-dd');}
function timeText_(v){if(!v)return '';if(v instanceof Date&&!isNaN(v.getTime()))return Utilities.formatDate(v,tz_(),'HH:mm:ss');if(typeof v==='number'){const n=Math.round(v*86400);return [Math.floor(n/3600),Math.floor(n%3600/60),n%60].map(x=>('0'+x).slice(-2)).join(':');}const m=String(v).trim().match(/(\d{1,2}:\d{2}(?::\d{2})?)/);return m?(m[1].length===5?m[1]+':00':m[1]):String(v).trim();}
function dateTime_(d,t){const ds=dateText_(d),ts=timeText_(t);if(!ds||!ts)return null;const a=ds.split('-').map(Number),b=ts.split(':').map(Number);return new Date(a[0],a[1]-1,a[2],b[0]||0,b[1]||0,b[2]||0);}
function headerMap_(sh){const hs=sh.getRange(1,1,1,sh.getLastColumn()).getDisplayValues()[0].map(v=>String(v).trim().toLowerCase());return {headers:hs,col:function(aliases){return hs.findIndex(h=>aliases.indexOf(h)>=0);}};}
function readMembers_(){
 const sh=membersSheet_(),values=sh.getDataRange().getValues();if(values.length<2)return [];
 const hm=headerMap_(sh),id=hm.col(['membership id','membershipid','member id','id','membership no','membership number','member no','client id']),name=hm.col(['name','member name','client name','full name','customer name']),mobile=hm.col(['mobile','mobile number','phone','phone number','registered mobile','contact number','whatsapp number']),status=hm.col(['status','membership status','member status']),expiry=hm.col(['expiry','expiry date','membership expiry','valid till','valid until','end date']);
 if(id<0||name<0)throw new Error('MEMBERS sheet must contain Membership ID and Name columns.');
 return values.slice(1).map((r,i)=>({rowNumber:i+2,membershipId:digits_(r[id]),name:String(r[name]||'').trim(),mobile:mobile<0?'':digits_(r[mobile]),status:status<0||!String(r[status]).trim()?'active':String(r[status]).trim(),expiry:expiry<0?'':dateText_(r[expiry])})).filter(m=>m.membershipId);
}
function memberActive_(m){const s=String(m.status||'active').trim().toLowerCase();if(['inactive','expired','blocked','suspended','archived','false','0','no'].indexOf(s)>=0)return false;if(m.expiry&&/^\d{4}-\d{2}-\d{2}$/.test(m.expiry)&&m.expiry<Utilities.formatDate(new Date(),tz_(),'yyyy-MM-dd'))return false;return true;}
function publicMember_(m){return {membershipId:m.membershipId,name:m.name,mobile:m.mobile,status:memberActive_(m)?'active':'inactive',storedStatus:m.status,expiry:m.expiry};}
function findMember_(identity){const q=digits_(identity);if(!q)throw new Error('Enter a numeric membership ID or registered mobile number.');const ms=readMembers_();let m=ms.find(x=>x.membershipId===q);if(!m&&mobileKey_(q).length>=10)m=ms.find(x=>mobileKey_(x.mobile)===mobileKey_(q));if(!m)throw new Error('No member found for that membership ID or registered mobile number.');return m;}
function lookupMember_(identity){return {ok:true,member:publicMember_(findMember_(identity))};}
function withLock_(fn){const l=LockService.getScriptLock();l.waitLock(10000);try{return fn();}finally{l.releaseLock();}}
function attendanceRows_(){const sh=attendanceSheet_(),v=sh.getDataRange().getValues();if(v.length<2)return [];return v.slice(1).map((r,i)=>({rowNumber:i+2,membershipId:digits_(r[0]),name:String(r[1]||''),mobile:digits_(r[2]),date:dateText_(r[3]),clockIn:timeText_(r[4]),clockOut:timeText_(r[5]),duration:String(r[6]||''),status:String(r[7]||''),updatedAt:r[8] instanceof Date?Utilities.formatDate(r[8],tz_(),'yyyy-MM-dd HH:mm:ss'):String(r[8]||'')})).filter(r=>r.membershipId);}
function clockIn_(id){return withLock_(function(){const m=findMember_(id);if(!memberActive_(m))throw new Error('Membership inactive or expired. Clock-in was not recorded.');const rows=attendanceRows_();if(rows.some(r=>r.membershipId===m.membershipId&&!r.clockOut))throw new Error('This member already has an active clock-in. Clock out first.');const now=new Date();attendanceSheet_().appendRow([m.membershipId,m.name,m.mobile,now,now,'','','Clocked In',now]);SpreadsheetApp.flush();return {ok:true,message:'Clock-in saved to Google Sheets.',member:publicMember_(m)};});}
function clockOut_(id){return withLock_(function(){const m=findMember_(id),sh=attendanceSheet_(),rows=attendanceRows_();const a=rows.filter(r=>r.membershipId===m.membershipId&&!r.clockOut).sort((x,y)=>y.rowNumber-x.rowNumber)[0];if(!a)throw new Error('No active clock-in found. Clock-out was not recorded.');const now=new Date(),start=dateTime_(a.date,a.clockIn),minutes=start?Math.max(0,Math.floor((now-start)/60000)):0,duration=Math.floor(minutes/60)+'h '+minutes%60+'m';sh.getRange(a.rowNumber,6,1,4).setValues([[now,duration,'Clocked Out',now]]);SpreadsheetApp.flush();return {ok:true,message:'Clock-out saved to Google Sheets. Duration: '+duration+'.',member:publicMember_(m)};});}
function requireAdmin_(pin){const expected=props_().getProperty('ADMIN_PIN');if(!expected)throw new Error('Set ADMIN_PIN in Apps Script Project Settings first.');if(String(pin||'')!==expected)throw new Error('Incorrect admin PIN.');}
function searchAttendance_(f){f=f||{};const identity=digits_(f.identity||''),name=String(f.name||'').trim().toLowerCase(),date=String(f.date||''),month=String(f.month||''),time=String(f.time||'');return attendanceRows_().filter(r=>{if(date&&r.date!==date)return false;if(month&&r.date.slice(0,7)!==month)return false;if(time&&r.clockIn.indexOf(time)!==0&&r.clockOut.indexOf(time)!==0)return false;if(name&&r.name.toLowerCase().indexOf(name)<0)return false;if(identity&&r.membershipId!==identity&&mobileKey_(r.mobile)!==mobileKey_(identity))return false;return true;}).sort((a,b)=>(b.date+' '+b.clockIn).localeCompare(a.date+' '+a.clockIn)).map(r=>({date:r.date,membershipId:r.membershipId,name:r.name,mobile:r.mobile,clockIn:r.clockIn,clockOut:r.clockOut,duration:r.duration,status:r.status}));}
function memberHistory_(id){const m=findMember_(id),records=attendanceRows_().filter(r=>r.membershipId===m.membershipId).sort((a,b)=>(b.date+' '+b.clockIn).localeCompare(a.date+' '+a.clockIn)).map(r=>({date:r.date,clockIn:r.clockIn,clockOut:r.clockOut,duration:r.duration,status:r.status}));return {ok:true,member:publicMember_(m),records:records};}
function listMembers_(query){const q=String(query||'').trim().toLowerCase(),qd=digits_(q),qm=mobileKey_(q);return readMembers_().filter(m=>!q||m.name.toLowerCase().indexOf(q)>=0||(qd&&m.membershipId.indexOf(qd)>=0)||(qm.length>=4&&mobileKey_(m.mobile).indexOf(qm)>=0)).sort((a,b)=>Number(a.membershipId)-Number(b.membershipId)).map(publicMember_);}
function nextMembershipId_(){const ids=readMembers_().map(m=>Number(m.membershipId)).filter(n=>Number.isSafeInteger(n)&&n>0);return String(Math.max(0,...ids)+1);}
function writeMember_(rowNumber,member){
 const sh=membersSheet_(),hm=headerMap_(sh),id=hm.col(['membership id','membershipid','member id','id','membership no','membership number','member no','client id']),name=hm.col(['name','member name','client name','full name','customer name']),mobile=hm.col(['mobile','mobile number','phone','phone number','registered mobile','contact number','whatsapp number']),status=hm.col(['status','membership status','member status']),expiry=hm.col(['expiry','expiry date','membership expiry','valid till','valid until','end date']);
 if(id<0||name<0)throw new Error('MEMBERS sheet must contain Membership ID and Name columns.');
 if(rowNumber===null){const row=new Array(sh.getLastColumn()).fill('');row[id]=member.membershipId;row[name]=member.name;if(mobile>=0)row[mobile]=member.mobile;if(status>=0)row[status]=member.status;if(expiry>=0)row[expiry]=member.expiry?new Date(member.expiry+'T12:00:00'):'';sh.appendRow(row);}
 else {sh.getRange(rowNumber,id+1).setNumberFormat('@').setValue(member.membershipId);sh.getRange(rowNumber,name+1).setValue(member.name);if(mobile>=0)sh.getRange(rowNumber,mobile+1).setNumberFormat('@').setValue(member.mobile);if(status>=0)sh.getRange(rowNumber,status+1).setValue(member.status);if(expiry>=0)sh.getRange(rowNumber,expiry+1).setValue(member.expiry?new Date(member.expiry+'T12:00:00'):'');}
 SpreadsheetApp.flush();
}
function cleanMemberInput_(m,existing){
 const name=String(m.name==null?(existing?existing.name:''):m.name).trim();if(!name)throw new Error('Member name is required.');
 const mobile=digits_(m.mobile==null?(existing?existing.mobile:''):m.mobile);if(mobile&&mobile.length<10)throw new Error('Enter a valid registered mobile number with at least 10 digits.');
 const status=String(m.status==null?(existing?existing.status:'active'):m.status).trim()||'active';
 const expiry=String(m.expiry==null?(existing?existing.expiry:''):m.expiry).trim();if(expiry&&!/^\d{4}-\d{2}-\d{2}$/.test(expiry))throw new Error('Expiry must be a valid YYYY-MM-DD date.');
 return {name:name,mobile:mobile,status:status,expiry:expiry};
}
function createMember_(input){return withLock_(function(){const sh=membersSheet_();const fields=cleanMemberInput_(input,null),members=readMembers_();if(fields.mobile&&members.some(m=>mobileKey_(m.mobile)===mobileKey_(fields.mobile)))throw new Error('That mobile number is already assigned to a member.');const id=nextMembershipId_(),member={membershipId:id,name:fields.name,mobile:fields.mobile,status:fields.status,expiry:fields.expiry};writeMember_(null,member);return {ok:true,message:'Member created with membership ID '+id+'.',member:publicMember_(member),members:listMembers_('')};});}
function updateMember_(id,input){return withLock_(function(){const q=digits_(id),existing=readMembers_().find(m=>m.membershipId===q);if(!existing)throw new Error('Member not found.');const fields=cleanMemberInput_(input,existing),members=readMembers_();if(fields.mobile&&members.some(m=>m.membershipId!==q&&mobileKey_(m.mobile)===mobileKey_(fields.mobile)))throw new Error('That mobile number is already assigned to another member.');const updated={membershipId:existing.membershipId,name:fields.name,mobile:fields.mobile,status:fields.status,expiry:fields.expiry};writeMember_(existing.rowNumber,updated);return {ok:true,message:'Member '+q+' updated.',member:publicMember_(updated)};});}
function archiveMember_(id){return withLock_(function(){const q=digits_(id),m=readMembers_().find(x=>x.membershipId===q);if(!m)throw new Error('Member not found.');if(attendanceRows_().some(r=>r.membershipId===q&&!r.clockOut))throw new Error('This member has an active clock-in. Clock them out before archiving.');const updated={membershipId:m.membershipId,name:m.name,mobile:m.mobile,status:'archived',expiry:m.expiry};writeMember_(m.rowNumber,updated);return {ok:true,message:'Member archived; history and membership ID were preserved.',member:publicMember_(updated)};});}
function setupAttendanceSheets(){membersSheet_();attendanceSheet_();SpreadsheetApp.flush();return 'Sheet headers verified.';}
