// Shared by the protected composer preview and the SMTP renderer.
const escape=value=>String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function mailTextHtml(text){
 return String(text).split('\n\n').map(paragraph=>'<p style="margin:0 0 20px">'+paragraph.split(/(https:\/\/[^\s<>"']+)/g).map(part=>{
  if(!part.startsWith('https://'))return escape(part).replaceAll('\n','<br>');
  try{const url=new URL(part);if(url.protocol==='https:'&&!url.username&&!url.password)return '<a style="color:#a94208;overflow-wrap:anywhere" href="'+escape(part)+'">'+escape(part)+'</a>';}catch{}
  return escape(part);
 }).join('')+'</p>').join('');
}
export function renderBringnessMail({text='',html,logoUrl='cid:bringness-logo@bringness.de'}={}){
 const content=html||mailTextHtml(text);
 return '<!doctype html><html lang="de"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body style="margin:0;background:#f6f8fb;color:#102235;font-family:Arial,sans-serif"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f6f8fb"><tr><td align="center" style="padding:28px 12px"><table role="presentation" width="600" cellpadding="0" cellspacing="0" style="width:100%;max-width:600px;background:#fff;border:1px solid #e3e8ed;border-radius:16px"><tr><td style="padding:28px 32px;background:#fff8ef;border-bottom:4px solid #ff7628;border-radius:16px 16px 0 0"><img src="'+escape(logoUrl)+'" width="199" height="53" alt="Bringness" style="display:block;max-width:100%;height:auto"></td></tr><tr><td style="padding:32px;font-size:16px;line-height:1.65;overflow-wrap:anywhere">'+content+'</td></tr><tr><td style="padding:24px 32px;background:#071a2b;color:#fff;font-size:13px;line-height:1.7;border-radius:0 0 16px 16px">Bei Fragen schreiben Sie bitte an <a href="mailto:info@bringness.de" style="color:#fff">info@bringness.de</a>.<br>Bringness · <a href="https://bringness-pos.de" style="color:#fff">bringness-pos.de</a></td></tr></table></td></tr></table></body></html>';
}
