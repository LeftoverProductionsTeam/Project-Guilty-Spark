export const DEFAULT_HISTORY_LIMIT=100;
export const HISTORY_LIMIT_KEY='guilty-spark-undo-limit-v1';
export function validHistoryLimit(value:unknown):value is number{return typeof value==='number'&&Number.isInteger(value)&&value>=1&&value<=1000;}
export function readHistoryLimit(){try{const raw=localStorage.getItem(HISTORY_LIMIT_KEY);if(raw!==null){const value=Number(raw);if(validHistoryLimit(value))return value;}}catch{}return DEFAULT_HISTORY_LIMIT;}
export function saveHistoryLimit(value:number){if(!validHistoryLimit(value))throw new Error('Undo history must be an integer from 1 to 1000.');try{localStorage.setItem(HISTORY_LIMIT_KEY,String(value));}catch{}}
