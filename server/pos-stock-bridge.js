import pg from 'pg';
import {createPosStockHandler,migratePosStockBridge} from './pos-stock-bridge-core.js';
const pool=new pg.Pool({connectionString:process.env.DATABASE_URL,ssl:process.env.NODE_ENV==='production'?{rejectUnauthorized:false}:false});
export const handlePosStockBridge=createPosStockHandler(pool);
export const migratePosStockEvents=()=>migratePosStockBridge(pool);
