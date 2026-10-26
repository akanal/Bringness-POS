// Shared, expandable marketplace taxonomy. Categories imply no inventory or sale approval.
export const departments = Object.freeze([
  {
    "name": "Software",
    "description": "Programme, Apps und digitale Produkte"
  },
  {
    "name": "Apps & Spiele",
    "description": "Entdecken in Software",
    "parent": "Software"
  },
  {
    "name": "Bürosoftware",
    "description": "Entdecken in Software",
    "parent": "Software"
  },
  {
    "name": "Kreativsoftware",
    "description": "Entdecken in Software",
    "parent": "Software"
  },
  {
    "name": "Lernen & Wissen",
    "description": "Entdecken in Software",
    "parent": "Software"
  },
  {
    "name": "Hardware",
    "description": "Computer, Geräte und Technik"
  },
  {
    "name": "Computer & Zubehör",
    "description": "Entdecken in Hardware",
    "parent": "Hardware"
  },
  {
    "name": "Tablets & E-Reader",
    "description": "Entdecken in Hardware",
    "parent": "Hardware"
  },
  {
    "name": "Drucker & Scanner",
    "description": "Entdecken in Hardware",
    "parent": "Hardware"
  },
  {
    "name": "Netzwerk & Speicher",
    "description": "Entdecken in Hardware",
    "parent": "Hardware"
  },
  {
    "name": "Zubehör",
    "description": "Ergänzungen für Alltag und Beruf"
  },
  {
    "name": "Koffer, Rucksäcke & Taschen",
    "description": "Entdecken in Zubehör",
    "parent": "Zubehör"
  },
  {
    "name": "Handyzubehör",
    "description": "Entdecken in Zubehör",
    "parent": "Zubehör"
  },
  {
    "name": "Kabel & Adapter",
    "description": "Entdecken in Zubehör",
    "parent": "Zubehör"
  },
  {
    "name": "Elektronik",
    "description": "Unterhaltung und smarte Technik"
  },
  {
    "name": "Elektronik & Foto",
    "description": "Entdecken in Elektronik",
    "parent": "Elektronik"
  },
  {
    "name": "Kamera & Foto",
    "description": "Entdecken in Elektronik",
    "parent": "Elektronik"
  },
  {
    "name": "Smart-Home & Sprachassistenten",
    "description": "Entdecken in Elektronik",
    "parent": "Elektronik"
  },
  {
    "name": "TV, Video & Heimkino",
    "description": "Entdecken in Elektronik",
    "parent": "Elektronik"
  },
  {
    "name": "Elektro-Großgeräte",
    "description": "Entdecken in Elektronik",
    "parent": "Elektronik"
  },
  {
    "name": "Games & Konsolen",
    "description": "Entdecken in Elektronik",
    "parent": "Elektronik"
  },
  {
    "name": "Haus & Garten",
    "description": "Wohnen, Haushalt und draußen"
  },
  {
    "name": "Baumarkt",
    "description": "Entdecken in Haus & Garten",
    "parent": "Haus & Garten"
  },
  {
    "name": "Beleuchtung",
    "description": "Entdecken in Haus & Garten",
    "parent": "Haus & Garten"
  },
  {
    "name": "Garten",
    "description": "Entdecken in Haus & Garten",
    "parent": "Haus & Garten"
  },
  {
    "name": "Küche, Haushalt & Wohnen",
    "description": "Entdecken in Haus & Garten",
    "parent": "Haus & Garten"
  },
  {
    "name": "Möbel & Dekoration",
    "description": "Entdecken in Haus & Garten",
    "parent": "Haus & Garten"
  },
  {
    "name": "Mode & Accessoires",
    "description": "Kleidung, Schuhe und mehr"
  },
  {
    "name": "Damenmode, Schuhe & Schmuck",
    "description": "Entdecken in Mode & Accessoires",
    "parent": "Mode & Accessoires"
  },
  {
    "name": "Herrenmode, Schuhe & Schmuck",
    "description": "Entdecken in Mode & Accessoires",
    "parent": "Mode & Accessoires"
  },
  {
    "name": "Mädchenmode & Schuhe",
    "description": "Entdecken in Mode & Accessoires",
    "parent": "Mode & Accessoires"
  },
  {
    "name": "Jungenmode & Schuhe",
    "description": "Entdecken in Mode & Accessoires",
    "parent": "Mode & Accessoires"
  },
  {
    "name": "Babykleidung & Schuhe",
    "description": "Entdecken in Mode & Accessoires",
    "parent": "Mode & Accessoires"
  },
  {
    "name": "Uhren & Schmuck",
    "description": "Entdecken in Mode & Accessoires",
    "parent": "Mode & Accessoires"
  },
  {
    "name": "Beauty & Pflege",
    "description": "Pflege und Wohlbefinden"
  },
  {
    "name": "Drogerie & Körperpflege",
    "description": "Entdecken in Beauty & Pflege",
    "parent": "Beauty & Pflege"
  },
  {
    "name": "Kosmetik",
    "description": "Entdecken in Beauty & Pflege",
    "parent": "Beauty & Pflege"
  },
  {
    "name": "Parfum & Düfte",
    "description": "Entdecken in Beauty & Pflege",
    "parent": "Beauty & Pflege"
  },
  {
    "name": "Sport & Freizeit",
    "description": "Aktiv sein und Neues entdecken"
  },
  {
    "name": "Fitness & Training",
    "description": "Entdecken in Sport & Freizeit",
    "parent": "Sport & Freizeit"
  },
  {
    "name": "Outdoor & Camping",
    "description": "Entdecken in Sport & Freizeit",
    "parent": "Sport & Freizeit"
  },
  {
    "name": "Fahrräder & Radsport",
    "description": "Entdecken in Sport & Freizeit",
    "parent": "Sport & Freizeit"
  },
  {
    "name": "Auto & Mobilität",
    "description": "Unterwegs und rund ums Fahrzeug"
  },
  {
    "name": "Auto & Motorrad",
    "description": "Entdecken in Auto & Mobilität",
    "parent": "Auto & Mobilität"
  },
  {
    "name": "Fahrzeugteile & Pflege",
    "description": "Entdecken in Auto & Mobilität",
    "parent": "Auto & Mobilität"
  },
  {
    "name": "Bücher & Medien",
    "description": "Lesen, hören und entdecken"
  },
  {
    "name": "Bücher",
    "description": "Entdecken in Bücher & Medien",
    "parent": "Bücher & Medien"
  },
  {
    "name": "Hörbücher",
    "description": "Entdecken in Bücher & Medien",
    "parent": "Bücher & Medien"
  },
  {
    "name": "E-Books",
    "description": "Entdecken in Bücher & Medien",
    "parent": "Bücher & Medien"
  },
  {
    "name": "DVD & Blu-ray",
    "description": "Entdecken in Bücher & Medien",
    "parent": "Bücher & Medien"
  },
  {
    "name": "Musik-CDs & Vinyl",
    "description": "Entdecken in Bücher & Medien",
    "parent": "Bücher & Medien"
  },
  {
    "name": "Musik-Downloads",
    "description": "Entdecken in Bücher & Medien",
    "parent": "Bücher & Medien"
  },
  {
    "name": "Zeitschriften",
    "description": "Entdecken in Bücher & Medien",
    "parent": "Bücher & Medien"
  },
  {
    "name": "Spielzeug & Hobby",
    "description": "Spielen, kreativ sein und sammeln"
  },
  {
    "name": "Spielzeug",
    "description": "Entdecken in Spielzeug & Hobby",
    "parent": "Spielzeug & Hobby"
  },
  {
    "name": "Basteln & Kreativbedarf",
    "description": "Entdecken in Spielzeug & Hobby",
    "parent": "Spielzeug & Hobby"
  },
  {
    "name": "Musikinstrumente & DJ-Equipment",
    "description": "Entdecken in Spielzeug & Hobby",
    "parent": "Spielzeug & Hobby"
  },
  {
    "name": "Büro & Gewerbe",
    "description": "Ausstattung für Arbeit und Betrieb"
  },
  {
    "name": "Bürobedarf & Schreibwaren",
    "description": "Entdecken in Büro & Gewerbe",
    "parent": "Büro & Gewerbe"
  },
  {
    "name": "Gewerbe, Industrie & Wissenschaft",
    "description": "Entdecken in Büro & Gewerbe",
    "parent": "Büro & Gewerbe"
  },
  {
    "name": "Lebensmittel",
    "description": "Lebensmittel und Getränke"
  },
  {
    "name": "Lebensmittel & Getränke",
    "description": "Entdecken in Lebensmittel",
    "parent": "Lebensmittel"
  },
  {
    "name": "Kaffee & Tee",
    "description": "Entdecken in Lebensmittel",
    "parent": "Lebensmittel"
  },
  {
    "name": "Tierbedarf",
    "description": "Alles rund ums Tier"
  },
  {
    "name": "Hundebedarf",
    "description": "Entdecken in Tierbedarf",
    "parent": "Tierbedarf"
  },
  {
    "name": "Katzenbedarf",
    "description": "Entdecken in Tierbedarf",
    "parent": "Tierbedarf"
  },
  {
    "name": "Kleintiere, Vögel & Aquaristik",
    "description": "Entdecken in Tierbedarf",
    "parent": "Tierbedarf"
  },
  {
    "name": "Baby & Kind",
    "description": "Ausstattung für die Kleinsten"
  },
  {
    "name": "Baby",
    "description": "Entdecken in Baby & Kind",
    "parent": "Baby & Kind"
  },
  {
    "name": "Kinderwagen & Unterwegs",
    "description": "Entdecken in Baby & Kind",
    "parent": "Baby & Kind"
  },
  {
    "name": "Pflege & Ernährung",
    "description": "Entdecken in Baby & Kind",
    "parent": "Baby & Kind"
  },
  {
    "name": "Dienstleistungen",
    "description": "Leistungen für Zuhause und Unternehmen"
  },
  {
    "name": "Haushalt & Handwerk",
    "description": "Entdecken in Dienstleistungen",
    "parent": "Dienstleistungen"
  },
  {
    "name": "Business-Dienstleistungen",
    "description": "Entdecken in Dienstleistungen",
    "parent": "Dienstleistungen"
  },
  {
    "name": "Handgemachtes",
    "description": "Handwerk und individuelle Kreationen"
  },
  {
    "name": "Handgemachte Geschenke",
    "description": "Entdecken in Handgemachtes",
    "parent": "Handgemachtes"
  },
  {
    "name": "Personalisierte Artikel",
    "description": "Entdecken in Handgemachtes",
    "parent": "Handgemachtes"
  },
  {
    "name": "Gutscheine",
    "description": "Geschenkideen und Gutscheine"
  },
  {
    "name": "Geschenkgutscheine",
    "description": "Entdecken in Gutscheine",
    "parent": "Gutscheine"
  },
  {
    "name": "Sonstiges",
    "description": "Weitere Waren und Angebote"
  },
  {
    "name": "Retouren & B-Ware",
    "description": "Entdecken in Sonstiges",
    "parent": "Sonstiges"
  },
  {
    "name": "Sammlerstücke",
    "description": "Entdecken in Sonstiges",
    "parent": "Sonstiges"
  }
].map(Object.freeze));
export const rootDepartments=Object.freeze(departments.filter(item=>!item.parent));
export const categories=Object.freeze(["Alle",...departments.map(item=>item.name)]);
export function categoryMatches(assigned,selected){return selected==='Alle'||assigned===selected||departments.find(item=>item.name===assigned)?.parent===selected;}
