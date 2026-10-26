// Preserve retired public IDs so a catalogue removal does not silently erase favorites.
export function favoriteIds(value){return Array.isArray(value)?[...new Set(value.filter(id=>typeof id==='string'&&/^[a-z0-9-]{1,80}$/.test(id)))].slice(0,100):[];}
export function readFavoriteIds(storage,key){try{const raw=storage.getItem(key)||'[]';if(raw.length>10000)return [];return favoriteIds(JSON.parse(raw));}catch{return [];}}
export function writeFavoriteIds(storage,key,ids){try{storage.setItem(key,JSON.stringify(favoriteIds(ids)));return true;}catch{return false;}}
