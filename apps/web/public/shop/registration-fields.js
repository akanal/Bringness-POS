export const registrationLabels=Object.freeze({companyName:'Firmenname',ownerName:'Vor- und Nachname',email:'E-Mail',password:'Passwort',street:'Straße und Hausnummer',postalCode:'Postleitzahl',city:'Ort',country:'Ländercode (z. B. DE)'});
const passwordValid=value=>typeof value==='string'&&value.length>=6&&value.length<=128&&/\p{Lu}/u.test(value)&&/\p{Ll}/u.test(value)&&/\p{Nd}/u.test(value)&&/[^\p{L}\p{N}\s]/u.test(value);
const emailValid=value=>typeof value==='string'&&value.length<=254&&!/[\s\u0000-\u001f\u007f]/u.test(value)&&/^[^@]+@[^@]+$/u.test(value);
export function registrationFieldErrors(value,checks={}){
 if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).some(k=>!Object.hasOwn(registrationLabels,k)))return [{field:null,message:'Bitte nur die vorgesehenen Registrierungsangaben übermitteln.'}];
 const errors=[];
 for(const field of Object.keys(registrationLabels)){
  const v=Object.hasOwn(value,field)?value[field]:undefined;let message='';
  if(field==='password'){if(!(checks.passwordValid||passwordValid)(v))message='6 bis 128 Zeichen mit Groß- und Kleinbuchstaben, Zahl und Sonderzeichen verwenden.';}
  else if(field==='email'){if(typeof v!=='string'||/[\u0000-\u001f\u007f]/.test(v)||!(checks.emailValid||emailValid)(v.trim()))message='Bitte eine vollständige E-Mail-Adresse ohne Leerzeichen eingeben.';}
  else{const max=field==='ownerName'?100:500;if(typeof v!=='string'||v.trim().length<2||v.length>max||/[\u0000-\u001f\u007f]/.test(v))message=`Bitte 2 bis ${max} Zeichen ohne Zeilenumbrüche eingeben.`;}
  if(message)errors.push({field,message});
 }
 return errors;
}
