export interface SparkEmblemPicture {version:2;sourceHash:string;tagId:number;resources:string;png:string}
export function validSparkEmblemPicture(value:unknown,sourceHash:string,tagId:number,resources:string):value is SparkEmblemPicture{
  if(!value||typeof value!=='object')return false;
  const picture=value as SparkEmblemPicture;
  return picture.version===2&&/^[a-f0-9]{64}$/i.test(sourceHash)&&picture.sourceHash===sourceHash
    &&Number.isSafeInteger(tagId)&&tagId>=0&&tagId<=0xffffffff&&picture.tagId===tagId
    &&typeof resources==='string'&&resources.length<=16384&&picture.resources===resources&&typeof picture.png==='string'
    &&picture.png.startsWith('data:image/png;base64,iVBORw0KGgo')&&picture.png.length<=180000;
}
const portraitKey='guilty-spark-monitor-picture-v3';
export function readSparkEmblemPicture(scope:string):SparkEmblemPicture|null {
  try{
    const raw=localStorage.getItem(portraitKey);if(!raw||raw.length>200000)return null;
    const stored=JSON.parse(raw),p=stored.picture;
    return stored.scope===scope&&p&&validSparkEmblemPicture(p,p.sourceHash,p.tagId,p.resources)?p:null;
  }catch{return null;}
}
/** Keep the portrait outside the bounded general preference record. It is a
 * decorative capture of a previously verified model, not a native asset cache. */
export function saveSparkEmblemPicture(scope:string,picture:SparkEmblemPicture):boolean {
  if(!validSparkEmblemPicture(picture,picture.sourceHash,picture.tagId,picture.resources))return false;
  try{localStorage.setItem(portraitKey,JSON.stringify({scope,picture}));return true;}catch{return false;}
}
