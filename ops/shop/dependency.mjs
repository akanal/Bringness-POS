import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
export function dependency(name,variable){
 if(process.env[variable])return process.env[variable];
 try{return require.resolve(name);}catch{throw Error(`Missing local test dependency ${name}. Run npm --prefix ops/shop install or set ${variable}.`);}
}
