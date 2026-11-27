// A single fixed icon per sector. Operators select a business type, never an icon.
export const businessSectors = Object.freeze([
  {id:'restaurant',label:'Restaurant / Pizzeria',icon:'🍕'},
  {id:'grocery',label:'Lebensmittel',icon:'🥬'},
  {id:'newsstand',label:'Kiosk & Presse',icon:'📰'},
  {id:'clothing',label:'Bekleidung',icon:'👕'},
  {id:'electronics',label:'Elektronik',icon:'💻'},
  {id:'flowers',label:'Blumen',icon:'💐'}
].map(Object.freeze));
export const sectorFor = id => businessSectors.find(item=>item.id===id) || null;
